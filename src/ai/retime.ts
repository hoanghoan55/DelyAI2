import type { StorySceneOutline } from './story/contract'
import type { VoiceTimeline, VoiceSegment } from '@/timeline/voice'

export const RETIME_PADDING_SECONDS = 0.5 // spec §5.2

export class RetimeError extends Error {
  constructor(
    readonly code: 'RETIME_MISSING_SEGMENT' | 'RETIME_UNKNOWN_SCENE' | 'RETIME_DUPLICATE_SEGMENT',
    message: string,
  ) {
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
  // Bijection (spec §3): exactly one segment per scene. Map last-wins would silently
  // retime a scene against the wrong audio, so a repeated sceneId is a hard failure.
  const segmentByScene = new Map<string, VoiceSegment>()
  for (const segment of voice.segments) {
    const claimed = segmentByScene.get(segment.sceneId)
    if (claimed) {
      throw new RetimeError(
        'RETIME_DUPLICATE_SEGMENT',
        `scene "${segment.sceneId}" is claimed by more than one voice segment ("${claimed.id}" and "${segment.id}")`,
      )
    }
    segmentByScene.set(segment.sceneId, segment)
  }
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
