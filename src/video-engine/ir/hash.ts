import { hashObject } from '@/shared'
import { ENGINE_VERSION } from '@/video-engine/version'
import type { CompiledScene } from './types'

/**
 * Hash of the canonical IR with provenance.compiledHash excluded.
 * This is what determinism is judged on: compile(input) twice must match.
 */
export function computeCompiledHash(scene: CompiledScene): string {
  return hashObject({
    ...scene,
    provenance: { engineVersion: ENGINE_VERSION, sourceHash: scene.provenance.sourceHash },
  })
}
