import { hashObject } from '@/shared'
import type { Diagnostic } from '@/timeline/diagnostics'
import { resolveVisual, resolveMotion } from '@/video-engine/registry'
import type { JsonObject, SceneDSL } from '@/video-engine/schema'
import type { AssetRef } from '@/video-engine/ir'
import { CompilerError } from './errors'

const err = (code: string, message: string, sceneId?: string): Diagnostic => {
  const diagnostic: Diagnostic = { severity: 'error', code, message }
  if (sceneId !== undefined) diagnostic.sceneId = sceneId
  return diagnostic
}

/** Validate raw DSL params and fill registry defaults. Runtime never does this. */
export function resolveParams(recipeId: string, raw: JsonObject, kind: 'visual' | 'motion' = 'visual', sceneId?: string): JsonObject {
  const recipe = kind === 'visual' ? resolveVisual(recipeId) : resolveMotion(recipeId)
  const parsed = recipe.paramsSchema.safeParse(raw)
  if (!parsed.success) {
    throw new CompilerError(`Invalid params for ${kind} recipe "${recipeId}"`, [
      err('INVALID_PARAMS', `Invalid params for ${kind} recipe "${recipeId}": ${parsed.error.message}`, sceneId),
    ])
  }
  return parsed.data as JsonObject
}

export function computeSourceHash(dsl: SceneDSL, assets: AssetRef[]): string {
  return hashObject({
    schemaVersion: dsl.schemaVersion,
    dsl,
    assetFingerprints: assets.map((a) => ({ id: a.id, version: a.version ?? null, contentHash: a.contentHash ?? null })),
  })
}
