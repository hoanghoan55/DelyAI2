import type { CompositionDef, MotionRecipe, VisualRecipe } from './types'

export function createVisualRecipe<P extends Record<string, unknown>>(r: VisualRecipe<P>): VisualRecipe {
  return r as VisualRecipe
}
export function createMotionRecipe<P extends Record<string, unknown>>(r: MotionRecipe<P>): MotionRecipe {
  return r as MotionRecipe
}
export function createComposition(def: CompositionDef): CompositionDef {
  return def
}