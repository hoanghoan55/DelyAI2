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
import { clearRendererBackends, clearRegistry, registerComposition } from '@/video-engine/registry'
import { buildMasterTimeline } from '@/timeline/master'
import type { MasterTimeline } from '@/timeline/master'
import { buildFixtureProject } from '@/ai/project'
import { registerBackends } from '@/video-engine/runtime'
import type { CompiledLayer, CompiledScene } from '@/video-engine/ir'

beforeEach(() => {
  clearRegistry()
  clearRendererBackends()
  registerBackends()
})

/** A minimal but well-formed compiled scene, for hand-registered layout tests. */
function makeGeometryScene(sceneId: string, compositionId: string, slots: string[]): CompiledScene {
  return {
    irVersion: '0.1',
    sceneId,
    seed: 1,
    render: { fps: 30, width: 1920, height: 1080 },
    timing: { startFrame: 0, durationInFrames: 180 },
    composition: { id: compositionId, slots },
    layers: [],
    typography: null,
    events: [],
    audio: [],
    diagnostics: [],
    provenance: { engineVersion: '0.1', sourceHash: '', compiledHash: '' },
  }
}

describe('qa layers', () => {
  it('checkSchema reports an error path for a malformed project', () => {
    const d = checkSchema({ dslVersion: '0.1', scenes: [{ sceneId: 'x' }] })
    expect(d.some((x) => x.severity === 'error' && x.code === 'SCHEMA_INVALID')).toBe(true)
    // The mapping must carry the offending path, not just a code.
    expect(d.some((x) => x.message.includes('scenes.0'))).toBe(true)
  })
  it('checkTimeline verifies contiguity, overlap and totalFrames', () => {
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
    // Second window pushed forward: a gap.
    const gapped = { ...t, sceneWindows: { a: t.sceneWindows.a!, b: { ...t.sceneWindows.b!, startFrame: 999 } } }
    expect(checkTimeline(gapped).some((x) => x.code === 'TIMELINE_GAP')).toBe(true)
    // Second window pulled backward: an overlap, not a gap.
    const overlapped = { ...t, sceneWindows: { a: t.sceneWindows.a!, b: { ...t.sceneWindows.b!, startFrame: 10 } } }
    expect(checkTimeline(overlapped).some((x) => x.code === 'TIMELINE_OVERLAP')).toBe(true)
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

describe('geometry overlap (spec §9 "overlap sai")', () => {
  it('flags two genuinely overlapping slots, naming both', () => {
    registerComposition({
      id: 'overlap-compo',
      version: '1.0.0',
      slots: [
        { id: 'left', role: 'primary' },
        { id: 'right', role: 'secondary' },
      ],
      layout: () => [
        { slot: 'left', x: 0, y: 0, width: 1000, height: 1080 },
        { slot: 'right', x: 900, y: 0, width: 1020, height: 1080 },
      ],
    })
    const scene = makeGeometryScene('scene-overlap', 'overlap-compo', ['left', 'right'])
    const diagnostics = checkGeometry([scene])
    const overlap = diagnostics.find((d) => d.code === 'QA_SLOT_OVERLAP')
    expect(overlap).toBeDefined()
    expect(overlap!.message).toContain('left')
    expect(overlap!.message).toContain('right')
  })

  it('does NOT flag slots that only share an edge (split/grid tiles)', () => {
    registerComposition({
      id: 'touching-compo',
      version: '1.0.0',
      slots: [
        { id: 'main', role: 'primary' },
        { id: 'aside', role: 'secondary' },
      ],
      layout: () => [
        { slot: 'main', x: 0, y: 0, width: 960, height: 1080 },
        { slot: 'aside', x: 960, y: 0, width: 960, height: 1080 },
      ],
    })
    const scene = makeGeometryScene('scene-touching', 'touching-compo', ['main', 'aside'])
    expect(checkGeometry([scene]).filter((d) => d.code === 'QA_SLOT_OVERLAP')).toEqual([])
  })

  it('flags a slot rect that leaves the frame', () => {
    registerComposition({
      id: 'oof-compo',
      version: '1.0.0',
      slots: [{ id: 'main', role: 'primary' }],
      layout: () => [{ slot: 'main', x: 1900, y: 0, width: 200, height: 1080 }], // 1900+200 > 1920
    })
    const scene = makeGeometryScene('scene-oof', 'oof-compo', ['main'])
    expect(checkGeometry([scene]).some((d) => d.code === 'QA_SLOT_OUT_OF_FRAME')).toBe(true)
  })

  it('flags a zero-area slot as degenerate (inside the frame), not out-of-frame', () => {
    registerComposition({
      id: 'zero-compo',
      version: '1.0.0',
      slots: [{ id: 'main', role: 'primary' }],
      layout: () => [{ slot: 'main', x: 100, y: 100, width: 0, height: 0 }],
    })
    const scene = makeGeometryScene('scene-zero', 'zero-compo', ['main'])
    const diagnostics = checkGeometry([scene])
    expect(diagnostics.some((d) => d.code === 'QA_SLOT_DEGENERATE')).toBe(true)
    // The two checks are independent `if`s: a zero-area rect strictly inside the
    // frame is degenerate only — it must not also be reported out-of-frame.
    expect(diagnostics.some((d) => d.code === 'QA_SLOT_OUT_OF_FRAME')).toBe(false)
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

describe('layers are total (never throw on structurally-malformed input)', () => {
  it('checkTimeline survives a missing timeline/sceneWindows and reports a null window', () => {
    expect(() => checkTimeline(null as never)).not.toThrow()
    expect(() => checkTimeline(undefined as never)).not.toThrow()
    expect(() => checkTimeline({} as never)).not.toThrow()
    expect(() => checkTimeline({ sceneWindows: null } as never)).not.toThrow()

    const t = buildMasterTimeline({
      fps: 30,
      width: 1920,
      height: 1080,
      voiceScenePolicy: 'strict',
      scenes: [{ sceneId: 'a', duration: 6 }],
    })
    const withNullWindow = { ...t, sceneWindows: { a: null } } as unknown as MasterTimeline
    const diagnostics = checkTimeline(withNullWindow)
    // Still names the offender instead of dereferencing it.
    expect(diagnostics.some((d) => d.code === 'TIMELINE_BAD_WINDOW' && d.sceneId === 'a')).toBe(true)
  })

  it('checkScenes survives null scenes/layers and a missing frameWindow, naming the offender', () => {
    expect(() => checkScenes(null as never)).not.toThrow()
    expect(() => checkScenes(undefined as never)).not.toThrow()
    expect(() => checkScenes([null] as never)).not.toThrow()
    expect(() => checkScenes([{}] as never)).not.toThrow()
    // A scene with no composition must still yield a diagnostic, not a throw.
    expect(checkScenes([{} as never]).some((d) => d.code === 'QA_UNKNOWN_COMPOSITION')).toBe(true)
    expect(checkScenes([null] as never).some((d) => d.code === 'QA_INVALID_SCENE')).toBe(true)

    const { compiledScenes } = buildFixtureProject()
    const split = compiledScenes.find((s) => s.sceneId === 'scene-split')!
    const target = split.layers[0]!
    const badLayer = { ...target, frameWindow: undefined } as unknown as CompiledLayer
    const scene: CompiledScene = { ...split, layers: [badLayer] }
    expect(() => checkScenes([scene])).not.toThrow()
    const diag = checkScenes([scene]).find((d) => d.code === 'QA_INVALID_LAYER_WINDOW')
    expect(diag).toBeDefined()
    expect(diag!.sceneId).toBe('scene-split')
    expect(diag!.layerId).toBe(target.id)
  })

  it('checkGeometry survives null/partial scenes and a missing render', () => {
    expect(() => checkGeometry(null as never)).not.toThrow()
    expect(() => checkGeometry([null] as never)).not.toThrow()
    expect(() => checkGeometry([{}] as never)).not.toThrow()
    const { compiledScenes } = buildFixtureProject()
    const noRender = { ...compiledScenes[0]!, render: undefined } as unknown as CompiledScene
    expect(() => checkGeometry([noRender])).not.toThrow()
  })

  it('checkRender survives a null layer list and a null layer entry', () => {
    expect(() => checkRender(null as never)).not.toThrow()
    expect(() => checkRender(undefined as never)).not.toThrow()
    expect(() => checkRender([null] as never)).not.toThrow()
    expect(checkRender([null] as never).some((d) => d.code === 'QA_INVALID_LAYER')).toBe(true)
  })
})
