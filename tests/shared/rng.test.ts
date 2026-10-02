import { describe, it, expect } from 'vitest'
import { createSeededRandom } from '@/shared/rng'

describe('SeededRandom', () => {
  it('produces identical sequences for the same seed', () => {
    const a = createSeededRandom(12345)
    const b = createSeededRandom(12345)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    expect(createSeededRandom(1).next()).not.toEqual(createSeededRandom(2).next())
  })

  it('int() stays within inclusive bounds', () => {
    const rng = createSeededRandom(42)
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 7)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(7)
    }
  })

  it('does not call Math.random internally', () => {
    const original = Math.random
    Math.random = () => { throw new Error('Math.random used') }
    try {
      expect(() => createSeededRandom(7).next()).not.toThrow()
    } finally {
      Math.random = original
    }
  })
})
