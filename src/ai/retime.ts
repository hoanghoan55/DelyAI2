import type { StorySceneOutline } from './story/contract'
import type { VoiceTimeline } from '@/timeline/voice'

export const RETIME_PADDING_SECONDS = 0.5 // spec §5.2

export class RetimeError extends Error {
  constructor(readonly code: 'RETIME_MISSING_SEGMENT' | 'RETIME_UNKNOWN_SCENE', message: string) {
    super(`${code}: ${message}`); this.name = 'RetimeError'
  }
}

/** Audio is the authority (spec §3): final scene duration comes from measured audio + padding,
 *  never from StoryPlan.durationSeconds (estimate only). */
export function retimeScenes(
  scenes: StorySceneOutline[],
  voice: VoiceTimeline,
  paddingSeconds: number = RETIME_PADDING_SECONDS,
): StorySceneOutline[] {
  const segmentByScene = new Map(voice.segments.map((s) => [s.sceneId, s]))
  const sceneIds = new Set(scenes.map((s) => s.id))

  for (const segment of voice.segments) {
    if (!sceneIds.has(segment.sceneId)) {
      throw new RetimeError('RETIME_UNKNOWN_SCENE', `voice segment "${segment.id}" names unknown scene "${segment.sceneId}"`)
    }
  }
  return scenes.map((scene) => {
    const segment = segmentByScene.get(scene.id)
    if (!segment) throw new RetimeError('RETIME_MISSING_SEGMENT', `scene "${scene.id}" has no voice segment`)
    return { ...scene, durationSeconds: segment.endMs / 1000 + paddingSeconds }
  })
}
