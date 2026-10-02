import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerBackends } from '@/video-engine/runtime'
import { buildFixtureProject } from '@/ai/project'
import { App } from './App'
import './app.css'

// Register recipes and renderer backends before the first render. This must run
// before buildFixtureProject(): the fixture's compile step requires them.
registerBackends()

// Compile the fixture once, here in the entry, after registration.
const project = buildFixtureProject()

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')
createRoot(container).render(<App project={project} />)
