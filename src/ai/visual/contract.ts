import type { CompositionId, SceneDSL, StyleRef } from '@/video-engine/schema'
import type { StorySceneOutline } from '@/ai/story/contract'

export type AvailableRecipeRef = { id: string; version: string; renderer?: string }

/**
 * The engine hands the director ids and schemas — never renderer source code
 * (spec §8). `available*` come from `listAvailable()`.
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
}

/** Chooses composition + recipes + params and returns DSL. Never picks a renderer. */
export interface VisualDirector {
  direct(input: VisualDirectorInput): Promise<SceneDSL[]>
}
