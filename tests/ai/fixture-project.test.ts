import { describe, it, expect, beforeEach } from 'vitest'
import { buildFixtureProject } from '@/ai/project'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'

beforeEach(() => { clearRegistered(); registerBackends() })

describe('fixture project', () => {
  it('compiles four scenes on a 900-frame timeline', () => {
    const { compiledScenes, timeline } = buildFixtureProject()
    expect(compiledScenes).toHaveLength(4)
    expect(timeline.totalFrames).toBe(900)
    expect(compiledScenes.map((s) => s.timing.startFrame)).toEqual([0, 180, 450, 720])
    expect(compiledScenes.map((s) => s.timing.durationInFrames)).toEqual([180, 270, 270, 180])
  })
  it('scene windows are contiguous with no gaps or overlaps', () => {
    const { compiledScenes, timeline } = buildFixtureProject()
    for (let i = 1; i < compiledScenes.length; i++) {
      const prev = compiledScenes[i - 1]!.timing
      expect(compiledScenes[i]!.timing.startFrame).toBe(prev.startFrame + prev.durationInFrames)
    }
    const last = compiledScenes[compiledScenes.length - 1]!.timing
    expect(last.startFrame + last.durationInFrames).toBe(timeline.totalFrames)
  })
  it('renders a canvas2d layer and a three layer somewhere in the project', () => {
    const { compiledScenes } = buildFixtureProject()
    const renderers = compiledScenes.flatMap((s) => s.layers.map((l) => l.renderer))
    expect(renderers).toContain('canvas2d')
    expect(renderers).toContain('three')
  })
  it('matches the spec §11 renderer-per-scene table exactly', () => {
    const { compiledScenes } = buildFixtureProject()
    // Spec §11: 1 Hero = DOM, 2 Split = DOM + Canvas 2D, 3 Network = Three.js, 4 Outro = DOM.
    // A scene's renderer set is the set of its visual layers' renderers; DOM text
    // (typography) adds no renderer. Scenes 1 and 4 are DOM-only, so they have no
    // visual layers — the test asserts that, so a decorative canvas recipe cannot
    // drift in and silently change the table.
    const perScene = compiledScenes.map((s) => [...new Set(s.layers.map((l) => l.renderer))].sort())
    expect(perScene).toEqual([[], ['canvas2d'], ['three'], []])
    // Every scene still shows text; DOM-only means "no visual layer", not "empty scene".
    expect(compiledScenes.every((s) => s.typography !== null)).toBe(true)
  })
  it('compilation is deterministic: same DSL yields the same compiledHash', () => {
    const a = buildFixtureProject().compiledScenes.map((s) => s.provenance.compiledHash)
    const b = buildFixtureProject().compiledScenes.map((s) => s.provenance.compiledHash)
    expect(a).toEqual(b)
  })
})
