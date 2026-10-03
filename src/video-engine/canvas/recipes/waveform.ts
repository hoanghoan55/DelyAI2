import { z } from 'zod'
import { createSeededRandom } from '@/shared'
import { createCanvasRecipe } from '../types'

export const waveform = createCanvasRecipe({
  id: 'waveform', version: '1.0.0',
  paramsSchema: z.object({ bars: z.number().int().positive().default(64), hue: z.number().finite().default(160), amp: z.number().finite().default(0.35) }),
  prepare: (_ctx, _size, params) => {
    const rng = createSeededRandom(params.bars * 31 + 7)
    return { levels: Array.from({ length: params.bars }, () => rng.float(0.2, 1)) }
  },
  render: (ctx, { frame, fps, size, params, state }) => {
    const levels = state.levels as number[]
    const t = frame / fps
    ctx.clearRect(0, 0, size.width, size.height)
    const bw = size.width / params.bars
    for (let i = 0; i < params.bars; i++) {
      const h = levels[i]! * params.amp * size.height * (0.6 + 0.4 * Math.abs(Math.sin(t * 2 + i * 0.3)))
      ctx.fillStyle = `hsla(${params.hue}, 85%, 65%, 0.85)`
      ctx.fillRect(i * bw + bw * 0.2, (size.height - h) / 2, bw * 0.6, h)
    }
  },
})
