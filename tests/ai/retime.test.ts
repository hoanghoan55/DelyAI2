import { describe, it, expect } from 'vitest'
import { retimeScenes, RETIME_PADDING_SECONDS, RetimeError } from '@/ai/retime'
import { buildMasterTimeline } from '@/timeline/master'
import type { VoiceTimeline } from '@/timeline/voice'
import type { StorySceneOutline } from '@/ai/story/contract'

const scenes: StorySceneOutline[] = [
  { id: 'scene-001', purpose: 'hook', durationSeconds: 99, title: 't1', narration: 'n1' },
  { id: 'scene-002', purpose: 'outro', durationSeconds: 99, title: 't2', narration: 'n2' },
]
const voice = (end1: number, end2: number): VoiceTimeline => ({
  timingSource: 'exact',
  totalMs: end1 + end2,
  segments: [
    { id: 'a', text: 'n1', startMs: 0, endMs: end1, words: [], timingSource: 'exact', sceneId: 'scene-001' },
    { id: 'b', text: 'n2', startMs: 0, endMs: end2, words: [], timingSource: 'exact', sceneId: 'scene-002' },
  ],
})

describe('retimeScenes', () => {
  it('duration := endMs/1000 + RETIME_PADDING (0.5), everything else preserved', () => {
    const out = retimeScenes(scenes, voice(3200, 1500))
    expect(RETIME_PADDING_SECONDS).toBe(0.5)
    expect(out[0]).toEqual({ ...scenes[0], durationSeconds: 3.7 })
    expect(out[1]).toEqual({ ...scenes[1], durationSeconds: 2.0 })
    expect(out.map((s) => s.narration)).toEqual(['n1', 'n2']) // order untouched
  })

  it('padding is overridable', () => {
    const out = retimeScenes(scenes, voice(1000, 1000), 0)
    expect(out[0]!.durationSeconds).toBe(1.0)
  })

  it('throws RETIME_MISSING_SEGMENT when a scene has no voice segment', () => {
    const partial = { ...voice(1000, 1000) }
    partial.segments = partial.segments.slice(0, 1)
    expect(() => retimeScenes(scenes, partial)).toThrow(RetimeError)
    try { retimeScenes(scenes, partial) } catch (e) { expect((e as RetimeError).code).toBe('RETIME_MISSING_SEGMENT') }
  })

  it('throws RETIME_UNKNOWN_SCENE when a segment names no scene', () => {
    const stray = voice(1000, 1000)
    stray.segments[1]!.sceneId = 'scene-999'
    try { retimeScenes(scenes, stray); throw new Error('should have thrown') }
    catch (e) { expect((e as RetimeError).code).toBe('RETIME_UNKNOWN_SCENE') }
  })
})

describe('strict construction at rounding edges (Review Focus 4)', () => {
  const edgeCases = [
    { fps: 30, endMs: 1001, pad: 0 },
    { fps: 30, endMs: 999, pad: 0 },
    { fps: 29.97, endMs: 1001, pad: 0 },
    { fps: 29.97, endMs: 733, pad: 0 },
    { fps: 29.97, endMs: 1234, pad: 0.5 },
    { fps: 30, endMs: 1234, pad: 0.5 },
  ]
  for (const { fps, endMs, pad } of edgeCases) {
    it(`no VOICE_OVERRUNS_SCENE at fps=${fps} endMs=${endMs} pad=${pad}`, () => {
      const v = voice(endMs, endMs)
      const retimed = retimeScenes(scenes, v, pad)
      const timeline = buildMasterTimeline({
        fps, width: 1920, height: 1080,
        scenes: retimed.map((s) => ({ sceneId: s.id, duration: s.durationSeconds })),
        voice: v, music: null, voiceScenePolicy: 'strict',
      })
      expect(timeline.diagnostics.filter((d) => d.code === 'VOICE_OVERRUNS_SCENE')).toEqual([])
      expect(timeline.totalFrames).toBe(
        timeline.sceneWindows['scene-001']!.durationInFrames + timeline.sceneWindows['scene-002']!.durationInFrames,
      )
    })
  }
})
