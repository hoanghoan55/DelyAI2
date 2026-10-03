import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import type { IncomingMessage } from 'node:http'

type RunState = { stage: string; status: 'running' | 'done' | 'failed'; videoUrl?: string; error?: string }

export default defineConfig({
  plugins: [
    react(),
    // Dev-only HTTP endpoint (spec §8): `configureServer` runs only when Vite
    // serves, never during `vite build`. Vite invokes this hook exclusively
    // from the plugin array, so the middleware lives on an inline plugin.
    {
      name: 'delyai:generate-api',
      configureServer(server) {
        const runs = new Map<string, RunState>()
        let backendsRegistered = false

        const readBody = (req: IncomingMessage) =>
          new Promise<string>((resolve, reject) => {
            let data = ''
            req.on('data', (chunk) => { data += chunk })
            req.on('end', () => resolve(data))
            req.on('error', reject)
          })

        // Registered FIRST: Connect matches prefixes in order, and
        // "/api/generate" is a prefix of "/api/generate/status".
        server.middlewares.use('/api/generate/status', (req, res) => {
          const runId = new URL(req.url ?? '', 'http://localhost').searchParams.get('runId') ?? ''
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(runs.get(runId) ?? { stage: 'unknown', status: 'unknown' }))
        })

        server.middlewares.use('/api/generate', async (req, res) => {
          res.setHeader('content-type', 'application/json')
          if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST only' })); return }
          try {
            const body = JSON.parse(await readBody(req)) as { topic?: string; targetSeconds?: number; language?: string; runId?: string }
            if (!body.topic?.trim()) { res.statusCode = 400; res.end(JSON.stringify({ error: 'topic required' })); return }

            // Load project modules through Vite's pipeline (aliases/TS resolve here;
            // a static import inside this config file would bypass the alias).
            const { generateProject } = await server.ssrLoadModule('/src/ai/generate.ts')
            const { registerBackends } = await server.ssrLoadModule('/src/video-engine/runtime/index.ts')
            if (!backendsRegistered) { registerBackends(); backendsRegistered = true } // idempotent guard — double registration throws

            // `server.config.cwd` does not exist on ResolvedConfig in Vite 5;
            // `envDir` is loadEnv's own directory (defaults to the project root).
            const env = loadEnv(server.config.mode, server.config.envDir, '')
            for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'TTS_API_KEY', 'TTS_BASE_URL', 'TTS_VOICE', 'WHISPER_MODEL']) {
              if (env[key]) process.env[key] = env[key]
            }

            const runId = body.runId ?? `run-dev-${Date.now().toString(36)}`
            if (!/^[\w-]+$/.test(runId)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'runId must match /^[\\w-]+$/' })); return }
            runs.set(runId, { stage: 'story', status: 'running' })

            void generateProject({
              brief: { topic: body.topic, targetSeconds: Number(body.targetSeconds) || 30, language: body.language ?? 'vi' },
              runId,
              onProgress: (e: { stage: string }) => { const state = runs.get(runId); if (state?.status === 'running') state.stage = e.stage },
            })
              .then(() => runs.set(runId, { stage: 'done', status: 'done', videoUrl: `/generated/${runId}/video.mp4` }))
              .catch((err: unknown) => runs.set(runId, { stage: 'fail', status: 'failed', error: err instanceof Error ? err.message : String(err) }))

            res.end(JSON.stringify({ runId }))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
          }
        })
      },
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  optimizeDeps: { exclude: ['@remotion/player'] },
})
