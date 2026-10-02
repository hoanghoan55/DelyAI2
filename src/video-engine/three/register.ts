import { registerVisual } from '@/video-engine/registry'
import type { JsonObject } from '@/video-engine/schema'
import type { z } from 'zod'
import { clearThreeRecipes, registerThreeRecipeImpl } from './three-registry'
import { networkGraph } from './recipes/network-graph'
import { particles3d } from './recipes/particles-3d'
import { wireframeObject } from './recipes/wireframe-object'
import { basicScene } from './recipes/basic-scene'
import { cameraRig } from './recipes/camera'
import { lightingRig } from './recipes/lighting'

export const THREE_RECIPES = [networkGraph, particles3d, wireframeObject, basicScene, cameraRig, lightingRig]

export function registerThreeRecipes(): void {
  clearThreeRecipes()
  for (const recipe of THREE_RECIPES) {
    registerThreeRecipeImpl(recipe)
    registerVisual({
      id: recipe.id, version: recipe.version, renderer: 'three',
      // Parsed three params are JSON objects; narrow the open-input schema for the registry.
      paramsSchema: recipe.paramsSchema as z.ZodType<JsonObject>,
      defaults: {},
    })
  }
}
