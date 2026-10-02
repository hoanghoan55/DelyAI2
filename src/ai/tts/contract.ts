import type { VoiceTimeline } from '@/timeline/voice'

export type TtsInput = { text: string; language: string; voice: string; sceneId: string }

/** Produces a voice timeline. Phase 0 has no audio — only fixture timing. */
export interface TtsAdapter {
  synthesize(input: TtsInput): Promise<VoiceTimeline>
}
