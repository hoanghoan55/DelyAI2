import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { measureAudioDuration } from './tts/remote'

const execAsync = promisify(exec)

export type RenderVideoOptions = {
  runDir: string
  runId: string
  repoRoot: string
  propsPath: string
  totalFrames: number
  fps: number
  exec?: (command: string, args: string[], options: { cwd: string; shell: boolean }) => Promise<{ code: number; stdout: string; stderr: string }>
  measureOutput?: (filePath: string) => Promise<number>
}

const posix = (p: string) => p.split(path.sep).join('/')

export async function renderVideo(options: RenderVideoOptions): Promise<{ videoPath: string }> {
  const { runDir, runId, repoRoot, propsPath, totalFrames, fps } = options
  const measure = options.measureOutput ?? measureAudioDuration
  // Default exec: one shell line (Windows `npx` resolution), args quoted when they
  // contain spaces; a non-zero exit arrives as a rejected execFile/exec — map it back
  // to { code } so the RENDER_FAILED branch below actually runs.
  const exec = options.exec ?? (async (command: string, args: string[], opts: { cwd: string; shell: boolean }) => {
    const line = [command, ...args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))].join(' ')
    try {
      // @types/node narrows ExecOptions.shell to `string`, but Node's runtime
      // accepts `boolean` (normalizeExecArgs defaults to `shell: true`) — the
      // cast keeps the seam's `{ shell: boolean }` contract intact.
      const { stdout, stderr } = await execAsync(line, {
        cwd: opts.cwd, shell: opts.shell as unknown as string, maxBuffer: 32 * 1024 * 1024,
      })
      return { code: 0, stdout, stderr }
    } catch (err) {
      const e = err as { code?: number | string; stdout?: string; stderr?: string }
      return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(err) }
    }
  })

  // 1) public/ copy — Remotion serves only public/ + staticFile (spec §8; absolute paths unsupported)
  const voiceSrc = path.join(runDir, 'voice')
  const mp3s = fs.existsSync(voiceSrc) ? fs.readdirSync(voiceSrc).filter((f) => f.endsWith('.mp3')) : []
  if (mp3s.length === 0) throw new Error('RENDER_NO_AUDIO: no voice/*.mp3 to publish into public/')
  const publicRunDir = path.join(repoRoot, 'public', 'generated', runId)
  fs.rmSync(publicRunDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(publicRunDir, 'voice'), { recursive: true })
  for (const mp3 of mp3s) fs.copyFileSync(path.join(voiceSrc, mp3), path.join(publicRunDir, 'voice', mp3))

  // 2) spawn — args are path-safe (runId is /^[\w-]+$/, enforced by the orchestrator)
  const relVideo = posix(path.relative(repoRoot, path.join(runDir, 'video.mp4')))
  const relProps = posix(path.relative(repoRoot, propsPath))
  const args = ['remotion', 'render', 'remotion/index.ts', 'DeLyDemo', relVideo, '--props', relProps]
  const result = await exec('npx', args, { cwd: repoRoot, shell: true })
  if (result.code !== 0) {
    throw new Error(`RENDER_FAILED (exit ${result.code}): ${(result.stderr || result.stdout).slice(-500)}`)
  }

  // 3) verify output + duration (spec §9.3's assertion, enforced at the source)
  const videoPath = path.join(runDir, 'video.mp4')
  const stat = fs.existsSync(videoPath) ? fs.statSync(videoPath) : null
  if (!stat || stat.size === 0) throw new Error(`RENDER_NO_OUTPUT: ${videoPath} missing or empty`)
  const expected = totalFrames / fps
  const measured = await measure(videoPath)
  if (Math.abs(measured - expected) > 0.5) {
    throw new Error(`RENDER_DURATION_MISMATCH: expected ${expected.toFixed(3)}s (frames/fps) measured ${measured.toFixed(3)}s`)
  }

  // 4) cleanup the public mirror (render already bundled it)
  try { fs.rmSync(publicRunDir, { recursive: true, force: true }) } catch { /* best effort */ }

  return { videoPath }
}
