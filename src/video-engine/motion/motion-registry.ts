import type { MotionRecipeImpl } from './types'

/** Registry for motion *implementations* — the metadata registry stores only id/version. */
export const motionRecipeRegistry = new Map<string, MotionRecipeImpl>()

export function registerMotionRecipeImpl(recipe: MotionRecipeImpl): void {
  motionRecipeRegistry.set(recipe.id, recipe)
}

export function getMotionRecipe(id: string): MotionRecipeImpl {
  const r = motionRecipeRegistry.get(id)
  if (!r) throw new Error(`Unknown motion recipe implementation "${id}"`)
  return r
}

export function clearMotionRecipes(): void {
  motionRecipeRegistry.clear()
}
