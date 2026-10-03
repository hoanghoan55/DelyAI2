import type { Brief } from '@/ai/story/contract'

export const STORY_PROMPT_VERSION = 'story-prompt-1'

export const STORY_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          purpose: { type: 'string', enum: ['hook', 'explain_network', 'explain_concept', 'demonstrate', 'compare', 'data_reveal', 'summary', 'outro'] },
          durationSeconds: { type: 'number' },
          title: { type: 'string' },
          narration: { type: 'string' },
        },
        required: ['id', 'purpose', 'durationSeconds', 'title', 'narration'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'scenes'],
  additionalProperties: false,
}

export function buildStoryPrompt(brief: Brief): string {
  return [
    `PROMPT_VERSION: ${STORY_PROMPT_VERSION}`,
    'You are the StoryDirector of a video generation pipeline. You plan narrative structure ONLY — no visuals, no layout, no code.',
    `Topic: ${brief.topic}`,
    `Target total duration: ~${brief.targetSeconds} seconds`,
    `Language for ALL narration and titles: ${brief.language}`,
    'Rules:',
    `- Produce 2–8 scenes. Scene durations are ESTIMATES that guide narration length; their sum should approximate ${brief.targetSeconds}s.`,
    '- Each scene id is unique, format "scene-001" (three digits).',
    '- purpose must be exactly one of: hook, explain_network, explain_concept, demonstrate, compare, data_reveal, summary, outro.',
    '- narration is 1–2 spoken sentences a TTS voice will read aloud in the brief language.',
    '- durationSeconds is a positive finite number of seconds.',
    'Return JSON matching the response schema. Nothing else.',
  ].join('\n')
}
