import { z } from 'zod'
import { createCanvasRecipe } from '../types'

export const grid = createCanvasRecipe({
  id: 'grid', version: '1.0.0',
  paramsSchema: z.object({ cell: z.number().positive().default(72), hue: z.number().default(210), opacity: z.number().default(0.18) }),
  prepare: () => ({}),
  render: (ctx, { frame, fps, size, params }) => {
    const offset = ((frame / fps) % 1) * params.cell
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.strokeStyle = `hsla(${params.hue}, 80%, 70%, ${params.opacity})`
    ctx.lineWidth = 1
    for (let x = -params.cell; x <= size.width + params.cell; x += params.cell) {
      ctx.beginPath(); ctx.moveTo(x + offset, 0); ctx.lineTo(x + offset, size.height); ctx.stroke()
    }
    for (let y = -params.cell; y <= size.height + params.cell; y += params.cell) {
      ctx.beginPath(); ctx.moveTo(0, y + offset); ctx.lineTo(size.width, y + offset); ctx.stroke()
    }
  },
})
