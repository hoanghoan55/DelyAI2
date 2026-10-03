import type { CompositionId, SceneDSL, StyleRef } from '@/video-engine/schema'
import type { StorySceneOutline } from '@/ai/story/contract'
import type { AttemptRecord } from '@/ai/gemini/retry'

export type AvailableRecipeRef = { id: string; version: string; renderer?: string }
export type SceneWindowRef = { startFrame: number; durationInFrames: number }

/**
 * The engine hands the director ids and schemas — never renderer source code
 * (spec §8). `available*` come from `listAvailable()`. `sceneWindows`/`fps` are
 * LOCKED: the director designs inside them and can never change timing (§9.4).
 */
export type VisualDirectorInput = {
  topic: string
  language: string
  scenes: StorySceneOutline[]
  availableCompositions: CompositionId[]
  availableVisualRecipes: AvailableRecipeRef[]
  availableMotionRecipes: AvailableRecipeRef[]
  style: StyleRef
  assets: { id: string; kind: string; source: string }[]
  timelineWindow: { startSeconds: number; durationSeconds: number }
  constraints: { maxLayersPerScene?: number; allowedCompositions?: CompositionId[] }
  sceneWindows: Record<string, SceneWindowRef>
  fps: number
}

/** Chooses composition + recipes + params and returns DSL. Never picks a renderer. */
export interface VisualDirector {
  direct(input: VisualDirectorInput, onAttempt?: (record: AttemptRecord) => void): Promise<SceneDSL[]>
}
