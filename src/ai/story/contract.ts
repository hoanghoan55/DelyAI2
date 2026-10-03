import type { ScenePurpose } from '@/video-engine/schema'
import type { AttemptRecord } from '@/ai/gemini/retry'

export type Brief = { topic: string; targetSeconds: number; language: string }
export type StorySceneOutline = {
  id: string
  purpose: ScenePurpose
  durationSeconds: number
  title: string
  narration: string
}
export type StoryPlan = { title: string; scenes: StorySceneOutline[] }

/** Plans narrative structure only. Never plans visuals, never emits DSL, never measures frames.
 *  `onAttempt` streams retry records to the orchestrator's manifest (spec §7.5). */
export interface StoryDirector {
  direct(brief: Brief, onAttempt?: (record: AttemptRecord) => void): Promise<StoryPlan>
}
