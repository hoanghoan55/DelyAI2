import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'
import type { VoiceTimeline } from '@/timeline/voice'
import { SceneRenderer } from './SceneRenderer'
import { VoiceTrack } from './VoiceTrack'

export type ProjectVideoProps = {
  scenes: CompiledScene[]
  timeline: MasterTimeline
  voice?: VoiceTimeline | null
  audioSrcBySceneId?: Record<string, string>
  resolveAudioSrc?: (repoRelativePath: string) => string
}

/** Master composition: sequences each compiled scene at its absolute window, voice rides on top. */
export const ProjectVideo: React.FC<ProjectVideoProps> = ({ scenes, timeline, voice, audioSrcBySceneId, resolveAudioSrc }) => (
  <AbsoluteFill style={{ backgroundColor: '#05070d' }}>
    {scenes.map((scene) => (
      <Sequence key={scene.sceneId} from={scene.timing.startFrame} durationInFrames={scene.timing.durationInFrames} premountFor={timeline.fps}>
        <SceneRenderer scene={scene} />
      </Sequence>
    ))}
    <VoiceTrack
      voice={voice ?? null}
      sceneWindows={timeline.sceneWindows}
      audioSrcBySceneId={audioSrcBySceneId ?? {}}
      resolveSrc={resolveAudioSrc}
    />
  </AbsoluteFill>
)
