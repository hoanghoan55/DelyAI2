import React from 'react'
import { Audio, Sequence } from 'remotion'
import type { VoiceTimeline } from '@/timeline/voice'
import type { MasterTimeline } from '@/timeline/master'

export type VoiceTrackProps = {
  voice: VoiceTimeline | null
  sceneWindows: MasterTimeline['sceneWindows']
  audioSrcBySceneId: Record<string, string>
  /** Render-side adapter (staticFile on the Remotion side; identity in tests/Player). */
  resolveSrc?: (repoRelativePath: string) => string
}

/**
 * One <Sequence><Audio/></Sequence> per voice segment, anchored at the scene's
 * locked window. The renderer consumes data only — no retime, no duration
 * resolution, no audio fallback (spec §9.1, AGENTS.md rule 5).
 */
export const VoiceTrack: React.FC<VoiceTrackProps> = ({ voice, sceneWindows, audioSrcBySceneId, resolveSrc = (p) => p }) => {
  if (!voice || voice.segments.length === 0) return null
  return (
    <>
      {voice.segments
        .map((segment) => {
          const window = sceneWindows[segment.sceneId]
          if (!window) return null // master emitted VOICE_UNKNOWN_SCENE — never invent a window
          const src = audioSrcBySceneId[segment.sceneId]
          if (!src) throw new Error(`VoiceTrack: missing audioSrc for scene "${segment.sceneId}"`)
          return (
            <Sequence key={segment.id} from={window.startFrame} durationInFrames={window.durationInFrames}>
              <Audio src={resolveSrc(src)} />
            </Sequence>
          )
        })
        .filter(Boolean)}
    </>
  )
}
