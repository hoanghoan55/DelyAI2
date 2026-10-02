import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerBackends } from '@/video-engine/runtime'
import { App } from './App'
import './app.css'

// Register recipes and renderer backends before the first render.
registerBackends()

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')
createRoot(container).render(<App />)
