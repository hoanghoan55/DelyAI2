import type { CanvasRecipe } from './types'

/** Separate registry for canvas *implementations* — keeps them off visual-recipe metadata. */
export const canvasRecipeRegistry = new Map<string, CanvasRecipe>()

export function registerCanvasRecipe(recipe: CanvasRecipe): void {
  canvasRecipeRegistry.set(recipe.id, recipe)
}

export function getCanvasRecipe(id: string): CanvasRecipe {
  const r = canvasRecipeRegistry.get(id)
  if (!r) throw new Error(`Unknown canvas recipe "${id}"`)
  return r
}

export function clearCanvasRecipes(): void {
  canvasRecipeRegistry.clear()
}
