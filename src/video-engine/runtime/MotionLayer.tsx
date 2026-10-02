import React from 'react'
import type { CompiledLayer, RenderSettings } from '@/video-engine/ir'
import { applyMotion } from '@/video-engine/motion'

/**
 * Applies a layer's motion as a CSS transform around its content. Kept separate
 * from renderer backends so recipes never receive or return transforms.
 */
export const MotionLayer: React.FC<{ layer: CompiledLayer; absoluteFrame: number; render: RenderSettings; children: React.ReactNode }> = ({ layer, absoluteFrame, render, children }) => {
  const t = applyMotion(layer, absoluteFrame, render.fps)
  return (
    <div style={{
      width: '100%', height: '100%',
      opacity: t.opacity,
      transform: `translate(${t.x * 100}%, ${t.y * 100}%) scale(${t.scale}) rotate(${t.rotate}deg)`,
      transformOrigin: 'center center',
    }}>
      {children}
    </div>
  )
}
