import type { CompiledLayer } from '@/video-engine/ir'
import { getMotionRecipe } from './motion-registry'
import { composeTransforms, IDENTITY_TRANSFORM, type LayerTransform } from './types'

/**
 * Resolves all motion windows on a layer at an absolute frame. Pure: the same
 * (layer, frame, fps) always yields the same transform. Windows outside their
 * range contribute nothing because each recipe clamps its own interpolation.
 */
export function applyMotion(layer: CompiledLayer, absoluteFrame: number, fps: number): LayerTransform {
  let out: LayerTransform = IDENTITY_TRANSFORM
  for (const motion of layer.motion) {
    const recipe = getMotionRecipe(motion.recipeId)
    const frame = absoluteFrame - motion.frameWindow.from
    out = composeTransforms(out, recipe.apply({
      frame, fps,
      durationInFrames: Math.max(1, motion.frameWindow.durationInFrames - 1),
      // Resolve the recipe's own schema defaults so a layer built with partial or
      // empty motion params is still valid. Compiler output is already fully
      // resolved, and schema.parse is idempotent, so this is an identity for real
      // scenes and only changes hand-built (test) layers. Never resolve visual
      // layer params this way — that is the compiler's job (ir/types.ts).
      params: recipe.paramsSchema.parse(motion.params),
    }))
  }
  return out
}
