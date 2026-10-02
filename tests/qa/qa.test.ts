import { describe, it, expect, beforeEach } from 'vitest'
import {
  checkSchema,
  checkTimeline,
  checkScenes,
  checkGeometry,
  checkRender,
  runAllChecks,
  createFixtureVisionChecker,
} from '@/qa'
import { clearRendererBackends, clearRegistry } from '@/video-engine/registry'
import { buildMasterTimeline } from '@/timeline/master'
import { buildFixtureProject } from '@/ai/project'
import { registerBackends } from '@/video-engine/runtime'
import type { CompiledScene } from '@/video-engine/ir'

beforeEach(() => {
  clearRegistry()
  clearRendererBackends()
  registerBackends()
})

describe('qa layers', () => {
  it('checkSchema reports an error path for a malformed project', () => {
    const d = checkSchema({ dslVersion: '0.1', scenes: [{ sceneId: 'x' }] })
    expect(d.some((x) => x.severity === 'error' && x.code === 'SCHEMA_INVALID')).toBe(true)
  })
  it('checkTimeline verifies contiguity and totalFrames', () => {
    const t = buildMasterTimeline({
      fps: 30,
      width: 1920,
      height: 1080,
      voiceScenePolicy: 'strict',
      scenes: [
        { sceneId: 'a', duration: 6 },
        { sceneId: 'b', duration: 9 },
      ],
    })
    expect(checkTimeline(t)).toEqual([])
    expect(checkTimeline({ ...t, totalFrames: 999 })).toHaveLength(1)
  })
  it('checkRender flags a layer whose renderer has no backend', () => {
    const { compiledScenes } = buildFixtureProject()
    const layers = compiledScenes.flatMap((s) => s.layers)
    expect(checkRender(layers)).toEqual([]) // all backends registered
    clearRendererBackends()
    expect(checkRender(layers).every((d) => d.code === 'RENDERER_BACKEND_MISSING')).toBe(true)
    expect(checkRender(layers).length).toBeGreaterThan(0)
  })
  it('checkGeometry passes for the fixture project (all rects inside frame)', () => {
    const { compiledScenes } = buildFixtureProject()
    expect(checkGeometry(compiledScenes)).toEqual([])
  })
  it('fixture vision checker reports itself unavailable', async () => {
    const r = await createFixtureVisionChecker().check({ scenes: [] })
    expect(r.available).toBe(false)
    expect(r.findings).toEqual([])
  })
})

describe('checkScenes (registry + slot + window membership)', () => {
  it('names the offending scene and layer when a layer targets an undeclared slot', () => {
    const { compiledScenes } = buildFixtureProject()
    // Hand-made bad scene: take a real compiled scene and point one layer at a
    // slot its composition never declares. The offending ids are known exactly.
    const split = compiledScenes.find((s) => s.sceneId === 'scene-split')!
    expect(split.composition.slots).toEqual(['main', 'aside'])
    const target = split.layers[0]!
    const corrupted: CompiledScene = {
      ...split,
      layers: split.layers.map((l) => (l.id === target.id ? { ...l, slot: 'does-not-exist' } : l)),
    }

    const diagnostics = checkScenes([corrupted])
    const slotDiag = diagnostics.find((d) => d.code === 'QA_UNKNOWN_SLOT')

    expect(slotDiag).toBeDefined()
    expect(slotDiag!.sceneId).toBe('scene-split')
    expect(slotDiag!.layerId).toBe(target.id)
    expect(slotDiag!.message).toContain('does-not-exist')
  })

  it('passes for every fixture scene (all compositions/recipes/slots/windows are real)', () => {
    const { compiledScenes } = buildFixtureProject()
    expect(checkScenes(compiledScenes)).toEqual([])
  })
})

describe('runAllChecks (composition of layers 2-5)', () => {
  it('returns [] for a clean fixture project', () => {
    const { compiledScenes, timeline } = buildFixtureProject()
    expect(runAllChecks({ scenes: compiledScenes, timeline })).toEqual([])
  })

  it('surfaces a corrupted timeline through runAllChecks, timeline layer first', () => {
    const { compiledScenes, timeline } = buildFixtureProject()
    const corrupted = { ...timeline, totalFrames: 12345 }
    const diagnostics = runAllChecks({ scenes: compiledScenes, timeline: corrupted })
    expect(diagnostics.some((d) => d.code === 'TIMELINE_TOTAL_MISMATCH')).toBe(true)
    // Layer order is fixed: timeline diagnostics come before scene/geometry/render.
    expect(diagnostics[0]!.code).toBe('TIMELINE_TOTAL_MISMATCH')
  })

  it('honours checkRenderBackends:false by skipping layer 5', () => {
    const { compiledScenes, timeline } = buildFixtureProject()
    clearRendererBackends()
    expect(runAllChecks({ scenes: compiledScenes, timeline }).some((d) => d.code === 'RENDERER_BACKEND_MISSING')).toBe(true)
    expect(runAllChecks({ scenes: compiledScenes, timeline, checkRenderBackends: false })).toEqual([])
  })
})
