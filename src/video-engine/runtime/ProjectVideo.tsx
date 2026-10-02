import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'
import { SceneRenderer } from './SceneRenderer'

export type ProjectVideoProps = { scenes: CompiledScene[]; timeline: MasterTimeline }

/** Master composition: sequences each compiled scene at its absolute window. */
export const ProjectVideo: React.FC<ProjectVideoProps> = ({ scenes, timeline }) => (
  <AbsoluteFill style={{ backgroundColor: '#05070d' }}>
    {scenes.map((scene) => (
      <Sequence key={scene.sceneId} from={scene.timing.startFrame} durationInFrames={scene.timing.durationInFrames} premountFor={timeline.fps}>
        <SceneRenderer scene={scene} />
      </Sequence>
    ))}
  </AbsoluteFill>
)
