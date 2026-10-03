import { describe, it, expect } from 'vitest'
import { parseGenerateArgs } from '@/ai/cli-args'

describe('parseGenerateArgs', () => {
  it('parses the full surface (spec §8)', () => {
    expect(parseGenerateArgs(['--brief', 'Ba renderer', '--target', '20', '--lang', 'en', '--run-id', 'run-abc', '--voice', 'v9']))
      .toEqual({ brief: 'Ba renderer', targetSeconds: 20, language: 'en', runId: 'run-abc', voice: 'v9', resume: undefined })
  })

  it('defaults: target 30, language vi, no run-id/voice', () => {
    expect(parseGenerateArgs(['--brief', 'x']))
      .toEqual({ brief: 'x', targetSeconds: 30, language: 'vi', runId: undefined, voice: undefined, resume: undefined })
  })

  it('--resume passes through (alias of --run-id)', () => {
    expect(parseGenerateArgs(['--brief', 'x', '--resume', 'run-def']).resume).toBe('run-def')
  })

  it('missing/empty --brief throws usage', () => {
    expect(() => parseGenerateArgs([])).toThrow(/--brief/)
    expect(() => parseGenerateArgs(['--brief', '   '])).toThrow(/--brief/)
  })

  it('invalid --target throws', () => {
    expect(() => parseGenerateArgs(['--brief', 'x', '--target', 'abc'])).toThrow(/--target/)
    expect(() => parseGenerateArgs(['--brief', 'x', '--target', '-5'])).toThrow(/--target/)
  })

  it('unknown flag throws (node:util parseArgs strict)', () => {
    expect(() => parseGenerateArgs(['--brief', 'x', '--wat'])).toThrow()
  })
})
