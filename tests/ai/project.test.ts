import { describe, it, expect, beforeEach } from 'vitest'
import { buildProject, buildFixtureProject, diagnoseScenes } from '@/ai/project'
import { demoProjectDsl } from '@/ai/demo-project.dsl'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import type { VoiceTimeline } from '@/timeline/voice'
import type { SceneDSL } from '@/video-engine/schema'

beforeEach(() => { clearRegistered(); registerBackends() })

describe('buildProject', () => {
  it('parse → timeline(with voice) → compile; timeline.voice is the voice passed in', () => {
    const voice: VoiceTimeline = {
      timingSource: 'exact',
      totalMs: 500,
      segments: [{ id: 'v1', text: 'x', startMs: 0, endMs: 500, words: [], timingSource: 'exact', sceneId: 'scene-hero' }],
    }
    const project = buildProject({ dsl: demoProjectDsl, voice })
    expect(project.timeline.voice).toBe(voice)
    expect(project.compiledScenes).toHaveLength(demoProjectDsl.scenes.length)
    expect(project.dsl).toEqual(demoProjectDsl)
    expect(project.timeline.totalFrames).toBe(900)
  })

  it('buildFixtureProject delegates: voice null, same shape as before', () => {
    const fixture = buildFixtureProject()
    expect(fixture.timeline.voice).toBeNull()
    expect(fixture.compiledScenes.map((s) => s.sceneId)).toEqual(['scene-hero', 'scene-split', 'scene-network', 'scene-outro'])
  })
})

describe('diagnoseScenes', () => {
  it('returns no diagnostics for a project that compiles clean', () => {
    const project = buildFixtureProject()
    expect(diagnoseScenes(project.dsl.scenes, project.timeline)).toEqual([])
  })

  it('captures CompilerError diagnostics naming the unknown composition', () => {
    const project = buildFixtureProject()
    // `SceneDSL.composition` is a string id (CompositionIdSchema), not an
    // object — the unknown composition must be named by its id for the
    // CompilerError message to carry it.
    const broken: SceneDSL = { ...project.dsl.scenes[0]!, composition: 'does-not-exist' }
    const diagnostics = diagnoseScenes([broken, ...project.dsl.scenes.slice(1)], project.timeline)
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics.some((d) => d.message.includes('does-not-exist'))).toBe(true)
    expect(diagnostics.every((d) => d.severity === 'error')).toBe(true)
  })
})
