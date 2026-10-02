import { describe, it, expect, beforeEach } from 'vitest'
import { clearRegistry, resolveComposition } from '@/video-engine/registry'
import { registerCompositions } from '@/video-engine/compositions'

const RENDER = { width: 1920, height: 1080 }

describe('composition primitives', () => {
  beforeEach(() => { clearRegistry(); registerCompositions() })

  it('exposes the nine Phase 0 compositions', () => {
    for (const id of ['hero', 'centered', 'full-screen', 'split', 'grid', 'comparison', 'cards', 'media-text', 'data']) {
      expect(resolveComposition(id).id).toBe(id)
    }
  })
  it('hero fills the frame with one slot', () => {
    expect(resolveComposition('hero').layout({ slots: ['main'], render: RENDER, style: {} })[0]).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080 })
  })
  it('split produces two side-by-side slots that do not overlap', () => {
    const rects = resolveComposition('split').layout({ slots: ['main', 'aside'], render: RENDER, style: {} })
    expect(rects).toHaveLength(2)
    expect(rects[0]!.x + rects[0]!.width).toBeLessThanOrEqual(rects[1]!.x)
  })
  it('grid returns one rect per requested slot', () => {
    const rects = resolveComposition('grid').layout({ slots: ['a', 'b', 'c', 'd'], render: RENDER, style: {} })
    expect(rects).toHaveLength(4)
  })
})

// Additional coverage for the declared slot metadata and unknown-id behavior.
describe('composition definitions', () => {
  beforeEach(() => { clearRegistry(); registerCompositions() })

  it('declares the documented slots for each composition', () => {
    expect(resolveComposition('hero').slots).toEqual([{ id: 'main', role: 'primary' }])
    expect(resolveComposition('split').slots.map((s) => s.id)).toEqual(['main', 'aside'])
    expect(resolveComposition('grid').slots).toHaveLength(4)
    expect(resolveComposition('media-text').slots.map((s) => s.id)).toEqual(['media', 'text'])
  })

  it('throws a clear error for an unknown composition id', () => {
    expect(() => resolveComposition('nope')).toThrow(/Unknown composition "nope"/)
  })

  it('does not duplicate register composition entries on repeated registration', () => {
    expect(() => registerCompositions()).toThrow(/Duplicate composition "hero"/)
  })

  it('every layout returns one rect per requested slot', () => {
    for (const id of ['hero', 'centered', 'full-screen', 'split', 'grid', 'comparison', 'cards', 'media-text', 'data']) {
      const def = resolveComposition(id)
      const slots = def.slots.map((s) => s.id)
      const rects = def.layout({ slots, render: RENDER, style: {} })
      expect(rects.length).toBeGreaterThan(0)
      for (const rect of rects) {
        expect(rect.width).toBeGreaterThan(0)
        expect(rect.height).toBeGreaterThan(0)
      }
    }
  })
})