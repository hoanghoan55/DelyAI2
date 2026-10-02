import { registerVisual } from '@/video-engine/registry'
import type { JsonObject } from '@/video-engine/schema'
import type { z } from 'zod'
import { clearCanvasRecipes, registerCanvasRecipe } from './canvas-registry'
import { particleField } from './recipes/particle-field'
import { grid } from './recipes/grid'
import { waveform } from './recipes/waveform'
import { glow } from './recipes/glow'
import { geometricLines } from './recipes/geometric-lines'

export const CANVAS_RECIPES = [particleField, grid, waveform, glow, geometricLines]

export function registerCanvasRecipes(): void {
  clearCanvasRecipes()
  for (const recipe of CANVAS_RECIPES) {
    registerCanvasRecipe(recipe)
    registerVisual({
      id: recipe.id, version: recipe.version, renderer: 'canvas2d',
      // Parsed canvas params are JSON objects; narrow the open-input schema for the registry.
      paramsSchema: recipe.paramsSchema as z.ZodType<JsonObject>,
      defaults: {},
    })
  }
}
