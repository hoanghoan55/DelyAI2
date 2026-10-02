import React from 'react'
import { interpolate, useVideoConfig } from 'remotion'
import type { CompiledTypography } from '@/video-engine/ir'

export const TypographyLayer: React.FC<{ typography: CompiledTypography; sceneLocalFrame: number }> = ({ typography, sceneLocalFrame }) => {
  const { fps } = useVideoConfig()
  const local = sceneLocalFrame - typography.frameWindow.from
  const progress = interpolate(local, [0, Math.round(fps * 0.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const opacity = typography.animation === 'none' ? 1 : progress
  const visible = typography.animation === 'typewriter'
    ? typography.text.slice(0, Math.ceil(typography.text.length * progress))
    : typography.text
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f7f9ff', opacity, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 96, fontWeight: 700, letterSpacing: -1, textAlign: 'center', padding: 80 }}>
      {visible}
    </div>
  )
}
