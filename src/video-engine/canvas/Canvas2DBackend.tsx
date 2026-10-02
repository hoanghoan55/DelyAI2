import React, { useEffect, useRef } from 'react'
import { useCurrentFrame } from 'remotion'
import { createSeededRandom } from '@/shared'
import type { RendererBackendProps } from '@/video-engine/registry'
import { getCanvasRecipe } from './canvas-registry'
import type { CanvasState } from './types'

/**
 * Renders a canvas2d layer. Drawing is a pure function of `frame` — never
 * wall-clock time — so the same input renders identically. State is per layer
 * instance and disposed on unmount.
 */
export const Canvas2DBackend: React.FC<RendererBackendProps> = ({ layer, absoluteFrame, render }) => {
  const frame = useCurrentFrame()
  const ref = useRef<HTMLCanvasElement>(null)
  const recipe = getCanvasRecipe(layer.recipeId)
  const stateRef = useRef<CanvasState | null>(null)

  if (stateRef.current === null) {
    stateRef.current = recipe.prepare ? recipe.prepare(null, { width: render.width, height: render.height }, layer.params as never) : {}
  }

  useEffect(() => {
    const current = stateRef.current
    return () => {
      if (current && recipe.dispose) recipe.dispose(current)
    }
  }, [recipe])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rng = createSeededRandom((layer.id.length * 131 + absoluteFrame * 17) >>> 0)
    recipe.render(ctx, {
      frame: absoluteFrame, fps: render.fps, size: { width: render.width, height: render.height },
      params: layer.params as never, state: stateRef.current!, rng,
    })
  }, [absoluteFrame, frame, layer.id, layer.params, recipe, render])

  return <canvas ref={ref} width={render.width} height={render.height} style={{ width: '100%', height: '100%' }} />
}
