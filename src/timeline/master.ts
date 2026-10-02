import { secondsToFrames, msToFrames, beatToFrame } from './convert'
import type { VoiceTimeline } from './voice'
import type { MusicTimeline } from './music'
import type { Diagnostic } from './diagnostics'

export type SceneWindow = { startFrame: number; durationInFrames: number }
export type MasterEvent = { atFrame: number; scope: 'global' | string; kind: string; payload: Record<string, unknown> }

export type MasterTimeline = {
  fps: number
  width: number
  height: number
  totalFrames: number
  sceneWindows: Record<string, SceneWindow>
  voice: VoiceTimeline | null
  music: MusicTimeline | null
  events: MasterEvent[]
  diagnostics: Diagnostic[]
}

export type VoiceScenePolicy = 'strict' | 'extend_to_voice' | 'stretch_to_voice'

export type BuildMasterTimelineInput = {
  fps: number
  width: number
  height: number
  scenes: { sceneId: string; duration: number }[]
  voice?: VoiceTimeline | null
  music?: MusicTimeline | null
  voiceScenePolicy: VoiceScenePolicy
  globalEvents?: Omit<MasterEvent, 'scope'>[]
}

export function buildMasterTimeline(input: BuildMasterTimelineInput): MasterTimeline {
  const { fps } = input
  const diagnostics: Diagnostic[] = []

  // Contiguous integer-frame accumulation — never round cumulative seconds,
  // which would introduce gaps/overlaps at 29.97fps.
  const sceneWindows: Record<string, SceneWindow> = {}
  let cursor = 0
  for (const scene of input.scenes) {
    const durationInFrames = secondsToFrames(scene.duration, fps)
    sceneWindows[scene.sceneId] = { startFrame: cursor, durationInFrames }
    cursor += durationInFrames
  }
  const totalFrames = cursor

  const voice = input.voice ?? null
  if (voice) {
    for (const segment of voice.segments) {
      const window = sceneWindows[segment.sceneId]
      if (!window) {
        diagnostics.push({
          severity: 'error', code: 'VOICE_UNKNOWN_SCENE', sceneId: segment.sceneId,
          message: `Voice segment "${segment.id}" references unknown scene "${segment.sceneId}".`,
        })
        continue
      }
      if (segment.timingSource === 'estimated') {
        diagnostics.push({
          severity: 'warning', code: 'VOICE_ESTIMATED_TIMING', sceneId: segment.sceneId,
          message: `Voice segment "${segment.id}" uses estimated timing; it is not exact.`,
        })
      }
      // Under "strict" the scene window is authoritative: overrun is reported, never absorbed.
      if (msToFrames(segment.endMs, fps) > window.durationInFrames && input.voiceScenePolicy === 'strict') {
        diagnostics.push({
          severity: 'warning', code: 'VOICE_OVERRUNS_SCENE', sceneId: segment.sceneId,
          message: `Voice segment "${segment.id}" ends after scene "${segment.sceneId}" window under "strict" policy.`,
        })
      }
    }
  }

  const events: MasterEvent[] = (input.globalEvents ?? []).map((e) => ({ ...e, scope: 'global' as const }))
  if (input.music) {
    for (const me of input.music.events) {
      events.push({ atFrame: beatToFrame(me.atBeat, input.music.bpm, fps), scope: 'global', kind: me.kind, payload: me.payload })
    }
  }

  return { fps, width: input.width, height: input.height, totalFrames, sceneWindows, voice, music: input.music ?? null, events, diagnostics }
}
