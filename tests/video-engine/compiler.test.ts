import { describe, it, expect, beforeEach } from 'vitest'
import { compileScene, CompilerError, computeSourceHash } from '@/video-engine/compiler'
import { clearRegistry, clearRendererBackends, registerVisual } from '@/video-engine/registry'
import { computeCompiledHash } from '@/video-engine/ir/hash'
import { canonicalize } from '@/shared'
import { registerTestRecipes } from './fixtures/test-recipes'
import { buildMasterTimeline } from '@/timeline/master'
import { grid } from '@/video-engine/canvas/recipes/grid'
import type { z } from 'zod'
import type { JsonObject, SceneDSL } from '@/video-engine/schema'

const timelineFor = (duration: number) =>
  buildMasterTimeline({ fps: 30, width: 1920, height: 1080, scenes: [{ sceneId: 'scene-01', duration }], voiceScenePolicy: 'strict' })

const dsl: SceneDSL = {
  schemaVersion: '0.1', sceneId: 'scene-01', purpose: 'hook', duration: 6, composition: 'split',
  visual: [{ recipe: 'particle-field', params: {} }],
  motion: [{ recipe: 'fade', params: {} }],
  typography: { text: 'Hello', animation: 'reveal' },
  audio: [], events: [], style: { styleId: 'default' }, seed: 12345,
}

