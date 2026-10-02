import type { z } from 'zod'
import type { JsonObject } from '@/video-engine/schema'

/** Data-only transform, applied by the runtime as CSS. Never JSX from a recipe. */
export type LayerTransform = {
  opacity: number
  /** Fraction of composition width. */
  x: number
  /** Fraction of composition height. */
  y: number
  scale: number
  /** Degrees. */
  rotate: number
}

export const IDENTITY_TRANSFORM: LayerTransform = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }

export type MotionArgs<P extends JsonObject = JsonObject> = {
  frame: number
  fps: number
  durationInFrames: number
  params: P
}

export type MotionRecipeImpl<P extends JsonObject = JsonObject> = {
  id: string
  version: string
  /**
   * Parsed output is P; the schema's input is left open so `P` infers as the
   * output type (mirrors canvas/three). With `z.ZodType<P>` a `.default(...)`
   * field would infer as optional, since the default lives on the input side.
   */
  paramsSchema: z.ZodType<P, z.ZodTypeDef, unknown>
  apply: (args: MotionArgs<P>) => LayerTransform
}

export function createMotionRecipeImpl<P extends Record<string, unknown>>(r: MotionRecipeImpl<P>): MotionRecipeImpl {
  return r as MotionRecipeImpl
}

/** Data-only composition of two transforms; opacity and scale multiply, the rest add. */
export function composeTransforms(base: LayerTransform, next: LayerTransform): LayerTransform {
  return {
    opacity: base.opacity * next.opacity,
    x: base.x + next.x,
    y: base.y + next.y,
    scale: base.scale * next.scale,
    rotate: base.rotate + next.rotate,
  }
}
