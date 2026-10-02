import type { Diagnostic } from '@/timeline/diagnostics'
import type { MasterTimeline } from '@/timeline/master'

/**
 * Layer 2 — timeline. Checks contiguity (distinguishing a gap from an overlap)
 * and that totalFrames matches the summed window frames.
 *
 * Total: a missing/`null` timeline or `sceneWindows` returns no diagnostics
 * rather than throwing, and a `null` window is reported instead of dereferenced.
 *
 * Deterministic: `sceneWindows` is a `Record<string, SceneWindow>` built by
 * insertion in scene order, and ECMAScript preserves insertion order for string
 * keys, so iterating it yields the same diagnostics in the same order every run.
 */
export function checkTimeline(timeline: MasterTimeline): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (!timeline?.sceneWindows) return diagnostics
  let cursor = 0
  for (const [sceneId, window] of Object.entries(timeline.sceneWindows)) {
    if (!window) {
      diagnostics.push({
        severity: 'error',
        code: 'TIMELINE_BAD_WINDOW',
        sceneId,
        message: `Scene "${sceneId}" has no timeline window.`,
      })
      continue
    }
    if (window.startFrame !== cursor) {
      // A window starting before the cursor overlaps the previous one; a window
      // starting after it leaves a gap. Distinct codes so consumers can tell them apart.
      const code = window.startFrame < cursor ? 'TIMELINE_OVERLAP' : 'TIMELINE_GAP'
      diagnostics.push({
        severity: 'error',
        code,
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
