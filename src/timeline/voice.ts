export type TimingSource = 'exact' | 'estimated' | 'fixture'
export type WordTiming = { word: string; startMs: number; endMs: number }

export type VoiceSegment = {
  id: string
  text: string
  startMs: number
  endMs: number
  /** Empty when timingSource is "estimated" — estimated timing is never exact. */
  words: WordTiming[]
  timingSource: TimingSource
  /** Explicit mapping to a scene — never inferred from a duration ratio. */
  sceneId: string
  /** Provenance for `words` only: Whisper timestamps are ASR-derived estimates.
   *  Absent when `words` is empty (fixture/estimated) — the two semantics never share a label. */
  wordTimingSource?: 'whisper'
}

export type VoiceTimeline = {
  segments: VoiceSegment[]
  totalMs: number
  timingSource: TimingSource
}
