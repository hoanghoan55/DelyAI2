import type { ThreeRecipe } from './types'

/** Separate registry for three *implementations* — kept off visual-recipe metadata. */
export const threeRecipeRegistry = new Map<string, ThreeRecipe>()

export function registerThreeRecipeImpl(recipe: ThreeRecipe): void {
  threeRecipeRegistry.set(recipe.id, recipe)
}

export function getThreeRecipe(id: string): ThreeRecipe {
  const r = threeRecipeRegistry.get(id)
  if (!r) throw new Error(`Unknown three recipe "${id}"`)
  return r
}

export function clearThreeRecipes(): void {
  threeRecipeRegistry.clear()
}
