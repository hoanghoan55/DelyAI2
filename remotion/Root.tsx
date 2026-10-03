import React from 'react'
import { Composition } from 'remotion'
import { DemoComposition } from './DemoComposition'
import { demoProject } from './project'
import type { ProjectVideoProps } from '@/video-engine/runtime'

const { timeline } = demoProject

const defaultProps: ProjectVideoProps = {
  scenes: demoProject.compiledScenes,
  timeline: demoProject.timeline,
  voice: null,
  audioSrcBySceneId: undefined,
}

/**
 * Every metadata field derives from props.timeline: static values feed the
 * Phase 0 fixture, calculateMetadata re-derives them for --props runs (spec §8).
 * `--props` hands Remotion the nested render-props artifact, so unwrap
 * `{ payload }` before reading (flat defaultProps has no payload → unchanged).
 */
export const RemotionRoot: React.FC = () => (
  <Composition
    id="DeLyDemo"
    component={DemoComposition}
    durationInFrames={timeline.totalFrames}
    fps={timeline.fps}
    width={timeline.width}
    height={timeline.height}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => {
      const p = ((props as { payload?: ProjectVideoProps }).payload) ?? props
      return {
        durationInFrames: p.timeline.totalFrames,
        fps: p.timeline.fps,
        width: p.timeline.width,
        height: p.timeline.height,
      }
    }}
  />
)
