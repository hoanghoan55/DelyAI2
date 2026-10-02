import { hashObject } from '@/shared'
import { resolveVisual, resolveMotion } from '@/video-engine/registry'
import type { JsonObject, SceneDSL } from '@/video-engine/schema'
import type { AssetRef } from '@/video-engine/ir'

/** Validate raw DSL params and fill registry defaults. Runtime never does this. */
export function resolveParams(recipeId: string, raw: JsonObject, kind: 'visual' | 'motion' = 'visual'): JsonObject {
  const recipe = kind === 'visual' ? resolveVisual(recipeId) : resolveMotion(recipeId)
  const parsed = recipe.paramsSchema.safeParse(raw)
  if (!parsed.success) throw new Error(`Invalid params for ${kind} recipe "${recipeId}": ${parsed.error.message}`)
  return parsed.data as JsonObject
}

export function computeSourceHash(dsl: SceneDSL, assets: AssetRef[]): string {
  return hashObject({
    schemaVersion: dsl.schemaVersion,
    dsl,
    assetFingerprints: assets.map((a) => ({ id: a.id, version: a.version ?? null, contentHash: a.contentHash ?? null })),
  })
}
