import { describe, it, expect, beforeEach } from 'vitest'
import { clearRegistry, clearRendererBackends, resolveVisual, hasRendererBackend } from '@/video-engine/registry'
import { registerThreeRecipes, THREE_RECIPES, getThreeRecipe, structuralHashOf } from '@/video-engine/three'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import { createSeededRandom, canonicalize } from '@/shared'

beforeEach(() => { clearRegistry(); clearRendererBackends(); registerThreeRecipes() })

describe('three recipes', () => {
  it('registers the Phase 0 recipes on the three renderer', () => {
    for (const id of ['network-graph', 'particles-3d', 'wireframe-object', 'basic-scene', 'camera', 'lighting']) {
      expect(resolveVisual(id).renderer).toBe('three')
    }
    expect(THREE_RECIPES.length).toBeGreaterThanOrEqual(5)
  })
  it('structural hash is stable and frame-sensitive', () => {
    const d = {
      recipeId: 'network-graph', recipeVersion: '1.0.0', frame: 12, camera: { position: [0, 0, 6] as [number, number, number] },
      objectTransforms: [{ id: 'n1', position: [1, 2, 3] as [number, number, number] }],
      geometryParams: { nodes: 24 }, materialParams: { color: '#4a9eff' }, lightParams: { intensity: 0.8 }, seed: 12345,
    }
    expect(structuralHashOf(d)).toBe(structuralHashOf({ ...d }))
    expect(structuralHashOf(d)).not.toBe(structuralHashOf({ ...d, frame: 13 }))
  })
  it('network-graph descriptor is deterministic for a fixed seed', () => {
    const recipe = getThreeRecipe('network-graph')
    const build = () => recipe.describe!({ frame: 0, fps: 30, params: recipe.paramsSchema.parse({}), rng: createSeededRandom(5), sizing: { width: 1920, height: 1080 } })
    expect(build()).toEqual(build())
  })
  it('every recipe exposes a describe and build function', () => {
    // build() is not invoked here: it calls useCurrentFrame()/useVideoConfig(),
    // which require a Remotion render context (and a WebGL context for ThreeCanvas).
    for (const r of THREE_RECIPES) {
      expect(typeof r.describe, `${r.id}.describe`).toBe('function')
      expect(typeof r.build, `${r.id}.build`).toBe('function')
    }
  })
})

describe('registerBackends wires the three backend (Task 10 → Task 8)', () => {
  it('registers three + recipes, and clearRegistered resets the three recipe clear', () => {
    clearRegistered()
    registerBackends()
    expect(hasRendererBackend('three')).toBe(true)
    expect(hasRendererBackend('canvas2d')).toBe(true)
    expect(hasRendererBackend('dom')).toBe(true)
    expect(resolveVisual('network-graph').renderer).toBe('three')
    expect(THREE_RECIPES).toHaveLength(6)
    expect(getThreeRecipe('network-graph').id).toBe('network-graph')

    clearRegistered()
    expect(hasRendererBackend('three')).toBe(false)
    expect(() => getThreeRecipe('network-graph')).toThrow(/Unknown three recipe/)
  })
})

// Hard requirement 2: `structuralHashOf` is genuinely structural and order-stable.
// `canonicalize` sorts object keys at every level, so re-inserting the same pairs in a
// different order must hash identically, while array order (positions) must be preserved.
describe('structural hash is order-stable (hard requirement 2)', () => {
  it('hashes equal across different object key insertion orders', () => {
    const a = {
      recipeId: 'network-graph', recipeVersion: '1.0.0', frame: 3,
      camera: { position: [0, 0, 6] as [number, number, number] },
      objectTransforms: [{ id: 'n0', position: [1, 2, 3] as [number, number, number] }],
      geometryParams: { nodes: 24, radius: 2.6 }, materialParams: { color: '#4a9eff' },
      lightParams: { ambient: 0.4, directional: 0.9 }, seed: 7,
    }
    // Same data, keys inserted in a deliberately different order at two levels.
    const b = {
      seed: 7, lightParams: { directional: 0.9, ambient: 0.4 }, materialParams: { color: '#4a9eff' },
      geometryParams: { radius: 2.6, nodes: 24 },
      objectTransforms: [{ position: [1, 2, 3] as [number, number, number], id: 'n0' }],
      camera: { position: [0, 0, 6] as [number, number, number] },
      frame: 3, recipeVersion: '1.0.0', recipeId: 'network-graph',
    }
    expect(structuralHashOf(a)).toBe(structuralHashOf(b))
  })

  it('feeds structuralHashOf data-only descriptors (canonicalize never throws)', () => {
    for (const r of THREE_RECIPES) {
      const descriptor = r.describe!({ frame: 4, fps: 30, params: r.paramsSchema.parse({}), rng: createSeededRandom(9), sizing: { width: 1920, height: 1080 } })
      expect(() => structuralHashOf(descriptor), `${r.id} descriptor hashes`).not.toThrow()
      // Round-trips through JSON unchanged: no Object3D, Vector3, class instance, or function.
      expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor)
    }
  })
})

// Carry-forward, binding on this task (Task 6 + Task 7 review): compiled `params` are
// hashed with `canonicalize`, which throws on a nested `undefined`. Every recipe's schema
// output must survive it both from pure defaults and from supplied params. Every defaulted
// field uses zod `.default(...)`; no bare `.optional()` on a nested field.
describe('three recipe params survive canonicalize (carry-forward requirement)', () => {
  const fixtureParams: Record<string, Record<string, unknown>> = {
    'network-graph': { nodes: 28, radius: 2.6, color: '#4a9eff' },
    'particles-3d': { count: 120, color: '#7cc4ff' },
    'wireframe-object': { color: '#ff8a3d', kind: 'torus' },
    'basic-scene': { color: '#4a9eff' },
    camera: { color: '#9dd0ff' },
    lighting: { color: '#ffffff' },
  }
  const canonicalOf = (id: string, raw: Record<string, unknown>): string =>
    canonicalize(getThreeRecipe(id).paramsSchema.parse(raw))

  it('parses to JSON with no nested undefined when params are omitted', () => {
    for (const r of THREE_RECIPES) {
      const resolved = r.paramsSchema.parse({})
      const hasUndefined = (v: unknown): boolean =>
        v === undefined || (typeof v === 'object' && v !== null && Object.values(v as object).some(hasUndefined))
      expect(hasUndefined(resolved), `${r.id} resolved params contain undefined`).toBe(false)
      expect(JSON.parse(JSON.stringify(resolved))).toEqual(resolved)
    }
  })

  it('survives canonicalize with params omitted', () => {
    for (const r of THREE_RECIPES) expect(() => canonicalOf(r.id, {})).not.toThrow()
  })

  it('survives canonicalize with the fixture / representative params supplied', () => {
    for (const r of THREE_RECIPES) expect(() => canonicalOf(r.id, fixtureParams[r.id] ?? {}), r.id).not.toThrow()
  })

  it("accepts the demo fixture's network-graph params without dropping or rejecting a field", () => {
    const parsed = getThreeRecipe('network-graph').paramsSchema.parse(fixtureParams['network-graph']) as Record<string, unknown>
    expect(parsed).toEqual({ nodes: 28, radius: 2.6, color: '#4a9eff' })
  })
})
