import { describe, it, expect } from 'vitest'
import { buildMasterTimeline } from '@/timeline/master'
import type { VoiceTimeline } from '@/timeline/voice'

describe('buildMasterTimeline', () => {
  it('accumulates scene windows contiguously with no gaps', () => {
    const mt = buildMasterTimeline({
      fps: 30, width: 1920, height: 1080,
      scenes: [
        { sceneId: 'scene-01', duration: 6 },
        { sceneId: 'scene-02', duration: 9 },
        { sceneId: 'scene-03', duration: 9 },
        { sceneId: 'scene-04', duration: 6 },
      ],
      voiceScenePolicy: 'strict',
    })
    expect(mt.sceneWindows['scene-01']).toEqual({ startFrame: 0, durationInFrames: 180 })
    expect(mt.sceneWindows['scene-02']).toEqual({ startFrame: 180, durationInFrames: 270 })
    expect(mt.sceneWindows['scene-03']).toEqual({ startFrame: 450, durationInFrames: 270 })
    expect(mt.sceneWindows['scene-04']).toEqual({ startFrame: 720, durationInFrames: 180 })
    expect(mt.totalFrames).toBe(900)
  })

  it('has no gap and no overlap at 29.97fps (Review Focus #5)', () => {
    const mt = buildMasterTimeline({
      fps: 29.97, width: 1920, height: 1080,
      scenes: [{ sceneId: 'a', duration: 2.5 }, { sceneId: 'b', duration: 3.3 }, { sceneId: 'c', duration: 1.7 }],
      voiceScenePolicy: 'strict',
    })
    let cursor = 0
    for (const id of ['a', 'b', 'c']) {
      const w = mt.sceneWindows[id]!
      expect(w.startFrame).toBe(cursor)
      cursor += w.durationInFrames
    }
    expect(cursor).toBe(mt.totalFrames)
  })

  it('strict policy keeps window and warns when voice overruns (Review Focus #3)', () => {
    const voice: VoiceTimeline = {
      timingSource: 'fixture', totalMs: 8000,
      segments: [{ id: 's1', text: 'hi', startMs: 0, endMs: 8000, words: [], timingSource: 'fixture', sceneId: 'scene-01' }],
    }
    const mt = buildMasterTimeline({
      fps: 30, width: 1920, height: 1080,
      scenes: [{ sceneId: 'scene-01', duration: 6 }], voice, voiceScenePolicy: 'strict',
    })
    expect(mt.sceneWindows['scene-01']!.durationInFrames).toBe(180)
    expect(mt.diagnostics.some((d) => d.code === 'VOICE_OVERRUNS_SCENE')).toBe(true)
  })

  it('emits VOICE_UNKNOWN_SCENE for a segment pointing at a missing scene', () => {
    const voice: VoiceTimeline = {
      timingSource: 'fixture', totalMs: 1000,
      segments: [{ id: 's1', text: 'x', startMs: 0, endMs: 1000, words: [], timingSource: 'fixture', sceneId: 'ghost' }],
    }
    const mt = buildMasterTimeline({
      fps: 30, width: 1920, height: 1080, scenes: [{ sceneId: 'scene-01', duration: 6 }], voice, voiceScenePolicy: 'strict',
    })
    expect(mt.diagnostics.some((d) => d.code === 'VOICE_UNKNOWN_SCENE')).toBe(true)
  })
})
