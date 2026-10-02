import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { resolveComposition } from '@/video-engine/registry'
import type { CompiledScene } from '@/video-engine/ir'
import { LayerRenderer } from './LayerRenderer'
import { TypographyLayer } from './TypographyLayer'
import { absoluteFrameOf, layerLocalFrame } from './frame-math'

export const SceneRenderer: React.FC<{ scene: CompiledScene }> = ({ scene }) => {
  const sceneLocalFrame = useCurrentFrame()
  const composition = resolveComposition(scene.composition.id)
  const rects = composition.layout({ slots: scene.composition.slots, render: scene.render, style: {} })
  const rectBySlot = new Map(rects.map((r) => [r.slot, r]))

  return (
    <AbsoluteFill style={{ backgroundColor: '#05070d' }}>
      {scene.layers.map((layer) => {
        const rect = rectBySlot.get(layer.slot)
        if (!rect) return null
        const localFrame = layerLocalFrame(layer.frameWindow, sceneLocalFrame)
        const absoluteFrame = absoluteFrameOf(scene.timing, localFrame)
        return (
          <AbsoluteFill key={layer.id} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, overflow: 'hidden' }}>
            <LayerRenderer layer={layer} absoluteFrame={absoluteFrame} render={scene.render} seed={scene.seed} />
          </AbsoluteFill>
        )
      })}
      {scene.typography ? (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <TypographyLayer typography={scene.typography} sceneLocalFrame={sceneLocalFrame} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  )
}
