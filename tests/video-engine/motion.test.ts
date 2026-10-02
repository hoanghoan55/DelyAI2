import { describe, it, expect, beforeEach } from 'vitest'
import { clearRegistry, clearRendererBackends, resolveMotion } from '@/video-engine/registry'
import { registerMotionRecipes, getMotionRecipe, MOTION_RECIPES, applyMotion, composeTransforms, IDENTITY_TRANSFORM } from '@/video-engine/motion'
import { clearRegistered, registerBackends } from '@/video-engine/runtime'
import { canonicalize } from '@/shared'
import type { CompiledLayer } from '@/video-engine/ir'

beforeEach(() => { clearRegistry(); clearRendererBackends(); registerMotionRecipes() })

const layer = (motion: CompiledLayer['motion']): CompiledLayer => ({
  id: 'l1', layerKind: 'visual', recipeId: 'glow', recipeVersion: '1.0.0', renderer: 'canvas2d', slot: 'main',
  frameWindow: { from: 0, durationInFrames: 60 }, params: {}, motion, zIndex: 0, assetRefs: [],
})

describe('motion recipes', () => {
  it('registers the seven Phase 0 motion recipes on the registry', () => {
    expect(MOTION_RECIPES.map((r) => r.id).sort()).toEqual(
      ['camera-flythrough', 'fade', 'parallax', 'pulse', 'reveal', 'scale', 'slide'],
    )
    for (const r of MOTION_RECIPES) expect(resolveMotion(r.id).id).toBe(r.id)
  })
  it('composeTransforms multiplies opacity and adds offsets', () => {
    const a = { opacity: 0.5, x: 10, y: 0, scale: 2, rotate: 0 }
    const b = { opacity: 0.5, x: 5, y: -3, scale: 0.5, rotate: 45 }
    expect(composeTransforms(a, b)).toEqual({ opacity: 0.25, x: 15, y: -3, scale: 1, rotate: 45 })
  })
  it('applyMotion is a pure function of the frame', () => {
    const l = layer([{ recipeId: 'fade', recipeVersion: '1.0.0', frameWindow: { from: 0, durationInFrames: 30 }, params: {} }])
    expect(applyMotion(l, 0, 30)).toEqual(applyMotion(l, 0, 30))
    expect(applyMotion(l, 0, 30).opacity).toBeCloseTo(0, 5)
    expect(applyMotion(l, 30, 30).opacity).toBeCloseTo(1, 5)
  })
  it('applyMotion with no motion returns the identity transform', () => {
    expect(applyMotion(layer([]), 12, 30)).toEqual(IDENTITY_TRANSFORM)
  })
  it('clamps outside the motion window', () => {
    const l = layer([{ recipeId: 'slide', recipeVersion: '1.0.0', frameWindow: { from: 10, durationInFrames: 20 }, params: { axis: 'x', distance: 0.25 } }])
    expect(applyMotion(l, 0, 30).x).toBe(applyMotion(l, 10, 30).x)
    expect(applyMotion(l, 999, 30).x).toBe(applyMotion(l, 29, 30).x)
  })
  it('fade recipe default params parse', () => {
    expect(getMotionRecipe('fade').paramsSchema.parse({})).toMatchObject({ from: 0, to: 1 })
  })
})

// Hard requirement 5: IDENTITY_TRANSFORM must be a genuine identity — its CSS
// projection must be exactly "translate(0%, 0%) scale(1) rotate(0deg)" with
// opacity 1, so a layer with no motion renders exactly as it would unwrapped.
describe('IDENTITY_TRANSFORM is a true identity', () => {
  it('has exact identity values (no hair-sized offset)', () => {
    expect(IDENTITY_TRANSFORM).toEqual({ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 })
  })
  it('composes as the identity element on both sides', () => {
    const t = { opacity: 0.7, x: 3, y: -4, scale: 1.25, rotate: 12 }
    expect(composeTransforms(IDENTITY_TRANSFORM, t)).toEqual(t)
    expect(composeTransforms(t, IDENTITY_TRANSFORM)).toEqual(t)
  })
  it('a no-motion layer yields a no-op CSS transform string', () => {
    const t = applyMotion(layer([]), 999, 30)
    expect(t.opacity).toBe(1)
    expect(`translate(${t.x * 100}%, ${t.y * 100}%) scale(${t.scale}) rotate(${t.rotate}deg)`)
      .toBe('translate(0%, 0%) scale(1) rotate(0deg)')
  })
})

