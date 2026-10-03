import { z } from 'zod'
import { ScenePurposeSchema } from '@/video-engine/schema'
import type { StoryPlan, StorySceneOutline } from './contract'

export const StorySceneOutlineSchema: z.ZodType<StorySceneOutline> = z
  .object({
    id: z.string().min(1),
    purpose: ScenePurposeSchema,
    durationSeconds: z.number().positive().finite(),
    title: z.string().min(1),
    narration: z.string().min(1),
  })
  .strict()

export const StoryPlanSchema: z.ZodType<StoryPlan> = z
  .object({ title: z.string().min(1), scenes: z.array(StorySceneOutlineSchema).min(1) })
  .strict()
  .superRefine((plan, ctx) => {
    const seen = new Set<string>()
    plan.scenes.forEach((scene, i) => {
      if (seen.has(scene.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes', i, 'id'], message: `duplicate scene id "${scene.id}"` })
      }
      seen.add(scene.id)
    })
  })
