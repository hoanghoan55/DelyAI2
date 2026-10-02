import { z } from 'zod'
import { createVisualRecipe, createMotionRecipe, registerVisual, registerMotion, registerRendererBackend } from '@/video-engine/registry'
import { registerCompositions } from '@/video-engine/compositions'

/** Minimal recipes used by compiler tests — no renderer implementations. */
export function registerTestRecipes(): void {
  registerCompositions()
  registerVisual(createVisualRecipe({
    id: 'particle-field', version: '1.0.0', renderer: 'canvas2d',
    paramsSchema: z.object({ count: z.number().int().default(40), hue: z.number().default(200) }), defaults: {},
  }))
  registerVisual(createVisualRecipe({
    id: 'network-graph', version: '1.0.0', renderer: 'three',
    paramsSchema: z.object({ nodes: z.number().int().default(20) }), defaults: {},
  }))
  registerMotion(createMotionRecipe({
    id: 'fade', version: '1.0.0', paramsSchema: z.object({ duration: z.number().default(0.5) }), defaults: {},
  }))
  registerRendererBackend('dom', () => null)
  registerRendererBackend('canvas2d', () => null)
  registerRendererBackend('three', () => null)
}
