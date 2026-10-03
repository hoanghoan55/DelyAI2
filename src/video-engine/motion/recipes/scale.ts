import { z } from 'zod'
import { Easing, interpolate } from 'remotion'
import { createMotionRecipeImpl, IDENTITY_TRANSFORM } from '../types'

export const scale = createMotionRecipeImpl({
  id: 'scale', version: '1.0.0',
  paramsSchema: z.object({ from: z.number().finite().default(0.92), to: z.number().finite().default(1) }),
  apply: ({ frame, durationInFrames, params }) => ({
    ...IDENTITY_TRANSFORM,
    scale: interpolate(frame, [0, durationInFrames], [params.from, params.to], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    }),
  }),
})
