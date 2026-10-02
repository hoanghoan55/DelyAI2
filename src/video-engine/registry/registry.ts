import type { AvailableRecipes, CompositionDef, MotionRecipe, VisualRecipe } from './types'

const visualRecipes = new Map<string, VisualRecipe>()
const motionRecipes = new Map<string, MotionRecipe>()
const compositions = new Map<string, CompositionDef>()

const known = (m: Map<string, unknown>) => [...m.keys()].join(', ') || '(none)'

export function registerVisual(recipe: VisualRecipe): void {
  if (visualRecipes.has(recipe.id)) throw new Error(`Duplicate visual recipe "${recipe.id}"`)
  visualRecipes.set(recipe.id, recipe)
}
export function registerMotion(recipe: MotionRecipe): void {
  if (motionRecipes.has(recipe.id)) throw new Error(`Duplicate motion recipe "${recipe.id}"`)
  motionRecipes.set(recipe.id, recipe)
}
export function registerComposition(def: CompositionDef): void {
  if (compositions.has(def.id)) throw new Error(`Duplicate composition "${def.id}"`)
  compositions.set(def.id, def)
}

export function resolveVisual(id: string): VisualRecipe {
  const r = visualRecipes.get(id)
  if (!r) throw new Error(`Unknown visual recipe "${id}". Known: ${known(visualRecipes)}`)
  return r
}
export function resolveMotion(id: string): MotionRecipe {
  const r = motionRecipes.get(id)
  if (!r) throw new Error(`Unknown motion recipe "${id}". Known: ${known(motionRecipes)}`)
  return r
}
export function resolveComposition(id: string): CompositionDef {
  const c = compositions.get(id)
  if (!c) throw new Error(`Unknown composition "${id}". Known: ${known(compositions)}`)
  return c
}

export const hasVisual = (id: string): boolean => visualRecipes.has(id)
export const hasMotion = (id: string): boolean => motionRecipes.has(id)
export const hasComposition = (id: string): boolean => compositions.has(id)

export function listAvailable(): AvailableRecipes {
  return {
    visual: [...visualRecipes.values()].map((r) => ({ id: r.id, version: r.version, renderer: r.renderer })),
    motion: [...motionRecipes.values()].map((r) => ({ id: r.id, version: r.version })),
    composition: [...compositions.values()].map((c) => ({ id: c.id, version: c.version })),
  }
}

export function clearRegistry(): void {
  visualRecipes.clear()
  motionRecipes.clear()
  compositions.clear()
}