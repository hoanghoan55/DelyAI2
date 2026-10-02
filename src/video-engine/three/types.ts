import type React from 'react'
import type { z } from 'zod'
import type { JsonObject } from '@/video-engine/schema'
import type { SeededRandom } from '@/shared'
import { hashObject } from '@/shared'

export type Size = { width: number; height: number }

/** A serializable description of a Three scene at a frame — the determinism gate. */
export type SceneDescriptor = {
  recipeId: string
  recipeVersion: string
  frame: number
  camera: { position: [number, number, number]; lookAt?: [number, number, number] }
  objectTransforms: { id: string; position: [number, number, number]; rotation?: [number, number, number]; scale?: number }[]
  geometryParams: JsonObject
  materialParams: JsonObject
  lightParams: JsonObject
  seed: number
}

export type ThreeBuildArgs<P extends JsonObject = JsonObject> = {
  frame: number
  fps: number
  params: P
  rng: SeededRandom
  sizing: Size
}

export type ThreeRecipe<P extends JsonObject = JsonObject> = {
  id: string
  version: string
  /** Parsed output is P; the schema's input is left open so `P` infers as the output type. */
  paramsSchema: z.ZodType<P, z.ZodTypeDef, unknown>
  describe?: (args: ThreeBuildArgs<P>) => SceneDescriptor
  /** React subtree rendered inside <ThreeCanvas>. Animate only via useCurrentFrame(). */
  build: (args: ThreeBuildArgs<P>) => React.ReactNode
  disposeResources?: (args: ThreeBuildArgs<P>) => void
}

export function createThreeRecipe<P extends Record<string, unknown>>(r: ThreeRecipe<P>): ThreeRecipe {
  return r as ThreeRecipe
}

export function structuralHashOf(descriptor: SceneDescriptor): string {
  return hashObject(descriptor)
}
