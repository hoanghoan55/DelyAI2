import { describe, it, expect, vi } from 'vitest'
import { createGeminiStoryDirector } from '@/ai/gemini/story-director'
import { STORY_PROMPT_VERSION, STORY_RESPONSE_SCHEMA } from '@/ai/gemini/prompts/story'

const BRIEF = { topic: 'Ba renderer trong một video engine', targetSeconds: 10, language: 'vi' }
const GOOD_PLAN = {
  title: 'Demo',
  scenes: [
    { id: 'scene-001', purpose: 'hook', durationSeconds: 5, title: 'Mở đầu', narration: 'Giới thiệu.' },
    { id: 'scene-002', purpose: 'outro', durationSeconds: 5, title: 'Kết', narration: 'Kết thúc.' },
  ],
}

function geminiReturning(payloads: unknown[]) {
  let i = 0
  // R8: the mock is read via mock.calls, so it declares the real fetch signature.
  // The params are referenced with `void` rather than an expect(): this mock sits
  // inside withBoundedRetry, where a throwing assertion would just become another
  // failed attempt (false coverage — same reason as Task 4's retry-test mocks).
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input
    void init
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payloads[Math.min(i++, payloads.length - 1)]) }] } }],
    })
  })
}

describe('createGeminiStoryDirector', () => {
  it('validates Gemini output with Zod and returns a StoryPlan; one attempt', async () => {
    const fetchImpl = geminiReturning([GOOD_PLAN])
    const director = createGeminiStoryDirector({ apiKey: 'test-key', fetchImpl })
    const attempts: unknown[] = []
    const plan = await director.direct(BRIEF, (r) => attempts.push(r))
    expect(plan).toEqual(GOOD_PLAN)
    expect(attempts).toEqual([expect.objectContaining({ attempt: 1, ok: true })])
  })

  it('retries on Zod failure and sends previous output + diagnostics back', async () => {
    const BAD = { title: 'x', scenes: [] } // min(1) violated → Zod error
    const fetchImpl = geminiReturning([BAD, GOOD_PLAN])
    const director = createGeminiStoryDirector({ apiKey: 'test-key', fetchImpl })
    const plan = await director.direct(BRIEF)
    expect(plan).toEqual(GOOD_PLAN)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    // Forced deviation (documented in task-5-report): `init.body` is one JSON.stringify
    // of the whole request, so quotes inside the prompt text are backslash-escaped
    // (`\"scenes\":[]`) and the literal '"scenes":[]' can never appear in the raw body.
    // Decode the second body to the prompt text the model actually receives (same
    // decoding test 5 already uses). Both assertions below stay as the brief wrote them.
    const secondBody: string = JSON.parse(String(fetchImpl.mock.calls[1]![1]!.body)).contents[0].parts[0].text
    expect(secondBody).toContain('STORY_INVALID')           // diagnostics carried back
    expect(secondBody).toContain('"scenes":[]')             // previous output carried back
  })

  it('fails the stage after 3 attempts with every attempt recorded', async () => {
    const fetchImpl = geminiReturning([{ title: '', scenes: [] }])
    const director = createGeminiStoryDirector({ apiKey: 'test-key', fetchImpl })
    await expect(director.direct(BRIEF)).rejects.toMatchObject({ name: 'StageRetryExhausted', stage: 'story' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('duplicate scene ids are a Zod failure (unique-id refine)', async () => {
    const dup = { ...GOOD_PLAN, scenes: [GOOD_PLAN.scenes[0], { ...GOOD_PLAN.scenes[0] }] }
    const fetchImpl = geminiReturning([dup, GOOD_PLAN])
    const director = createGeminiStoryDirector({ apiKey: 'test-key', fetchImpl })
    await director.direct(BRIEF)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('prompt embeds brief + prompt version; responseSchema enumerates every purpose (§4 rule 3)', async () => {
    const fetchImpl = geminiReturning([GOOD_PLAN])
    const director = createGeminiStoryDirector({ apiKey: 'test-key', fetchImpl })
    await director.direct(BRIEF)
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body))
    const prompt: string = body.contents[0].parts[0].text
    expect(prompt).toContain(STORY_PROMPT_VERSION)
    expect(prompt).toContain(BRIEF.topic)
    expect(prompt).toContain(String(BRIEF.targetSeconds))
    expect(prompt).toContain(BRIEF.language)
    const purposes = (STORY_RESPONSE_SCHEMA.properties as { scenes: { items: { properties: { purpose: { enum: string[] } } } } })
      .scenes.items.properties.purpose.enum
    for (const p of ['hook', 'explain_network', 'explain_concept', 'demonstrate', 'compare', 'data_reveal', 'summary', 'outro']) {
      expect(purposes).toContain(p)
    }
  })

  it('STORY responseSchema is v1beta-safe: no additionalProperties anywhere (live API 400s on it)', () => {
    expect(JSON.stringify(STORY_RESPONSE_SCHEMA)).not.toContain('additionalProperties')
  })
})
