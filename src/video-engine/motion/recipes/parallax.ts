import { z } from 'zod'
import { IDENTITY_TRANSFORM, createMotionRecipeImpl } from '../types'

/** Slow continuous drift, evaluated from the absolute frame. */
export const parallax = createMotionRecipeImpl({
  id: 'parallax', version: '1.0.0',
  paramsSchema: z.object({ amplitude: z.number().finite().default(0.02), hz: z.number().finite().default(0.1), phase: z.number().finite().default(0) }),
  apply: ({ frame, fps, params }) => {
    const t = (frame / fps) * Math.PI * 2 * params.hz + params.phase
    return { ...IDENTITY_TRANSFORM, x: Math.sin(t) * params.amplitude, y: Math.cos(t) * params.amplitude * 0.6 }
  },
})
