import { describe, it, expect, vi } from 'vitest'
import { withBoundedRetry, RetryableValidationError, StageRetryExhausted, type PreviousAttempt } from '@/ai/gemini/retry'

const diag = (m: string) => ({ severity: 'error' as const, code: 'TEST', message: m })

describe('withBoundedRetry', () => {
  it('retries validation failures up to 3 attempts, passing previous output + diagnostics forward', async () => {
    const runAttempt = vi.fn(async (attempt: number, prev: unknown) => {
      if (attempt === 1) throw new RetryableValidationError('bad v1', [diag('first')], { raw: 'v1' })
      if (attempt === 2) throw new RetryableValidationError('bad v2', [diag('second')], { raw: 'v2' })
      expect(prev).toEqual({ output: { raw: 'v2' }, diagnostics: [diag('second')] })
      return 'ok'
    })
    const result = await withBoundedRetry(runAttempt, { stage: 'visual' })
    expect(result.value).toBe('ok')
    expect(result.attempts).toHaveLength(3)
    expect(result.attempts[0]).toMatchObject({ attempt: 1, ok: false })
    expect(result.attempts[0]!.diagnostics).toEqual([diag('first')])
    expect(result.attempts[2]).toMatchObject({ attempt: 3, ok: true })
  })

  it('first-try success records exactly one attempt', async () => {
    const result = await withBoundedRetry(async () => 'fast')
    expect(result.value).toBe('fast')
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0]!.ok).toBe(true)
  })

  it('exhaustion throws StageRetryExhausted carrying every attempt record', async () => {
    const runAttempt = vi.fn(async (attempt: number) => {
      throw new RetryableValidationError(`bad ${attempt}`, [diag(`d${attempt}`)])
    })
    await expect(withBoundedRetry(runAttempt, { stage: 'story' }))
      .rejects.toMatchObject({ name: 'StageRetryExhausted', stage: 'story' })
    try {
      await withBoundedRetry(runAttempt, { stage: 'story' })
    } catch (e) {
      const err = e as StageRetryExhausted
      expect(err.attempts).toHaveLength(3)
      expect(err.attempts.every((a) => a.ok === false)).toBe(true)
      expect(err.attempts[2]!.diagnostics).toEqual([diag('d3')])
    }
  })

  it('transport (non-validation) errors also retry, then exhaust', async () => {
    // R8: real runAttempt signature. Both params land in the thrown message — an expect()
    // inside the mock would be swallowed by the retry loop itself.
    const runAttempt = vi.fn(async (attempt: number, previous: PreviousAttempt) => {
      throw new Error(`socket hang up (attempt ${attempt}; previous=${previous === null ? 'null' : 'set'})`)
    })
    await expect(withBoundedRetry(runAttempt)).rejects.toBeInstanceOf(StageRetryExhausted)
    expect(runAttempt).toHaveBeenCalledTimes(3)
  })

  it('maxAttempts is configurable', async () => {
    const runAttempt = vi.fn(async (attempt: number, previous: PreviousAttempt) => {
      throw new RetryableValidationError(`x (attempt ${attempt}; previous=${previous === null ? 'null' : 'set'})`, [])
    })
    await expect(withBoundedRetry(runAttempt, { maxAttempts: 2 })).rejects.toBeInstanceOf(StageRetryExhausted)
    expect(runAttempt).toHaveBeenCalledTimes(2)
  })
})
