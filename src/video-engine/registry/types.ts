import type { z } from 'zod'
import type { JsonObject, RendererKind } from '@/video-engine/schema'

export type VisualRecipe<P extends JsonObject = JsonObject> = {
  id: string
  version: string
  /** The registry — never the DSL — decides which renderer a recipe runs on. */
  renderer: RendererKind
  paramsSchema: z.ZodType<P>
  defaults: Partial<P>
  plannedDurationHint?: number
}

export type MotionRecipe<P extends JsonObject = JsonObject> = {
  id: string
  version: string
  paramsSchema: z.ZodType<P>
  defaults: Partial<P>
}

export type SlotDef = { id: string; role: string }
export type RenderSize = { width: number; height: number }
export type StyleTokens = JsonObject
export type SlotRect = { slot: string; x: number; y: number; width: number; height: number }
export type LayoutArgs = { slots: string[]; render: RenderSize; style: StyleTokens }

export type CompositionDef = {
  id: string
  version: string
  slots: SlotDef[]
  layout: (args: LayoutArgs) => SlotRect[]
}

export type RecipeMetadata = { id: string; version: string; renderer?: RendererKind }
export type AvailableRecipes = {
  visual: RecipeMetadata[]
  motion: RecipeMetadata[]
  composition: RecipeMetadata[]
}