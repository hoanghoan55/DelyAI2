import type { Diagnostic } from '@/timeline/diagnostics'
import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'
import { checkScenes } from './scene-check'
import { checkTimeline } from './timeline-check'
import { checkGeometry } from './geometry-check'
import { checkRender } from './render-check'

export { checkSchema } from './schema-check'
export { checkTimeline } from './timeline-check'
export { checkScenes } from './scene-check'
export { checkGeometry } from './geometry-check'
export { checkRender } from './render-check'
export type { VisionChecker, VisionFinding, VisionInput, VisionReport } from './vision'
export { createFixtureVisionChecker } from './vision/fixture'

export type QaInput = { scenes: CompiledScene[]; timeline: MasterTimeline; checkRenderBackends?: boolean }

/**
 * Structural QA only — no pixels, no model. Deterministic.
 *
 * Layers 2–5 compose in a fixed order: timeline → scene → geometry → render.
 * Schema (layer 1) is not included: it validates raw DSL, whereas this takes
 * already-compiled data. Setting `checkRenderBackends: false` skips layer 5 for
 * callers that run before the renderer backends are registered.
 */
export function runAllChecks(input: QaInput): Diagnostic[] {
  return [
    ...checkTimeline(input.timeline),
    ...checkScenes(input.scenes),
    ...checkGeometry(input.scenes),
    ...(input.checkRenderBackends === false ? [] : checkRender(input.scenes.flatMap((s) => s.layers))),
  ]
}
