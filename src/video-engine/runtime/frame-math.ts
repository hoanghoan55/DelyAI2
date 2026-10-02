import type { LayerFrameWindow, SceneTiming } from '@/video-engine/ir'

/**
 * Boundary assertion: the compiler guarantees integer frames across the whole
 * IR, so a non-integer here is a contract violation, not something to repair.
 * We fail loudly rather than silently rounding/flooring/clamping (hard req 6).
 */
function assertIntegerFrame(value: number, context: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`Runtime received a non-integer IR frame for ${context}: ${value}`)
  }
}

/** Absolute master frame = scene start + local scene frame. */
export function absoluteFrameOf(timing: Pick<SceneTiming, 'startFrame'>, sceneLocalFrame: number): number {
  assertIntegerFrame(timing.startFrame, 'scene startFrame')
  assertIntegerFrame(sceneLocalFrame, 'scene-local frame')
  return timing.startFrame + sceneLocalFrame
}

/** Clamp a scene-local frame into a layer's local window (inclusive end). */
export function layerLocalFrame(window: LayerFrameWindow, sceneLocalFrame: number): number {
  assertIntegerFrame(window.from, 'layer window.from')
  assertIntegerFrame(window.durationInFrames, 'layer window.durationInFrames')
  assertIntegerFrame(sceneLocalFrame, 'scene-local frame')
  const last = window.from + window.durationInFrames - 1
  return Math.min(Math.max(sceneLocalFrame, window.from), last)
}
