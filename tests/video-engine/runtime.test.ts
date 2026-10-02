import { describe, it, expect } from 'vitest'
import { absoluteFrameOf, layerLocalFrame } from '@/video-engine/runtime'

describe('runtime frame math', () => {
  it('absolute frame = scene start + local frame', () => {
    expect(absoluteFrameOf({ startFrame: 450 }, 30)).toBe(480)
  })
  it('clamps a scene-local frame into the layer window', () => {
    expect(layerLocalFrame({ from: 30, durationInFrames: 90 }, 200)).toBe(119) // 30 + 90 - 1
    expect(layerLocalFrame({ from: 30, durationInFrames: 90 }, 0)).toBe(30)
  })
})

// Additive coverage (hard requirement 6): the compiler guarantees integer frames,
// so a non-integer IR frame is a boundary contract violation, never repaired.
describe('runtime rejects non-integer IR frames', () => {
  it('rejects a non-integer scene startFrame', () => {
    expect(() => absoluteFrameOf({ startFrame: 450.5 }, 0)).toThrow(/non-integer IR frame/)
  })
  it('rejects a non-integer layer window bound', () => {
    expect(() => layerLocalFrame({ from: 30.5, durationInFrames: 90 }, 0)).toThrow(/non-integer IR frame/)
    expect(() => layerLocalFrame({ from: 30, durationInFrames: 90.5 }, 0)).toThrow(/non-integer IR frame/)
  })
})
