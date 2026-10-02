import React from 'react'
import { Player } from '@remotion/player'
import { ProjectVideo } from '@/video-engine/runtime'
import { toPlayerProps, type ProjectPlayerProps } from './player-props'

export type { ProjectPlayerProps }

/**
 * Thin wrapper: the shell owns no timing logic. It passes the compiled scenes
 * and the master timeline straight through to the renderer.
 */
export const ProjectPlayer: React.FC<ProjectPlayerProps> = (props) => (
  <Player
    component={ProjectVideo}
    {...toPlayerProps(props)}
    style={{ width: '100%', aspectRatio: `${props.timeline.width} / ${props.timeline.height}` }}
    controls
    autoPlay={props.autoPlay ?? true}
    loop
  />
)
