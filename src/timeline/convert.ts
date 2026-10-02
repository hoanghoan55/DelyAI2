/**
 * The ONE canonical seconds→frames policy for the whole system.
 * Do not reimplement time conversion anywhere else.
 */
export function secondsToFrames(value: number, fps: number): number {
  return Math.round(value * fps)
}
export function framesToSeconds(value: number, fps: number): number {
  return value / fps
}
export function msToFrames(value: number, fps: number): number {
  return Math.round((value / 1000) * fps)
}
export function framesToMs(value: number, fps: number): number {
  return (value / fps) * 1000
}
export function beatToFrame(beat: number, bpm: number, fps: number): number {
  return Math.round((beat / bpm) * 60 * fps)
}
