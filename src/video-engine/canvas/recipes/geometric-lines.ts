import { z } from 'zod'
import { createSeededRandom } from '@/shared'
import { createCanvasRecipe } from '../types'

export const geometricLines = createCanvasRecipe({
  id: 'geometric-lines', version: '1.0.0',
  paramsSchema: z.object({ lines: z.number().int().positive().default(48), hue: z.number().finite().default(24) }),
  prepare: (_ctx, _size, params) => {
    const rng = createSeededRandom(params.lines * 17 + 3)
    return { seeds: Array.from({ length: params.lines }, () => ({ a: rng.next(), b: rng.next() })) }
  },
  render: (ctx, { frame, fps, size, params, state }) => {
    const seeds = state.seeds as { a: number; b: number }[]
    const t = frame / fps
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.lineWidth = 2
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i]!
      ctx.strokeStyle = `hsla(${params.hue + i * 2}, 85%, 65%, ${0.1 + 0.5 * Math.abs(Math.sin(t + i * 0.2))})`
      ctx.beginPath(); ctx.moveTo(s.a * size.width, s.b * size.height); ctx.lineTo((1 - s.b) * size.width, (1 - s.a) * size.height); ctx.stroke()
    }
  },
})
