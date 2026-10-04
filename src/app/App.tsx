import React from 'react'
import type { FixtureProject } from '@/ai/project'
import { ProjectPlayer } from './ProjectPlayer'
import { GeneratePanel } from './GeneratePanel'

/**
 * Pure function of its props: it never builds the project itself. The entry
 * point registers backends and compiles the fixture (in that order) before
 * rendering, so no module-scope work depends on registration having run.
 */
export const App: React.FC<{ project: FixtureProject }> = ({ project }) => (
  <main style={{ maxWidth: 1080, margin: '0 auto', padding: 24 }}>
    <h1 style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>DeLyAI2 — Video Engine Phase 0</h1>
    <p style={{ fontFamily: 'Inter, system-ui, sans-serif', opacity: 0.7 }}>
      {project.compiledScenes.length} scenes · {project.timeline.totalFrames} frames @ {project.timeline.fps}fps
    </p>
    <ProjectPlayer compiledScenes={project.compiledScenes} timeline={project.timeline} />
    <GeneratePanel />
  </main>
)
