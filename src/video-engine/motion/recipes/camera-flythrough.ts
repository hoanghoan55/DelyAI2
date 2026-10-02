import { z } from 'zod'
import { Easing, interpolate } from 'remotion'
import { IDENTITY_TRANSFORM, createMotionRecipeImpl } from '../types'

/**
 * Dolly-in: scales up and drifts slightly while rotating a touch, as if the
 * camera pushed toward the subject. Windowed, so it settles rather than loops.
 */
export const cameraFlythrough = createMotionRecipeImpl({
  id: 'camera-flythrough', version: '1.0.0',
  paramsSchema: z.object({ from: z.number().default(0.86), to: z.number().default(1.06), drift: z.number().default(0.01) }),
  apply: ({ frame, durationInFrames, params }) => {
    const p = interpolate(frame, [0, durationInFrames], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad),
    })
    return {
      ...IDENTITY_TRANSFORM,
      scale: params.from + (params.to - params.from) * p,
      x: (1 - p) * params.drift,
      rotate: (1 - p) * 1.5,
    }
  },
})
