import type { Diagnostic } from '@/timeline/diagnostics'
import type { MasterTimeline } from '@/timeline/master'

/**
 * Layer 2 — timeline. Checks contiguity and that totalFrames matches the sum.
 *
 * Deterministic: `sceneWindows` is a `Record<string, SceneWindow>` built by
 * insertion in scene order, and ECMAScript preserves insertion order for string
 * keys, so iterating it yields the same diagnostics in the same order every run.
 */
export function checkTimeline(timeline: MasterTimeline): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  let cursor = 0
  for (const [sceneId, window] of Object.entries(timeline.sceneWindows)) {
    if (window.startFrame !== cursor) {
      diagnostics.push({
        severity: 'error',
        code: 'TIMELINE_GAP',
        sceneId,
        message: `Scene "${sceneId}" starts at ${window.startFrame}, expected ${cursor}.`,
      })
    }
    if (!Number.isInteger(window.durationInFrames) || window.durationInFrames <= 0) {
      diagnostics.push({
        severity: 'error',
        code: 'TIMELINE_BAD_DURATION',
        sceneId,
        message: `Scene "${sceneId}" has a non-positive or non-integer duration (${window.durationInFrames}).`,
      })
    }
    cursor += window.durationInFrames
  }
  if (cursor !== timeline.totalFrames) {
    diagnostics.push({
      severity: 'error',
      code: 'TIMELINE_TOTAL_MISMATCH',
      message: `Summed window frames ${cursor} does not equal totalFrames ${timeline.totalFrames}.`,
    })
  }
  return diagnostics
}
