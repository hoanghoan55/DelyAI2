import type { CompiledLayer } from '@/video-engine/ir'
import { getMotionRecipe } from './motion-registry'
import { composeTransforms, IDENTITY_TRANSFORM, type LayerTransform } from './types'

/**
 * Resolves all motion windows on a layer at an absolute frame. Pure: the same
 * (layer, frame, fps) always yields the same transform. Windows outside their
 * range contribute nothing because each recipe clamps its own interpolation.
 *
 * `applyMotion` resolves nothing: `motion.params` is compiler output (already
 * validated, defaulted, and normalized), so it is handed to the recipe
 * verbatim. The runtime must never re-resolve a default — see ir/types.ts.
 */
export function applyMotion(layer: CompiledLayer, absoluteFrame: number, fps: number): LayerTransform {
  let out: LayerTransform = IDENTITY_TRANSFORM
  for (const motion of layer.motion) {
    const recipe = getMotionRecipe(motion.recipeId)
    const frame = absoluteFrame - motion.frameWindow.from
    out = composeTransforms(out, recipe.apply({
      frame, fps,
      durationInFrames: Math.max(1, motion.frameWindow.durationInFrames - 1),
      params: motion.params as never,
    }))
  }
  return out
}
