import { describe, it, expect } from 'vitest'
import { canonicalize } from '@/shared/canonical-json'

describe('canonicalize', () => {
  it('sorts object keys lexicographically', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })
  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]')
  })
  it('normalizes negative zero to zero', () => {
    expect(canonicalize(-0)).toBe('0')
  })
  it('throws on NaN', () => {
    expect(() => canonicalize(NaN)).toThrow(/non-finite/i)
  })
  it('throws on Infinity', () => {
    expect(() => canonicalize(Infinity)).toThrow(/non-finite/i)
  })
  it('emits no whitespace and is stable across key insertion order', () => {
    const a = canonicalize({ z: [1, { y: 2, x: 3 }], a: 's' })
    const b = canonicalize({ a: 's', z: [1, { x: 3, y: 2 }] })
    expect(a).toBe(b)
    expect(a).not.toMatch(/\s/)
  })
  it('serializes integers without a decimal point', () => {
    expect(canonicalize(5)).toBe('5')
    expect(canonicalize(5.0)).toBe('5')
  })
})
