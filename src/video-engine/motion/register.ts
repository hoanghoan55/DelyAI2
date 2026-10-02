import { registerMotion } from '@/video-engine/registry'
import type { JsonObject } from '@/video-engine/schema'
import type { z } from 'zod'
import { clearMotionRecipes, registerMotionRecipeImpl } from './motion-registry'
import { fade } from './recipes/fade'
import { reveal } from './recipes/reveal'
import { slide } from './recipes/slide'
import { scale } from './recipes/scale'
import { pulse } from './recipes/pulse'
import { parallax } from './recipes/parallax'
import { cameraFlythrough } from './recipes/camera-flythrough'

export const MOTION_RECIPES = [fade, reveal, slide, scale, pulse, parallax, cameraFlythrough]

export function registerMotionRecipes(): void {
  clearMotionRecipes()
  for (const recipe of MOTION_RECIPES) {
    registerMotionRecipeImpl(recipe)
    registerMotion({
      id: recipe.id, version: recipe.version,
      // Parsed motion params are JSON objects; narrow the open-input schema for the registry.
      paramsSchema: recipe.paramsSchema as z.ZodType<JsonObject>,
      defaults: {},
    })
  }
}
