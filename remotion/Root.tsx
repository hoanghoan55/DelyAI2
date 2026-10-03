import React from 'react'
import { Composition } from 'remotion'
import { DemoComposition } from './DemoComposition'
import { demoProject } from './project'

const { timeline } = demoProject

/** Registered composition. Every metadata field is derived from the master timeline. */
export const RemotionRoot: React.FC = () => (
  <Composition
    id="DeLyDemo"
    component={DemoComposition}
    durationInFrames={timeline.totalFrames}
    fps={timeline.fps}
    width={timeline.width}
    height={timeline.height}
  />
)
