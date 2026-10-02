import { describe, it, expect } from 'vitest'
import { SceneDSLSchema, ProjectDSLSchema, parseProjectDsl, type SceneDSL } from '@/video-engine/schema'

const validScene: SceneDSL = {
  schemaVersion: '0.1',
  sceneId: 'scene-01',
  purpose: 'hook',
  duration: 6,
  composition: 'hero',
  visual: [{ recipe: 'particle-field', params: { count: 40 } }],
  motion: [{ recipe: 'fade', params: {} }],
  typography: { text: 'Deploy in seconds', animation: 'reveal' },
  audio: [],
  events: [],
  style: { styleId: 'default' },
  seed: 12345,
}

describe('SceneDSLSchema', () => {
  it('accepts a valid scene', () => {
    expect(SceneDSLSchema.safeParse(validScene).success).toBe(true)
  })
  it('rejects unknown top-level fields (strict)', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, renderer: 'three' }).success).toBe(false)
  })
  it('accepts the optional backdropRenderer', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, backdropRenderer: 'three' }).success).toBe(true)
  })
  it('rejects an unknown purpose', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, purpose: 'nope' }).success).toBe(false)
  })
  it('rejects a non-positive duration', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, duration: 0 }).success).toBe(false)
  })
  it('rejects a NaN duration (Review Focus #1)', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, duration: NaN }).success).toBe(false)
  })
  it('rejects Infinity duration (Review Focus #1)', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, duration: Infinity }).success).toBe(false)
  })
  it('rejects a non-array visual', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, visual: 'const x = 1' }).success).toBe(false)
  })
  it('defaults empty arrays and null typography when omitted', () => {
    const minimal = { ...validScene }
    delete (minimal as Record<string, unknown>).visual
    delete (minimal as Record<string, unknown>).motion
    delete (minimal as Record<string, unknown>).typography
    const parsed = SceneDSLSchema.safeParse(minimal)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.visual).toEqual([])
      expect(parsed.data.typography).toBeNull()
    }
  })
})

describe('ProjectDSLSchema', () => {
  it('accepts a project wrapping two scenes and defaults the voice policy to strict', () => {
    const project = {
      dslVersion: '0.1',
      project: { id: 'p1', title: 'Demo', language: 'vi' },
      render: { fps: 30, width: 1920, height: 1080 },
      seed: 1,
      music: null,
      scenes: [validScene, { ...validScene, sceneId: 'scene-02' }],
    }
    const parsed = ProjectDSLSchema.safeParse(project)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.voiceScenePolicy).toBe('strict')
  })
  it('rejects an empty scene list', () => {
    const parsed = ProjectDSLSchema.safeParse({
      dslVersion: '0.1', project: { id: 'p1', title: 'Demo', language: 'vi' },
      render: { fps: 30, width: 1920, height: 1080 }, seed: 1, scenes: [],
    })
    expect(parsed.success).toBe(false)
  })
  it('parseProjectDsl throws a readable error on bad input', () => {
    expect(() => parseProjectDsl({ dslVersion: '9.9' })).toThrow(/Invalid project DSL/)
  })
})
