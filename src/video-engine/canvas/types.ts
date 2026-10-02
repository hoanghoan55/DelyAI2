import type { z } from 'zod'
import type { JsonObject } from '@/video-engine/schema'
import type { SeededRandom } from '@/shared'

export type Size = { width: number; height: number }
export type CanvasState = Record<string, unknown>

export type CanvasRenderArgs<P extends JsonObject = JsonObject> = {
  frame: number
  fps: number
  size: Size
  params: P
  state: CanvasState
  rng: SeededRandom
}

export type CanvasRecipe<P extends JsonObject = JsonObject> = {
  id: string
  version: string
  /** Parsed output is P; the schema's input is left open so `P` infers as the output type. */
  paramsSchema: z.ZodType<P, z.ZodTypeDef, unknown>
  prepare?: (ctx: CanvasRenderingContext2D | null, size: Size, params: P) => CanvasState
  render: (ctx: CanvasRenderingContext2D, args: CanvasRenderArgs<P>) => void
  /** Headless-friendly sampling so determinism is testable without a canvas. */
  samplePositions?: (frame: number, fps: number, state: CanvasState, params: P, rng: SeededRandom) => number[]
  dispose?: (state: CanvasState) => void
}

export function createCanvasRecipe<P extends Record<string, unknown>>(r: CanvasRecipe<P>): CanvasRecipe {
  return r as CanvasRecipe
}
