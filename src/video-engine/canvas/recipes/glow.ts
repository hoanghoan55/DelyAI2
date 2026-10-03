import { z } from 'zod'
import { createCanvasRecipe } from '../types'

export const glow = createCanvasRecipe({
  id: 'glow', version: '1.0.0',
  paramsSchema: z.object({ hue: z.number().finite().default(265), intensity: z.number().finite().default(0.55), radius: z.number().finite().default(0.5) }),
  prepare: () => ({}),
  render: (ctx, { frame, fps, size, params }) => {
    const t = frame / fps
    const cx = size.width / 2 + Math.sin(t) * size.width * 0.05
    const cy = size.height / 2 + Math.cos(t * 0.8) * size.height * 0.05
    const r = params.radius * size.width
    ctx.clearRect(0, 0, size.width, size.height)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    grad.addColorStop(0, `hsla(${params.hue}, 90%, 70%, ${params.intensity})`)
    grad.addColorStop(1, `hsla(${params.hue}, 90%, 60%, 0)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size.width, size.height)
  },
})
