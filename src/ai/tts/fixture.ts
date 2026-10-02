import type { VoiceTimeline } from '@/timeline/voice'
import type { TtsAdapter, TtsInput } from './contract'

/**
 * ~2.6 words/second, floored at 1s. `timingSource: "fixture"` is the honest
 * label: this is not real audio, and `words` stays empty because estimated
 * timing is never word-exact (spec §5.4).
 */
const WORDS_PER_SECOND = 2.6

export function createFixtureTtsAdapter(): TtsAdapter {
  return {
    async synthesize({ text, sceneId }: TtsInput): Promise<VoiceTimeline> {
      const words = text.trim().split(/\s+/).filter(Boolean).length
      const durationSeconds = Math.max(1, Number((words / WORDS_PER_SECOND).toFixed(3)))
      const endMs = Math.round(durationSeconds * 1000)
      return {
        timingSource: 'fixture',
        totalMs: endMs,
        segments: [{ id: `${sceneId}-voice`, text, startMs: 0, endMs, words: [], timingSource: 'fixture', sceneId }],
      }
    },
  }
}
