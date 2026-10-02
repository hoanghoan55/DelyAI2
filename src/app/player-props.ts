import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'

export type ProjectPlayerProps = { compiledScenes: CompiledScene[]; timeline: MasterTimeline; autoPlay?: boolean }
export type PlayerPropsShape = {
  inputProps: { scenes: CompiledScene[]; timeline: MasterTimeline }
  durationInFrames: number
  fps: number
  compositionWidth: number
  compositionHeight: number
}

/**
 * Pure derivation of the Player's props. Kept out of the component so the
 * shell's contract is testable without loading @remotion/player.
 */
export function toPlayerProps({ compiledScenes, timeline }: ProjectPlayerProps): PlayerPropsShape {
  return {
    inputProps: { scenes: compiledScenes, timeline },
    durationInFrames: timeline.totalFrames,
    fps: timeline.fps,
    compositionWidth: timeline.width,
    compositionHeight: timeline.height,
  }
}
