import type { SceneDSL } from '@/video-engine/schema'
import { parseSceneDsl } from '@/video-engine/schema'
import type { VisualDirector, VisualDirectorInput } from '@/ai/visual/contract'
import { geminiGenerateJson } from './client'
import { withBoundedRetry, RetryableValidationError, type AttemptRecord } from './retry'
import { buildVisualPrompt, VISUAL_RESPONSE_SCHEMA } from './prompts/visual'
import type { Diagnostic } from '@/timeline/diagnostics'

/**
 * `parseSceneDsl` THROWS on Zod failure (it has no result object and no
 * `.issues`), so the thrown message — which carries the formatted issue list
 * `"Invalid scene DSL:\n  path: message"` — is mapped to one diagnostic per
 * issue line, exactly the `path: message` shape the brief's Step 6 builds from
 * `err.issues`. If the format ever drifts, the whole message is one diagnostic.
 */
function zodDiagnosticsFor(candidate: unknown, err: unknown): Diagnostic[] {
  const message = err instanceof Error ? err.message : String(err)
  const issueLines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== 'Invalid scene DSL:')
  const sceneId =
    typeof (candidate as { sceneId?: unknown })?.sceneId === 'string'
      ? (candidate as { sceneId: string }).sceneId
      : undefined
  return (issueLines.length > 0 ? issueLines : [message]).map((m) => ({
    severity: 'error' as const,
    code: 'VISUAL_INVALID',
    sceneId,
    message: m,
  }))
}

export function createGeminiVisualDirector(deps: {
  diagnose: (scenes: SceneDSL[]) => Diagnostic[]
  fetchImpl?: typeof fetch
  apiKey?: string
  model?: string
}): VisualDirector {
  return {
    async direct(input: VisualDirectorInput, onAttempt?: (record: AttemptRecord) => void): Promise<SceneDSL[]> {
      const result = await withBoundedRetry<SceneDSL[]>(
        // Spec §4 rule 2: a retry message carries the previous output + diagnostics
        // back to the model. `withBoundedRetry` only refreshes `previous` for
        // RetryableValidationError, so this block appears exactly when an attempt
        // was rejected (Zod or an error-severity diagnose diagnostic).
        async (attempt, previous) => {
          const prompt = previous
            ? [
                buildVisualPrompt(input),
                '',
                `Previous attempt #${attempt - 1} output:`,
                JSON.stringify(previous.output),
                'Diagnostics that rejected it:',
                ...previous.diagnostics.map((d) => `- [${d.code}] ${d.message}`),
                'Fix ONLY what the diagnostics name. Return the full corrected JSON scene list.',
              ].join('\n')
            : buildVisualPrompt(input)
          const raw = await geminiGenerateJson(
            { prompt, responseSchema: VISUAL_RESPONSE_SCHEMA, model: deps.model },
            { apiKey: deps.apiKey, fetchImpl: deps.fetchImpl },
          )
          // The response schema asks Gemini for `{scenes: [...]}`, but the brief's
          // tests (and some models) answer with a bare scene array — both shapes
          // normalize to a scene list here; anything else is a validation failure.
          const rawScenes = Array.isArray(raw) ? raw : (raw as { scenes?: unknown })?.scenes
          if (!Array.isArray(rawScenes)) {
            throw new RetryableValidationError(
              'Response is not {scenes: [...]}',
              [{ severity: 'error', code: 'VISUAL_INVALID', message: 'missing scenes array' }],
              raw,
            )
          }
          const scenes: SceneDSL[] = []
          const zodDiagnostics: Diagnostic[] = []
          for (const candidate of rawScenes) {
            try {
              scenes.push(parseSceneDsl(candidate))
            } catch (err) {
              zodDiagnostics.push(...zodDiagnosticsFor(candidate, err))
            }
          }
          if (zodDiagnostics.length > 0) {
            throw new RetryableValidationError('Scene DSL failed Zod validation', zodDiagnostics, raw)
          }

          const compileDiagnostics = deps.diagnose(scenes).filter((d) => d.severity === 'error')
          if (compileDiagnostics.length > 0) {
            throw new RetryableValidationError('Scene DSL failed compilation diagnostics', compileDiagnostics, raw)
          }
          return scenes
        },
        { stage: 'visual' },
      )
      for (const record of result.attempts) onAttempt?.(record)
      return result.value
    },
  }
}