// Hard requirement 3: every transform is a pure function of (frame, fps, params) —
// no wall clock, no randomness. Re-evaluating in a different order is identical.
describe('motion is deterministic and frame-only (hard requirement 3)', () => {
  it('each recipe yields the same transform for the same frame regardless of order', () => {
    for (const r of MOTION_RECIPES) {
      const params = r.paramsSchema.parse({})
      const at = (frame: number) => r.apply({ frame, fps: 30, durationInFrames: 59, params })
      const forward = [0, 17, 42].map(at)
      const replayed = [42, 0, 17].map(at)
      expect(forward[0]).toEqual(replayed[1])
      expect(forward[1]).toEqual(replayed[2])
      expect(forward[2]).toEqual(replayed[0])
    }
  })
  it('camera-flythrough settles (clamps) rather than looping past its window', () => {
    const r = getMotionRecipe('camera-flythrough')
    const params = r.paramsSchema.parse({})
    const at = (frame: number) => r.apply({ frame, fps: 30, durationInFrames: 59, params })
    // Past the window the clamped progress pins to 1, so it stays settled.
    expect(at(59)).toEqual(at(500))
    expect(at(0)).toEqual(at(-50))
  })
})

// Hard requirement 7: each of the seven recipes' params must survive `canonicalize`
// (which throws on nested `undefined`), both from pure defaults and with the fixture's
// params supplied. Every defaulted field uses zod `.default(...)`; no bare `.optional()`.
describe('motion recipe params survive canonicalize (carry-forward requirement)', () => {
  // The demo fixture (Task 12) supplies slide + camera-flythrough params verbatim.
  const fixtureParams: Record<string, Record<string, unknown>> = {
    slide: { axis: 'x', distance: 0.08, easing: 'out' },
    'camera-flythrough': { from: 0.9, to: 1.05 },
    fade: { from: 0, to: 1 },
    reveal: { distance: 0.04 },
    scale: { from: 0.92, to: 1 },
    pulse: { amplitude: 0.03, hz: 0.5 },
    parallax: { amplitude: 0.02, hz: 0.1, phase: 0 },
  }
  const canonicalOf = (id: string, raw: Record<string, unknown>): string =>
    canonicalize(getMotionRecipe(id).paramsSchema.parse(raw))

  it('parses to JSON with no nested undefined when params are omitted', () => {
    for (const r of MOTION_RECIPES) {
      const resolved = r.paramsSchema.parse({})
      const hasUndefined = (v: unknown): boolean =>
        v === undefined || (typeof v === 'object' && v !== null && Object.values(v as object).some(hasUndefined))
      expect(hasUndefined(resolved), `${r.id} resolved params contain undefined`).toBe(false)
      expect(JSON.parse(JSON.stringify(resolved))).toEqual(resolved)
    }
  })

  it('survives canonicalize with params omitted', () => {
    for (const r of MOTION_RECIPES) expect(() => canonicalOf(r.id, {})).not.toThrow()
  })

  it('survives canonicalize with the fixture params supplied', () => {
    for (const r of MOTION_RECIPES) expect(() => canonicalOf(r.id, fixtureParams[r.id] ?? {}), r.id).not.toThrow()
  })

  it("accepts the fixture's slide and camera-flythrough params without dropping or rejecting a field", () => {
    expect(getMotionRecipe('slide').paramsSchema.parse(fixtureParams.slide)).toEqual({ axis: 'x', distance: 0.08, easing: 'out' })
    expect(getMotionRecipe('camera-flythrough').paramsSchema.parse(fixtureParams['camera-flythrough'])).toEqual({ from: 0.9, to: 1.05, drift: 0.01 })
  })
})

// registerBackends wires the motion recipes (Task 11 → Task 8), mirroring canvas/three.
describe('registerBackends wires motion (Task 11 → Task 8)', () => {
  it('registers motion recipes, and clearRegistered resets the motion recipe clear', () => {
    clearRegistered()
    registerBackends()
    expect(MOTION_RECIPES).toHaveLength(7)
    expect(resolveMotion('camera-flythrough').id).toBe('camera-flythrough')
    expect(getMotionRecipe('parallax').id).toBe('parallax')

    clearRegistered()
    expect(() => getMotionRecipe('parallax')).toThrow(/Unknown motion recipe implementation/)
    expect(() => resolveMotion('camera-flythrough')).toThrow(/Unknown motion recipe/)
  })
})
