import { z } from 'zod'
import { Easing, interpolate } from 'remotion'
import { createMotionRecipeImpl, IDENTITY_TRANSFORM } from '../types'

export const slide = createMotionRecipeImpl({
  id: 'slide', version: '1.0.0',
  paramsSchema: z.object({ axis: z.enum(['x', 'y']).default('y'), distance: z.number().finite().default(0.12), easing: z.enum(['linear', 'out']).default('out') }),
  apply: ({ frame, durationInFrames, params }) => {
    const p = interpolate(frame, [0, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      easing: params.easing === 'out' ? Easing.out(Easing.cubic) : Easing.linear,
    })
    return { ...IDENTITY_TRANSFORM, x: params.axis === 'x' ? p * params.distance : 0, y: params.axis === 'y' ? p * params.distance : 0 }
  },
})
