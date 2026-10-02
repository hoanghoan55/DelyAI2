import { describe, it, expect, beforeEach } from 'vitest'
import { clearRegistry, clearRendererBackends, resolveVisual, hasRendererBackend } from '@/video-engine/registry'
import { registerCanvasRecipes, CANVAS_RECIPES, getCanvasRecipe } from '@/video-engine/canvas'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import { createSeededRandom, canonicalize } from '@/shared'

beforeEach(() => { clearRegistry(); clearRendererBackends(); registerCanvasRecipes() })

describe('canvas recipes', () => {
  it('registers the five Phase 0 recipes on canvas2d', () => {
    for (const id of ['particle-field', 'grid', 'waveform', 'glow', 'geometric-lines']) {
      expect(resolveVisual(id).renderer).toBe('canvas2d')
    }
    expect(CANVAS_RECIPES).toHaveLength(5)
  })
  it('particle-field positions are deterministic for a fixed seed', () => {
    const recipe = getCanvasRecipe('particle-field')
    const params = recipe.paramsSchema.parse({})
    const run = () => {
      const state = recipe.prepare!(null, { width: 100, height: 100 }, params)
      const rng = createSeededRandom(7)
      const pts: number[] = []
      for (let f = 0; f < 10; f++) pts.push(...recipe.samplePositions!(f, 30, state, params, rng))
      return pts
    }
    expect(run()).toEqual(run())
  })
  it('every recipe exposes a render function', () => {
    for (const r of CANVAS_RECIPES) expect(typeof r.render).toBe('function')
  })
})

describe('registerBackends wires the canvas2d backend (Task 9 → Task 8)', () => {
  it('registers canvas2d + recipes, and clearRegistered resets the canvas recipe clear', () => {
    clearRegistered()
    registerBackends()
    expect(hasRendererBackend('canvas2d')).toBe(true)
    expect(hasRendererBackend('dom')).toBe(true)
    expect(resolveVisual('particle-field').renderer).toBe('canvas2d')
    expect(CANVAS_RECIPES).toHaveLength(5)
    expect(getCanvasRecipe('particle-field').id).toBe('particle-field')

    clearRegistered()
    expect(hasRendererBackend('canvas2d')).toBe(false)
    expect(() => getCanvasRecipe('particle-field')).toThrow(/Unknown canvas recipe/)
  })
})

// Carry-forward, binding on this task (Task 7 review): compiled `params` are hashed
// with `canonicalize`, which throws on a nested `undefined`. Every recipe's schema
// output must survive it both from pure defaults and from the demo fixture's params.
describe('canvas recipe params survive canonicalize (carry-forward requirement)', () => {
  const fixtureParams: Record<string, Record<string, unknown>> = {
    'particle-field': { count: 48, hue: 200, speed: 1 },
  }
  const canonicalOf = (id: string, raw: Record<string, unknown>): string =>
    canonicalize(getCanvasRecipe(id).paramsSchema.parse(raw))

  it('parses to JSON with no nested undefined when params are omitted', () => {
    for (const r of CANVAS_RECIPES) {
      const resolved = r.paramsSchema.parse({})
      const hasUndefined = (v: unknown): boolean =>
        v === undefined || (typeof v === 'object' && v !== null && Object.values(v as object).some(hasUndefined))
      expect(hasUndefined(resolved), `${r.id} resolved params contain undefined`).toBe(false)
      expect(JSON.parse(JSON.stringify(resolved))).toEqual(resolved)
    }
  })

  it('survives canonicalize with params omitted', () => {
    for (const r of CANVAS_RECIPES) expect(() => canonicalOf(r.id, {})).not.toThrow()
  })

  it("survives canonicalize with the demo fixture's particle-field params", () => {
    expect(() => canonicalOf('particle-field', fixtureParams['particle-field']!)).not.toThrow()
  })

  it("accepts the fixture's particle-field params without dropping or rejecting a field", () => {
    const parsed = getCanvasRecipe('particle-field').paramsSchema.parse(fixtureParams['particle-field']) as Record<string, unknown>
    expect(parsed).toEqual({ count: 48, hue: 200, speed: 1 })
  })
})

// Hard requirement 2: `render(frame)` is callable for any frame in any order and
// produces the same pixels. We drive it with a headless recording context (no new
// dependency) and compare the recorded 2D call stream across draw orders.
type DrawCall = [string, ...unknown[]]
function createRecordingContext(): { ctx: CanvasRenderingContext2D; calls: DrawCall[] } {
  const calls: DrawCall[] = []
  const record = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]) }
  const ctx = {
    clearRect: record('clearRect'), fillRect: record('fillRect'), strokeRect: record('strokeRect'),
    beginPath: record('beginPath'), closePath: record('closePath'), moveTo: record('moveTo'),
    lineTo: record('lineTo'), arc: record('arc'), fill: record('fill'), stroke: record('stroke'),
    save: record('save'), restore: record('restore'), translate: record('translate'), rotate: record('rotate'),
    createRadialGradient: (...args: unknown[]) => { calls.push(['createRadialGradient', ...args]); return { addColorStop: record('addColorStop') } },
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('render(frame) is order-independent (hard requirement 2)', () => {
  const size = { width: 320, height: 180 }
  // Draw every frame into its own recording context, in the given order, and keep
  // each frame's call stream. Reusing one `state` across frames mirrors a layer's
  // prepare-once lifecycle, so any cross-frame accumulation would show up here.
  const streamPerFrame = (id: string, order: number[]): Map<number, DrawCall[]> => {
    const recipe = getCanvasRecipe(id)
    const params = recipe.paramsSchema.parse({})
    const state = recipe.prepare ? recipe.prepare(null, size, params) : {}
    const byFrame = new Map<number, DrawCall[]>()
    for (const f of order) {
      const { ctx, calls } = createRecordingContext()
      recipe.render(ctx, { frame: f, fps: 30, size, params, state, rng: createSeededRandom(1) })
      byFrame.set(f, calls)
    }
    return byFrame
  }

  it('each frame draws the same call stream regardless of draw order', () => {
    const frames = [0, 7, 19, 42, 7]
    for (const r of CANVAS_RECIPES) {
      const forward = streamPerFrame(r.id, frames)
      const backward = streamPerFrame(r.id, [...frames].reverse())
      for (const f of new Set(frames)) {
        expect(forward.get(f), `${r.id} frame ${f}`).toEqual(backward.get(f))
      }
    }
  })

  it('re-rendering a frame after other frames yields that frame’s own pixels', () => {
    for (const r of CANVAS_RECIPES) {
      const recipe = getCanvasRecipe(r.id)
      const params = recipe.paramsSchema.parse({})
      const freshState = recipe.prepare ? recipe.prepare(null, size, params) : {}
      const only = createRecordingContext()
      recipe.render(only.ctx, { frame: 7, fps: 30, size, params, state: freshState, rng: createSeededRandom(1) })

      const reused = streamPerFrame(r.id, [0, 42, 7])
      expect(reused.get(7), r.id).toEqual(only.calls)
    }
  })
})
