import { z } from 'zod'

export const SCENE_DSL_VERSION = '0.1' as const

export const ScenePurposeSchema = z.enum([
  'hook', 'explain_network', 'explain_concept', 'demonstrate',
  'compare', 'data_reveal', 'summary', 'outro',
])
export type ScenePurpose = z.infer<typeof ScenePurposeSchema>

export const RendererKindSchema = z.enum(['dom', 'canvas2d', 'three'])
export type RendererKind = z.infer<typeof RendererKindSchema>

/** Ids are opaque here; the compiler validates existence against the registry. */
export const CompositionIdSchema = z.string().min(1)
export type CompositionId = z.infer<typeof CompositionIdSchema>

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)]),
)
export const JsonObjectSchema = z.record(JsonValueSchema)
export type JsonObject = Record<string, unknown>

export const VisualLayerSpecSchema = z
  .object({
    /** Optional stable layer id; motion `target` matches exactly this. Defaults to `${sceneId}-visual-${index}`. */
    id: z.string().min(1).optional(),
    recipe: z.string().min(1),
    params: JsonObjectSchema.default({}),
    slot: z.string().min(1).optional(),
  })
  .strict()
export type VisualLayerSpec = z.infer<typeof VisualLayerSpecSchema>

export const MotionLayerSpecSchema = z
  .object({ recipe: z.string().min(1), params: JsonObjectSchema.default({}), target: z.string().min(1).optional() })
  .strict()
export type MotionLayerSpec = z.infer<typeof MotionLayerSpecSchema>

export const TypographySpecSchema = z
  .object({
    text: z.string(),
    animation: z.enum(['none', 'fade', 'reveal', 'typewriter', 'word-by-word']).default('fade'),
    slot: z.string().min(1).optional(),
    /** Seconds from scene start. Omitted = whole scene. */
    startSeconds: z.number().min(0).finite().optional(),
    durationSeconds: z.number().positive().finite().optional(),
  })
  .strict()
export type TypographySpec = z.infer<typeof TypographySpecSchema>

export const AudioCueSpecSchema = z
  .object({ at: z.number().min(0).finite(), cue: z.string().min(1), params: JsonObjectSchema.default({}) })
  .strict()
export type AudioCueSpec = z.infer<typeof AudioCueSpecSchema>

export const SceneEventSpecSchema = z
  .object({ at: z.number().min(0).finite(), kind: z.string().min(1), payload: JsonObjectSchema.default({}) })
  .strict()
export type SceneEventSpec = z.infer<typeof SceneEventSpecSchema>

export const StyleRefSchema = z.union([
  z.object({ styleId: z.string().min(1) }).strict(),
  z.object({ tokens: JsonObjectSchema }).strict(),
])
export type StyleRef = z.infer<typeof StyleRefSchema>

export const SceneDSLSchema = z
  .object({
    schemaVersion: z.literal(SCENE_DSL_VERSION),
    sceneId: z.string().min(1),
    purpose: ScenePurposeSchema,
    duration: z.number().positive().finite(),
    composition: CompositionIdSchema,
    backdropRenderer: RendererKindSchema.optional(),
    visual: z.array(VisualLayerSpecSchema).default([]),
    motion: z.array(MotionLayerSpecSchema).default([]),
    typography: TypographySpecSchema.nullable().default(null),
    audio: z.array(AudioCueSpecSchema).default([]),
    events: z.array(SceneEventSpecSchema).default([]),
    style: StyleRefSchema,
    seed: z.number().int().finite(),
  })
  .strict()
export type SceneDSL = z.infer<typeof SceneDSLSchema>

/** Mirrors the timeline's `VoiceScenePolicy` without importing it (no schema → timeline edge). */
export const VoiceScenePolicySchema = z.enum(['strict', 'extend_to_voice', 'stretch_to_voice'])
export type VoiceScenePolicy = z.infer<typeof VoiceScenePolicySchema>

export const MusicSpecSchema = z
  .object({ bpm: z.number().positive().finite(), style: z.string().min(1).optional() })
  .strict()
export type MusicSpec = z.infer<typeof MusicSpecSchema>

export const ProjectDSLSchema = z
  .object({
    dslVersion: z.literal(SCENE_DSL_VERSION),
    project: z.object({ id: z.string().min(1), title: z.string().min(1), language: z.string().min(2) }).strict(),
    render: z
      .object({ fps: z.number().positive().finite(), width: z.number().int().positive(), height: z.number().int().positive() })
      .strict(),
    style: StyleRefSchema.default({ styleId: 'default' }),
    seed: z.number().int().finite(),
    voiceScenePolicy: VoiceScenePolicySchema.default('strict'),
    music: MusicSpecSchema.nullable().default(null),
    scenes: z.array(SceneDSLSchema).min(1),
  })
  .strict()
export type ProjectDsl = z.infer<typeof ProjectDSLSchema>

export function parseSceneDsl(value: unknown): SceneDSL {
  const result = SceneDSLSchema.safeParse(value)
  if (!result.success) throw new Error(`Invalid scene DSL:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`)
  return result.data
}

export function parseProjectDsl(value: unknown): ProjectDsl {
  const result = ProjectDSLSchema.safeParse(value)
  if (!result.success) throw new Error(`Invalid project DSL:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`)
  return result.data
}
