import { z } from 'zod'
import { createSeededRandom } from '@/shared'
import { createCanvasRecipe } from '../types'

const schema = z.object({
  count: z.number().int().positive().default(40),
  hue: z.number().finite().default(200),
  speed: z.number().finite().default(1),
})

type Particle = { x: number; y: number; r: number; phase: number }

export const particleField = createCanvasRecipe({
  id: 'particle-field', version: '1.0.0', paramsSchema: schema,
  prepare: (_ctx, size, params) => {
    const rng = createSeededRandom(params.count * 7919 + 13)
    const particles: Particle[] = Array.from({ length: params.count }, () => ({
      x: rng.next(), y: rng.next(), r: rng.float(0.002, 0.008), phase: rng.next() * Math.PI * 2,
    }))
    return { particles, size }
  },
  samplePositions: (frame, fps, state) => {
    const particles = state.particles as Particle[]
    const t = frame / fps
    return particles.flatMap((p) => [p.x + Math.sin(t + p.phase) * 0.02, p.y + Math.cos(t + p.phase) * 0.02])
  },
  render: (ctx, { frame, fps, size, params, state }) => {
    const particles = state.particles as Particle[]
    const t = (frame / fps) * params.speed
    ctx.clearRect(0, 0, size.width, size.height)
    for (const p of particles) {
      const x = (p.x + Math.sin(t + p.phase) * 0.02) * size.width
      const y = (p.y + Math.cos(t + p.phase) * 0.02) * size.height
      const radius = p.r * size.width
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
      grad.addColorStop(0, `hsla(${params.hue}, 90%, 70%, 0.9)`)
      grad.addColorStop(1, `hsla(${params.hue}, 90%, 60%, 0)`)
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
    }
  },
})
