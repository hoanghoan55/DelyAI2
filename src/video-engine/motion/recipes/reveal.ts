import { z } from 'zod'
import { Easing, interpolate } from 'remotion'
import { createMotionRecipeImpl, IDENTITY_TRANSFORM } from '../types'

/** Fade in while lifting slightly — a masked-reveal feel without a real mask. */
export const reveal = createMotionRecipeImpl({
  id: 'reveal', version: '1.0.0',
  paramsSchema: z.object({ distance: z.number().finite().default(0.04) }),
  apply: ({ frame, durationInFrames, params }) => {
    const p = interpolate(frame, [0, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    })
    return { ...IDENTITY_TRANSFORM, opacity: 1 - p, y: p * params.distance }
  },
})
