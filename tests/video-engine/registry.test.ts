import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import {
  createVisualRecipe, registerVisual, resolveVisual, listAvailable, clearRegistry,
  registerMotion, createMotionRecipe, resolveMotion, hasVisual,
} from '@/video-engine/registry'

// Additional coverage for the controller's decisions (non-throwing probe, registry defaults).
import {
  hasRendererBackend, registerRendererBackend, getRendererBackend, clearRendererBackends,
  hasMotion, hasComposition,
} from '@/video-engine/registry'
import { canonicalize } from '@/shared'
import type { JsonObject } from '@/video-engine/schema'

describe('registry', () => {
  beforeEach(() => clearRegistry())

  it('resolves a registered visual recipe and its renderer', () => {
    registerVisual(createVisualRecipe({
      id: 'demo', version: '1.0.0', renderer: 'canvas2d',
      paramsSchema: z.object({ count: z.number().default(10) }), defaults: {},
    }))
    expect(resolveVisual('demo').renderer).toBe('canvas2d')
    expect(hasVisual('demo')).toBe(true)
  })

  it('throws a clear error for an unknown visual id (Review Focus #2)', () => {
    expect(() => resolveVisual('missing')).toThrow(/Unknown visual recipe "missing"/)
  })

  it('throws on duplicate registration', () => {
    const r = createVisualRecipe({ id: 'dup', version: '1.0.0', renderer: 'dom', paramsSchema: z.object({}), defaults: {} })
    registerVisual(r)
    expect(() => registerVisual(r)).toThrow(/Duplicate/)
  })

  it('lists available recipes as metadata only', () => {
    registerVisual(createVisualRecipe({ id: 'r1', version: '1.0.0', renderer: 'dom', paramsSchema: z.object({}), defaults: {} }))
    registerMotion(createMotionRecipe({ id: 'm1', version: '1.0.0', paramsSchema: z.object({}), defaults: {} }))
    expect(resolveMotion('m1').id).toBe('m1')
    const available = listAvailable()
    expect(available.visual.map((v) => v.id)).toContain('r1')
    expect(Object.keys(available.visual[0]!)).not.toContain('paramsSchema')
  })
})

describe('registry defaults (Review Focus #4)', () => {
  beforeEach(() => clearRegistry())

  it('a recipe whose params are omitted resolves to its schema defaults, not undefined or {}', () => {
    registerVisual(createVisualRecipe({
      id: 'demo', version: '1.0.0', renderer: 'canvas2d',
      paramsSchema: z.object({ count: z.number().default(10), label: z.string().default('hello') }),
      defaults: {},
    }))
    const resolved = resolveVisual('demo').paramsSchema.parse({}) as JsonObject
    expect(resolved.count).toBe(10)
    expect(resolved.label).toBe('hello')
  })

  it('resolved params are data-only, JSON-serializable and free of nested undefined', () => {
    registerVisual(createVisualRecipe({
      id: 'demo', version: '1.0.0', renderer: 'canvas2d',
      paramsSchema: z.object({ count: z.number().default(10), nested: z.object({ hue: z.number().default(200) }).default({ hue: 200 }) }),
      defaults: {},
    }))
    const resolved = resolveVisual('demo').paramsSchema.parse({}) as JsonObject
    const hasUndefined = (v: unknown): boolean =>
      v === undefined || (typeof v === 'object' && v !== null && Object.values(v as object).some(hasUndefined))
    expect(hasUndefined(resolved)).toBe(false)
    expect(() => canonicalize(resolved)).not.toThrow()
    expect(JSON.parse(JSON.stringify(resolved))).toEqual(resolved)
  })

  it('non-throwing existence probes report unknown ids rather than throwing (Decision #2)', () => {
    expect(hasVisual('nope')).toBe(false)
    expect(hasMotion('nope')).toBe(false)
    expect(hasComposition('nope')).toBe(false)
  })
})

describe('renderer backends', () => {
  beforeEach(() => {
    clearRegistry()
    clearRendererBackends()
  })

  it('hasRendererBackend is a non-throwing probe on unknown kinds (Decision #2)', () => {
    expect(hasRendererBackend('canvas2d')).toBe(false)
    expect(() => hasRendererBackend('three')).not.toThrow()
    const backend = () => null
    registerRendererBackend('canvas2d', backend)
    expect(hasRendererBackend('canvas2d')).toBe(true)
    expect(getRendererBackend('canvas2d')).toBe(backend)
  })

  it('getRendererBackend throws a clear error for a kind with no backend', () => {
    expect(() => getRendererBackend('three')).toThrow(/No renderer backend registered for "three"/)
  })
})