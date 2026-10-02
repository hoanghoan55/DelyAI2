import type { CompiledScene } from '@/video-engine/ir'

export type VisionInput = { scenes: CompiledScene[] }
export type VisionFinding = { sceneId: string; atFrame: number; kind: string; detail: string }
export type VisionReport = { available: boolean; findings: VisionFinding[] }

/**
 * Layer 6 — vision. Phase 0 ships the boundary only: no model is called, no
 * network, no API key.
 *
 * `available: false` is meaningful and load-bearing: it means the checker did
 * NOT run, so `findings: []` is an absence of evidence, not a pass. Callers MUST
 * branch on `available` before treating an empty report as success.
 */
export interface VisionChecker {
  check(input: VisionInput): Promise<VisionReport>
}
