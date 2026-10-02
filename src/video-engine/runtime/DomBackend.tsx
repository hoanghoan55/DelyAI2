import React from 'react'
import type { RendererBackendProps } from '@/video-engine/registry'

/** Fallback DOM renderer backend: renders a labeled placeholder box per layer. */
export const DomBackend: React.FC<RendererBackendProps> = ({ layer }) => (
  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(247,249,255,0.5)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 24 }}>
    {layer.recipeId}
  </div>
)
