import React from 'react'
import { ThreeCanvas } from '@remotion/three'
import { createSeededRandom } from '@/shared'
import type { RendererBackendProps } from '@/video-engine/registry'
import { getThreeRecipe } from './three-registry'
import type { ThreeBuildArgs } from './types'

/**
 * Wraps a three recipe in <ThreeCanvas>. Animation is driven exclusively by the
 * deterministic frame value passed down the render tree — never `useFrame()`,
 * which is a wall-clock r3f loop that would break Remotion's frame-by-frame
 * determinism. Every rendered structure is a pure function of (params, seed, frame).
 */
export const ThreeBackend: React.FC<RendererBackendProps> = ({ layer, absoluteFrame, render, seed }) => {
  const recipe = getThreeRecipe(layer.recipeId)
  const rng = React.useMemo(() => createSeededRandom((seed + layer.id.length * 131) >>> 0), [seed, layer.id])
  const args: ThreeBuildArgs = {
    frame: absoluteFrame, fps: render.fps, params: layer.params,
    rng, sizing: { width: render.width, height: render.height },
  }

  // Unmount-only GPU cleanup. R3F disposes declarative geometries/materials/textures
  // when their <mesh>/<geometry>/<material> nodes unmount; a recipe that allocates
  // resources outside that declarative tree declares `disposeResources` and we call
  // it here exactly once, on unmount (never per frame).
  const argsRef = React.useRef(args)
  argsRef.current = args
  React.useEffect(() => () => { recipe.disposeResources?.(argsRef.current) }, [recipe])

  return (
    <ThreeCanvas width={render.width} height={render.height} style={{ width: '100%', height: '100%' }}>
      {recipe.build(args)}
    </ThreeCanvas>
  )
}
