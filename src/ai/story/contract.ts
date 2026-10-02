import type { ScenePurpose } from '@/video-engine/schema'

export type Brief = { topic: string; targetSeconds: number; language: string }
export type StorySceneOutline = {
  id: string
  purpose: ScenePurpose
  durationSeconds: number
  title: string
  narration: string
}
export type StoryPlan = { title: string; scenes: StorySceneOutline[] }

/** Plans narrative structure only. Never plans visuals, never emits DSL, never measures frames. */
export interface StoryDirector {
  direct(brief: Brief): Promise<StoryPlan>
}
