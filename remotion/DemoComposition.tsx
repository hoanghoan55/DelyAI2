import React from 'react'
import { ProjectVideo } from '@/video-engine/runtime'
import { demoProject } from './project'

/** The Phase 0 vertical slice: the deterministic demo video, sized by the master timeline. */
export const DemoComposition: React.FC = () => (
  <ProjectVideo scenes={demoProject.compiledScenes} timeline={demoProject.timeline} />
)
