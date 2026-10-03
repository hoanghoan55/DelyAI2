import { describe, it, expect } from 'vitest'
import { VoiceTrack } from '@/video-engine/runtime/VoiceTrack'
import type { VoiceTimeline } from '@/timeline/voice'
import type { MasterTimeline } from '@/timeline/master'

const windows: MasterTimeline['sceneWindows'] = {
  'scene-001': { startFrame: 0, durationInFrames: 75 },
  'scene-002': { startFrame: 75, durationInFrames: 60 },
}
const voice: VoiceTimeline = {
  timingSource: 'exact', totalMs: 3500,
  segments: [
    { id: 'scene-001-voice', text: 'a', startMs: 0, endMs: 2000, words: [], timingSource: 'exact', sceneId: 'scene-001' },
    { id: 'scene-002-voice', text: 'b', startMs: 0, endMs: 1500, words: [], timingSource: 'exact', sceneId: 'scene-002' },
  ],
}
type El = { type: unknown; props: { from?: number; durationInFrames?: number; src?: string; children?: El | El[] } }
const flatten = (children: El | El[]): El[] => (Array.isArray(children) ? children : [children])

describe('VoiceTrack', () => {
  it('renders one Sequence per segment, anchored at the scene window (spec §9.1)', () => {
    const tree = VoiceTrack({ voice, sceneWindows: windows, audioSrcBySceneId: {
      'scene-001': 'generated/r/voice/scene-001.mp3', 'scene-002': 'generated/r/voice/scene-002.mp3',
    } }) as unknown as El
    const seqs = flatten(tree.props.children!)
    expect(seqs).toHaveLength(2)
    expect(seqs[0]!.props.from).toBe(0)
    expect(seqs[0]!.props.durationInFrames).toBe(75)
    expect(seqs[1]!.props.from).toBe(75)
    expect(seqs[1]!.props.durationInFrames).toBe(60)
    // inner Audio receives the resolved path
    const audio = flatten(seqs[0]!.props.children!)[0]!
    expect(audio.props.src).toBe('generated/r/voice/scene-001.mp3') // identity resolver by default
  })

  it('applies resolveSrc (the staticFile adapter on the render side)', () => {
    const tree = VoiceTrack({
      voice, sceneWindows: windows,
      audioSrcBySceneId: { 'scene-001': 'generated/r/voice/scene-001.mp3', 'scene-002': 'generated/r/voice/scene-002.mp3' },
      resolveSrc: (p) => `/${p}`,
    }) as unknown as El
    const seqs = flatten(tree.props.children!)
    const audio = flatten(seqs[0]!.props.children!)[0]!
    expect(audio.props.src).toBe('/generated/r/voice/scene-001.mp3')
  })

  it('voice=null renders nothing', () => {
    expect(VoiceTrack({ voice: null, sceneWindows: windows, audioSrcBySceneId: {} })).toBeNull()
  })

  it('a segment whose window is unknown is SKIPPED (master owns VOICE_UNKNOWN_SCENE)', () => {
    const stray: VoiceTimeline = { ...voice, segments: [...voice.segments, { id: 'x', text: 'c', startMs: 0, endMs: 100, words: [], timingSource: 'exact', sceneId: 'scene-999' }] }
    const tree = VoiceTrack({ voice: stray, sceneWindows: windows, audioSrcBySceneId: {
      'scene-001': 'a.mp3', 'scene-002': 'b.mp3', 'scene-999': 'c.mp3',
    } }) as unknown as El
    expect(flatten(tree.props.children!)).toHaveLength(2) // stray skipped, not invented
  })

  it('a MISSING audioSrc for a known segment THROWS (loud invariant, no silent fallback)', () => {
    expect(() => VoiceTrack({
      voice, sceneWindows: windows,
      audioSrcBySceneId: { 'scene-001': 'a.mp3' }, // scene-002 missing
    })).toThrow(/missing audioSrc.*scene-002/)
  })
})
