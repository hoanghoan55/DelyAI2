import { describe, it, expect } from 'vitest'
import { secondsToFrames, framesToSeconds, framesToMs, msToFrames, beatToFrame } from '@/timeline/convert'

describe('secondsToFrames', () => {
  it('is exact at 30fps for whole seconds', () => {
    expect(secondsToFrames(6, 30)).toBe(180)
  })
  it('rounds half up at 30fps', () => {
    expect(secondsToFrames(0.05, 30)).toBe(2) // 1.5 -> 2
  })
  it('is the single rounding policy (round, not floor/ceil)', () => {
    expect(secondsToFrames(1.02, 30)).toBe(31) // 30.6 -> 31 (floor would be 30)
  })
  it('returns an integer for 29.97fps', () => {
    expect(Number.isInteger(secondsToFrames(9, 29.97))).toBe(true)
  })
})

describe('inverse and derived conversions', () => {
  it('framesToSeconds is the inverse ratio', () => {
    expect(framesToSeconds(180, 30)).toBe(6)
  })
  it('msToFrames converts through seconds with the same policy', () => {
    expect(msToFrames(1500, 30)).toBe(45)
  })
  it('beatToFrame maps beats deterministically', () => {
    expect(beatToFrame(4, 120, 30)).toBe(60) // 4 beats @120bpm = 2s = 60 frames
  })
  it('framesToMs is exact at 30fps for whole minutes', () => {
    expect(framesToMs(1800, 30)).toBe(60000) // 1800/30 = 60s = 60000ms
  })
  it('framesToMs at 29.97fps is fractional and asserted approximately', () => {
    // (1800 / 29.97) * 1000 = 60060.06006006006… — non-terminating decimal, so
    // a binary64 value is not exact; pin centiseconds with toBeCloseTo.
    expect(framesToMs(1800, 29.97)).toBeCloseTo(60060.06, 2)
  })
})