/** Throws the compiler diagnostic if compileScene did NOT throw a CompilerError. */
function captureError(fn: () => unknown): CompilerError {
  try {
    fn()
  } catch (e) {
    if (e instanceof CompilerError) return e
    throw e
  }
  throw new Error('no throw')
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

describe('compileScene', () => {
  beforeEach(() => { clearRegistry(); clearRendererBackends(); registerTestRecipes() })

  it('binds the absolute scene window from the timeline', () => {
    expect(compileScene({ dsl, timeline: timelineFor(6) }).timing).toEqual({ startFrame: 0, durationInFrames: 180 })
  })
  it('applies registry defaults to recipe params (Review Focus #4)', () => {
    const layer = compileScene({ dsl, timeline: timelineFor(6) }).layers.find((l) => l.recipeId === 'particle-field')!
    expect(layer.params.count).toBe(40)
  })
  it('resolves the layer renderer from the registry, not the DSL', () => {
    const layer = compileScene({ dsl, timeline: timelineFor(6) }).layers.find((l) => l.recipeId === 'particle-field')!
    expect(layer.renderer).toBe('canvas2d')
  })
  it('produces a stable compiledHash across two runs', () => {
    const a = compileScene({ dsl, timeline: timelineFor(6) })
    const b = compileScene({ dsl, timeline: timelineFor(6) })
    expect(a.provenance.compiledHash).toBe(b.provenance.compiledHash)
    expect(a.provenance.compiledHash).toHaveLength(64)
  })
  it('fails with UNKNOWN_COMPOSITION naming the id (Review Focus #2)', () => {
    try { compileScene({ dsl: { ...dsl, composition: 'nope' }, timeline: timelineFor(6) }); throw new Error('no throw') }
    catch (e) {
      expect(e).toBeInstanceOf(CompilerError)
      expect((e as CompilerError).diagnostics.some((d) => d.code === 'UNKNOWN_COMPOSITION')).toBe(true)
    }
  })
  it('fails with UNKNOWN_VISUAL_RECIPE naming the id (Review Focus #2)', () => {
    try { compileScene({ dsl: { ...dsl, visual: [{ recipe: 'missing', params: {} }] }, timeline: timelineFor(6) }); throw new Error('no throw') }
    catch (e) { expect((e as CompilerError).diagnostics.some((d) => d.code === 'UNKNOWN_VISUAL_RECIPE')).toBe(true) }
  })
  it('fails with DURATION_MISMATCH when DSL duration disagrees with the window', () => {
    try { compileScene({ dsl: { ...dsl, duration: 5 }, timeline: timelineFor(6) }); throw new Error('no throw') }
    catch (e) { expect((e as CompilerError).diagnostics.some((d) => d.code === 'DURATION_MISMATCH')).toBe(true) }
  })
  it('never branches on purpose', () => {
    const a = compileScene({ dsl, timeline: timelineFor(6) })
    const b = compileScene({ dsl: { ...dsl, purpose: 'outro' }, timeline: timelineFor(6) })
    expect(a.layers.map((l) => l.recipeId)).toEqual(b.layers.map((l) => l.recipeId))
  })
  it('keeps every layer frameWindow inside the scene window', () => {
    const ir = compileScene({ dsl, timeline: timelineFor(6) })
    for (const l of ir.layers) expect(l.frameWindow.durationInFrames).toBeLessThanOrEqual(ir.timing.durationInFrames)
  })
})

describe('compileScene — diagnostics for unknown ids (Review Focus #2)', () => {
  beforeEach(() => { clearRegistry(); clearRendererBackends(); registerTestRecipes() })

  it('fails with UNKNOWN_MOTION_RECIPE naming the id', () => {
    const e = captureError(() => compileScene({ dsl: { ...dsl, motion: [{ recipe: 'missing', params: {} }] }, timeline: timelineFor(6) }))
    expect(e.diagnostics.some((d) => d.code === 'UNKNOWN_MOTION_RECIPE')).toBe(true)
  })

  it('fails with UNKNOWN_SLOT when a visual targets a slot the composition does not declare', () => {
    const e = captureError(() => compileScene({ dsl: { ...dsl, visual: [{ recipe: 'particle-field', params: {}, slot: 'ghost' }] }, timeline: timelineFor(6) }))
    expect(e.diagnostics.some((d) => d.code === 'UNKNOWN_SLOT')).toBe(true)
  })

  it('fails with MISSING_SCENE_WINDOW when the timeline has no window for the scene', () => {
    const other = buildMasterTimeline({ fps: 30, width: 1920, height: 1080, scenes: [{ sceneId: 'other', duration: 6 }], voiceScenePolicy: 'strict' })
    const e = captureError(() => compileScene({ dsl, timeline: other }))
    expect(e.diagnostics.some((d) => d.code === 'MISSING_SCENE_WINDOW')).toBe(true)
  })

  it('never lets a raw registry throw escape as a non-CompilerError', () => {
    let caught: unknown
    try { compileScene({ dsl: { ...dsl, composition: 'nope' }, timeline: timelineFor(6) }) } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(CompilerError)
  })
})

describe('compileScene — frames are always integers (Review Focus #1 & hard requirement #4)', () => {
  beforeEach(() => { clearRegistry(); clearRendererBackends(); registerTestRecipes() })

  it('emits only integer frame values across the whole IR', () => {
    const ir = compileScene({ dsl, timeline: timelineFor(6) })
    const frames = [
      ir.timing.startFrame, ir.timing.durationInFrames,
      ...ir.layers.flatMap((l) => [l.frameWindow.from, l.frameWindow.durationInFrames, ...l.motion.flatMap((m) => [m.frameWindow.from, m.frameWindow.durationInFrames])]),
      ...ir.events.map((e) => e.atFrame),
      ...ir.audio.map((a) => a.atFrame),
      ...(ir.typography ? [ir.typography.frameWindow.from, ir.typography.frameWindow.durationInFrames] : []),
    ]
    expect(frames.every((f) => Number.isInteger(f))).toBe(true)
  })

  it('fails loudly (DURATION_MISMATCH) rather than emitting NaN frames for a non-finite duration', () => {
    const e = captureError(() => compileScene({ dsl: { ...dsl, duration: Number.NaN }, timeline: timelineFor(6) }))
    expect(e.diagnostics.some((d) => d.code === 'DURATION_MISMATCH')).toBe(true)
  })
})

describe('compileScene — slot binding and layering', () => {
  beforeEach(() => { clearRegistry(); clearRendererBackends(); registerTestRecipes() })

  it('falls back to the composition slot by index when a visual omits its slot', () => {
    const ir = compileScene({ dsl: { ...dsl, visual: [{ recipe: 'particle-field', params: {} }, { recipe: 'network-graph', params: {} }] }, timeline: timelineFor(6) })
    expect(ir.layers.map((l) => l.slot)).toEqual(['main', 'aside'])
  })

  it('assigns distinct increasing zIndex and keeps layers in that order', () => {
    const ir = compileScene({ dsl: { ...dsl, visual: [{ recipe: 'particle-field', params: {} }, { recipe: 'network-graph', params: {} }] }, timeline: timelineFor(6) })
    expect(ir.layers.map((l) => l.zIndex)).toEqual([0, 1])
  })
})

describe('compileScene — motion attachment', () => {
  beforeEach(() => { clearRegistry(); clearRendererBackends(); registerTestRecipes() })

  it('warns (not throws) for a motion with no target', () => {
    const ir = compileScene({ dsl, timeline: timelineFor(6) })
    expect(ir.diagnostics.some((d) => d.code === 'MOTION_WITHOUT_TARGET' && d.severity === 'warning')).toBe(true)
    expect(ir.layers.every((l) => l.motion.length === 0)).toBe(true)
  })

  it('attaches a targeted motion to the matching layer', () => {
    const withId: SceneDSL = { ...dsl, visual: [{ id: 'hero-layer', recipe: 'particle-field', params: {} }], motion: [{ recipe: 'fade', params: {}, target: 'hero-layer' }] }
    const ir = compileScene({ dsl: withId, timeline: timelineFor(6) })
    const layer = ir.layers.find((l) => l.id === 'hero-layer')!
    expect(layer.motion.map((m) => m.recipeId)).toEqual(['fade'])
    expect(layer.motion[0]!.params.duration).toBe(0.5)
  })

  it('errors with MOTION_UNKNOWN_TARGET for an unresolvable target', () => {
    const ir = compileScene({ dsl: { ...dsl, motion: [{ recipe: 'fade', params: {}, target: 'nope' }] }, timeline: timelineFor(6) })
    expect(ir.diagnostics.some((d) => d.code === 'MOTION_UNKNOWN_TARGET' && d.severity === 'error')).toBe(true)
  })

  it('errors with MOTION_MULTIPLE_PER_LAYER when a layer is targeted twice', () => {
    const withId: SceneDSL = {
      ...dsl, visual: [{ id: 'hero-layer', recipe: 'particle-field', params: {} }],
      motion: [{ recipe: 'fade', params: {}, target: 'hero-layer' }, { recipe: 'fade', params: {}, target: 'hero-layer' }],
    }
    const ir = compileScene({ dsl: withId, timeline: timelineFor(6) })
    expect(ir.diagnostics.some((d) => d.code === 'MOTION_MULTIPLE_PER_LAYER')).toBe(true)
    expect(ir.layers.find((l) => l.id === 'hero-layer')!.motion).toHaveLength(1)
  })
})

describe('compileScene — typography window', () => {
  beforeEach(() => { clearRegistry(); clearRendererBackends(); registerTestRecipes() })

  it('defaults typography to the whole scene when no timing is given', () => {
    const ir = compileScene({ dsl, timeline: timelineFor(6) })
    expect(ir.typography).toEqual({ text: 'Hello', animation: 'reveal', slot: 'main', frameWindow: { from: 0, durationInFrames: 180 } })
  })

  it('reports TYPOGRAPHY_OUT_OF_WINDOW and yields null typography when it starts past the scene', () => {
    const ir = compileScene({ dsl: { ...dsl, typography: { text: 'Late', animation: 'fade', startSeconds: 7 } }, timeline: timelineFor(6) })
    expect(ir.typography).toBeNull()
    expect(ir.diagnostics.some((d) => d.code === 'TYPOGRAPHY_OUT_OF_WINDOW' && d.severity === 'error')).toBe(true)
  })
})

describe('compileScene — purity and hash contract (hard requirements #5 & #6)', () => {
  beforeEach(() => { clearRegistry(); clearRendererBackends(); registerTestRecipes() })

  it('does not mutate its frozen input DSL or timeline', () => {
    const frozenDsl = deepFreeze(structuredClone(dsl))
    const frozenTimeline = deepFreeze(structuredClone(timelineFor(6)))
    expect(() => compileScene({ dsl: frozenDsl, timeline: frozenTimeline })).not.toThrow()
    expect(frozenDsl).toEqual(dsl)
  })

  it('produces IR with no nested undefined that would poison canonicalize', () => {
    const ir = compileScene({ dsl, timeline: timelineFor(6) })
    expect(() => canonicalize(ir)).not.toThrow()
    expect(JSON.parse(JSON.stringify(ir))).toEqual(ir)
  })

  it('compiledHash equals computeCompiledHash of the returned IR (single source of truth)', () => {
    const ir = compileScene({ dsl, timeline: timelineFor(6) })
    expect(ir.provenance.compiledHash).toBe(computeCompiledHash(ir))
    expect(ir.provenance.sourceHash).toBe(computeSourceHash(dsl, []))
  })

  it('sourceHash changes when the DSL changes and is stable otherwise', () => {
    const a = computeSourceHash(dsl, [])
    const b = computeSourceHash(dsl, [])
    const c = computeSourceHash({ ...dsl, seed: 999 }, [])
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('compileScene — recipe params rejected by the recipe schema (INVALID_PARAMS)', () => {
  beforeEach(() => { clearRegistry(); clearRendererBackends(); registerTestRecipes() })

  it('throws a CompilerError carrying INVALID_PARAMS when a recipe rejects the DSL params', () => {
    // JsonObjectSchema accepts any JSON, so the DSL schema admits { count: 1.5 }
    // even though particle-field's paramsSchema requires an integer count.
    const e = captureError(() => compileScene({ dsl: { ...dsl, visual: [{ recipe: 'particle-field', params: { count: 1.5 } }] }, timeline: timelineFor(6) }))
    expect(e).toBeInstanceOf(CompilerError)
    expect(e.diagnostics.some((d) => d.code === 'INVALID_PARAMS')).toBe(true)
  })

  it('rejects a non-finite recipe param (Infinity) at schema time with INVALID_PARAMS (M1)', () => {
    // Register the REAL grid recipe: its paramsSchema carries .finite(), which is
    // the M1 fix. The compiler test doubles keep bare z.number() schemas, so they
    // cannot pin this path. Without .finite(), resolveParams would accept Infinity
    // and canonicalize would later throw a bare Error instead of INVALID_PARAMS.
    registerVisual({
      id: grid.id, version: grid.version, renderer: 'canvas2d',
      paramsSchema: grid.paramsSchema as z.ZodType<JsonObject>, defaults: {},
    })
    const e = captureError(() => compileScene({
      dsl: { ...dsl, visual: [{ recipe: 'grid', params: { opacity: Number.POSITIVE_INFINITY } }] },
      timeline: timelineFor(6),
    }))
    expect(e).toBeInstanceOf(CompilerError)
    expect(e.diagnostics.some((d) => d.code === 'INVALID_PARAMS')).toBe(true)
  })
})
