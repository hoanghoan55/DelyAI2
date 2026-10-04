import type { Diagnostic } from '@/timeline/diagnostics'

export type AttemptRecord = { attempt: number; ok: boolean; at: string; diagnostics?: Diagnostic[]; error?: string }

/** A validation failure whose previous output + diagnostics go back to the model (spec §4 rule 2). */
export class RetryableValidationError extends Error {
  constructor(message: string, readonly diagnostics: Diagnostic[], readonly output?: unknown) {
    super(message); this.name = 'RetryableValidationError'
  }
}

export class StageRetryExhausted extends Error {
  constructor(readonly stage: string, readonly attempts: AttemptRecord[]) {
    super(`${stage}: all ${attempts.length} attempts failed — ${attempts.map((a) => a.error ?? 'invalid').join('; ')}`)
    this.name = 'StageRetryExhausted'
  }
}

export type RetryResult<T> = { value: T; attempts: AttemptRecord[] }
export type PreviousAttempt = { output: unknown; diagnostics: Diagnostic[] } | null

export async function withBoundedRetry<T>(
  runAttempt: (attempt: number, previous: PreviousAttempt) => Promise<T>,
  options: { maxAttempts?: number; stage?: string } = {},
): Promise<RetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? 3 // spec §4: 3 per stage per run
  const stage = options.stage ?? 'stage'
  const attempts: AttemptRecord[] = []
  let previous: PreviousAttempt = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await runAttempt(attempt, previous)
      attempts.push({ attempt, ok: true, at: new Date().toISOString() })
      return { value, attempts }
    } catch (err) {
      const isValidation = err instanceof RetryableValidationError
      attempts.push({
        attempt,
        ok: false,
        at: new Date().toISOString(),
        diagnostics: isValidation ? err.diagnostics : undefined,
        error: err instanceof Error ? err.message : String(err),
      })
      previous = isValidation ? { output: err.output ?? null, diagnostics: err.diagnostics } : previous
    }
  }
  throw new StageRetryExhausted(stage, attempts)
}
