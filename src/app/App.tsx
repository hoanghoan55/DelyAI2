import React from 'react'
import { buildFixtureProject } from '@/ai/project'
import { ProjectPlayer } from './ProjectPlayer'

const project = buildFixtureProject()

export const App: React.FC = () => (
  <main style={{ maxWidth: 1080, margin: '0 auto', padding: 24 }}>
    <h1 style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>DeLyAI2 — Video Engine Phase 0</h1>
    <p style={{ fontFamily: 'Inter, system-ui, sans-serif', opacity: 0.7 }}>
      {project.compiledScenes.length} scenes · {project.timeline.totalFrames} frames @ {project.timeline.fps}fps
    </p>
    <ProjectPlayer compiledScenes={project.compiledScenes} timeline={project.timeline} />
  </main>
)
