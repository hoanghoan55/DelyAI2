import { z } from 'zod'
import { IDENTITY_TRANSFORM, createMotionRecipeImpl } from '../types'

/**
 * Continuous breathing scale. Not windowed by a duration — it is evaluated
 * purely from the absolute frame, so it stays deterministic and loop-safe.
 */
export const pulse = createMotionRecipeImpl({
  id: 'pulse', version: '1.0.0',
  paramsSchema: z.object({ amplitude: z.number().finite().default(0.03), hz: z.number().finite().default(0.5) }),
  apply: ({ frame, fps, params }) => ({
    ...IDENTITY_TRANSFORM,
    scale: 1 + Math.sin((frame / fps) * Math.PI * 2 * params.hz) * params.amplitude,
  }),
})
