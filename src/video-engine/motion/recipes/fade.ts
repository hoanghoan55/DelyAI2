import { z } from 'zod'
import { interpolate } from 'remotion'
import { createMotionRecipeImpl, IDENTITY_TRANSFORM } from '../types'

export const fade = createMotionRecipeImpl({
  id: 'fade', version: '1.0.0',
  paramsSchema: z.object({ from: z.number().finite().default(0), to: z.number().finite().default(1) }),
  apply: ({ frame, durationInFrames, params }) => ({
    ...IDENTITY_TRANSFORM,
    opacity: interpolate(frame, [0, durationInFrames], [params.from, params.to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  }),
})
