import type { Brief, StoryDirector, StoryPlan } from '@/ai/story/contract'
import { StoryPlanSchema } from '@/ai/story/schema'
import { geminiGenerateJson } from './client'
import { withBoundedRetry, RetryableValidationError, type AttemptRecord } from './retry'
import { buildStoryPrompt, STORY_RESPONSE_SCHEMA } from './prompts/story'
import type { Diagnostic } from '@/timeline/diagnostics'

export function createGeminiStoryDirector(deps: { fetchImpl?: typeof fetch; apiKey?: string; model?: string } = {}): StoryDirector {
  return {
    async direct(brief: Brief, onAttempt?: (record: AttemptRecord) => void): Promise<StoryPlan> {
      const result = await withBoundedRetry<StoryPlan>(
        // Spec §4 rule 2: a retry message carries the previous output + diagnostics back
        // to the model. `withBoundedRetry` only updates `previous` for validation errors,
        // so this feedback block appears exactly when Zod rejected an attempt.
        async (attempt, previous) => {
          const prompt = previous
            ? [
                buildStoryPrompt(brief),
                '',
                `Attempt ${attempt}: your previous output failed Zod validation. Fix ONLY what the diagnostics name and return the full corrected JSON.`,
                'Diagnostics that rejected it:',
                ...previous.diagnostics.map((d) => `- [${d.code}] ${d.message}`),
                'Previous output:',
                JSON.stringify(previous.output),
              ].join('\n')
            : buildStoryPrompt(brief)
          const raw = await geminiGenerateJson(
            { prompt, responseSchema: STORY_RESPONSE_SCHEMA, model: deps.model },
            { apiKey: deps.apiKey, fetchImpl: deps.fetchImpl },
          )
          const parsed = StoryPlanSchema.safeParse(raw)
          if (!parsed.success) {
            const diagnostics: Diagnostic[] = parsed.error.issues.map((issue) => ({
              severity: 'error' as const,
              code: 'STORY_INVALID',
              message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
            }))
            throw new RetryableValidationError('StoryPlan failed Zod validation', diagnostics, raw)
          }
          return parsed.data
        },
        { stage: 'story' },
      )
      for (const record of result.attempts) onAttempt?.(record)
      return result.value
    },
  }
}
