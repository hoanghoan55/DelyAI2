import type { VisualDirectorInput } from '@/ai/visual/contract'
import { STYLE_PRESETS } from '@/ai/visual/style-presets'

export const VISUAL_PROMPT_VERSION = 'visual-prompt-1'

/**
 * Response schema is a STEERING hint for Gemini — the Zod parse in the Visual
 * Director is the authority (brief Step 5 note). Kept in sync with
 * `SceneDSLSchema`: `composition` is a `CompositionId` string, not an object.
 */
const SCENE_OBJECT: Record<string, unknown> = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string' },
    sceneId: { type: 'string' },
    purpose: { type: 'string', enum: ['hook', 'explain_network', 'explain_concept', 'demonstrate', 'compare', 'data_reveal', 'summary', 'outro'] },
    duration: { type: 'number' },
    composition: { type: 'string' },
    backdropRenderer: { type: 'string', enum: ['dom', 'canvas2d', 'three'] },
    visual: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, recipe: { type: 'string' }, params: { type: 'object' }, slot: { type: 'string' } }, required: ['recipe'], additionalProperties: false } },
    motion: { type: 'array', items: { type: 'object', properties: { recipe: { type: 'string' }, params: { type: 'object' }, target: { type: 'string' } }, required: ['recipe'], additionalProperties: false } },
    // R20: Gemini v1beta responseSchema is an OpenAPI 3.0 subset where `type`
    // is a SINGLE string — the JSON-Schema union `['object', 'null']` is
    // reported to yield 400 INVALID_ARGUMENT (withBoundedRetry would burn all
    // 3 attempts on a request that can never succeed). Nullability is
    // `nullable: true`, matching TypographySpecSchema.nullable() in the Zod
    // authority.
    typography: { type: 'object', nullable: true, properties: { text: { type: 'string' }, animation: { type: 'string', enum: ['none', 'fade', 'reveal', 'typewriter', 'word-by-word'] }, slot: { type: 'string' }, startSeconds: { type: 'number' }, durationSeconds: { type: 'number' } }, required: ['text', 'animation'], additionalProperties: false },
    audio: { type: 'array', items: { type: 'object' } },
    events: { type: 'array', items: { type: 'object' } },
    style: { type: 'object' },
    seed: { type: 'integer' },
  },
  required: ['schemaVersion', 'sceneId', 'purpose', 'duration', 'composition', 'visual', 'motion', 'typography', 'audio', 'events', 'style', 'seed'],
  additionalProperties: false,
}

export const VISUAL_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { scenes: { type: 'array', items: SCENE_OBJECT } },
  required: ['scenes'],
  additionalProperties: false,
}

export function buildVisualPrompt(input: VisualDirectorInput): string {
  const windows = Object.entries(input.sceneWindows)
    .map(([id, w]) => `- ${id}: startFrame: ${w.startFrame}, durationInFrames: ${w.durationInFrames}`).join('\n')
  const scenes = input.scenes
    .map((s) => `- ${s.id} | purpose=${s.purpose} | duration=${s.durationSeconds}s | title=${s.title} | narration=${s.narration}`).join('\n')
  const compositions = input.availableCompositions.join(', ')
  const visualRecipes = input.availableVisualRecipes.map((r) => `${r.id}@${r.version}`).join(', ')
  const motionRecipes = input.availableMotionRecipes.map((r) => `${r.id}@${r.version}`).join(', ')
  const styles = STYLE_PRESETS.map((p) => `${p.id}: ${p.description}`).join('; ')
  const assets = input.assets.map((a) => `- ${a.id} (${a.kind}): ${a.source}`).join('\n')
  return [
    `PROMPT_VERSION: ${VISUAL_PROMPT_VERSION}`,
    'You are the VisualDirector of a video generation pipeline. You design scenes as declarative Scene DSL JSON — never code, never JSX.',
    `Topic: ${input.topic} | Language: ${input.language}`,
    `Locked scene windows (fps: ${input.fps}) — these are IMMUTABLE: you may never change the scene windows; design only inside them.`,
    windows,
    'Scenes (retimed; duration matches the window):',
    scenes,
    `Available compositions: ${compositions}`,
    `Available visual recipes: ${visualRecipes}`,
    `Available motion recipes: ${motionRecipes}`,
    'Purpose must be exactly one of: hook, explain_network, explain_concept, demonstrate, compare, data_reveal, summary, outro.',
    'Typography animations: none, fade, reveal, typewriter, word-by-word',
    `Style presets (pick one styleId): ${styles}`,
    `Project style: ${JSON.stringify(input.style)}`,
    'Assets (if any; reference by id only):',
    assets || '- none',
    'Rules:',
    '- One output scene per input scene, same sceneId and same duration (seconds) as the window implies.',
    '- Only use ids from the catalogues above; invented ids will be rejected and sent back to you as diagnostics.',
    '- schemaVersion must be "0.1"; seed is a small integer.',
    'Return JSON matching the response schema. Nothing else.',
  ].join('\n')
}
