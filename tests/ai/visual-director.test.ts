import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGeminiVisualDirector } from '@/ai/gemini/visual-director'
import { VISUAL_PROMPT_VERSION, VISUAL_RESPONSE_SCHEMA, buildVisualPrompt } from '@/ai/gemini/prompts/visual'
import { STYLE_PRESETS } from '@/ai/visual/style-presets'
import { demoProjectDsl } from '@/ai/demo-project.dsl'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import type { VisualDirectorInput } from '@/ai/visual/contract'
import type { Diagnostic } from '@/timeline/diagnostics'

beforeEach(() => { clearRegistered(); registerBackends() })

const GOOD_SCENE = demoProjectDsl.scenes[0]!
const input = (): VisualDirectorInput => ({
  topic: 'Ba renderer',
  language: 'vi',
  scenes: [{ id: 'scene-001', purpose: 'hook', durationSeconds: 6, title: 'Mở', narration: 'Xin chào' }],
  availableCompositions: ['hero', 'split'],
  availableVisualRecipes: [{ id: 'grid', version: '1' }],
  availableMotionRecipes: [{ id: 'drift', version: '1' }],
  style: { styleId: 'default' },
  assets: [],
  timelineWindow: { startSeconds: 0, durationSeconds: 6 },
  constraints: {},
  sceneWindows: { 'scene-hero': { startFrame: 0, durationInFrames: 180 } }, // keyed by GOOD_SCENE.sceneId — R21 coverage: output ids must exactly cover the locked windows
  fps: 30,
})

function geminiReturning(payloads: unknown[]) {
  let i = 0
  // R8: the mock is read via mock.calls, so it declares the real fetch signature.
  // The params are `void`ed (same as Task 5's story mock) rather than asserted:
  // this mock sits inside withBoundedRetry, where a throwing assertion would
  // just become another failed attempt.
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    void _input
    void _init
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payloads[Math.min(i++, payloads.length - 1)]) }] } }],
    })
  })
}
const err = (m: string): Diagnostic => ({ severity: 'error', code: 'UNKNOWN_VISUAL_RECIPE', message: m })

describe('createGeminiVisualDirector', () => {
  it('accepts compilable DSL and returns scenes in one attempt', async () => {
    const fetchImpl = geminiReturning([[GOOD_SCENE]])
    const diagnose = vi.fn(() => [] as Diagnostic[])
    const director = createGeminiVisualDirector({ diagnose, apiKey: 'test-key', fetchImpl })
    const scenes = await director.direct(input())
    expect(scenes).toEqual([GOOD_SCENE])
    expect(diagnose).toHaveBeenCalledWith([GOOD_SCENE])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fails the attempt when diagnose reports errors, then succeeds with corrected DSL', async () => {
    const fetchImpl = geminiReturning([[GOOD_SCENE], [GOOD_SCENE]])
    const diagnose = vi.fn()
      .mockReturnValueOnce([err('Unknown visual recipe "particlez"')])
      .mockReturnValue([] as Diagnostic[])
    const director = createGeminiVisualDirector({ diagnose, apiKey: 'test-key', fetchImpl })
    const scenes = await director.direct(input())
    expect(scenes).toEqual([GOOD_SCENE])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const retryBody = String(fetchImpl.mock.calls[1]![1]!.body)
    expect(retryBody).toContain('UNKNOWN_VISUAL_RECIPE')       // diagnostics carried back
    expect(retryBody).toContain('particlez')
    expect(retryBody).toContain(GOOD_SCENE.sceneId)            // previous output carried back
  })

  it('Zod failure (bad purpose) also retries', async () => {
    const bad = { ...GOOD_SCENE, purpose: 'nonsense' }
    const fetchImpl = geminiReturning([[bad], [GOOD_SCENE]])
    const director = createGeminiVisualDirector({ diagnose: () => [], apiKey: 'test-key', fetchImpl })
    await director.direct(input())
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const retryBody = String(fetchImpl.mock.calls[1]![1]!.body)
    expect(retryBody).toContain('VISUAL_INVALID')
  })

  it('exhausts after 3 attempts when diagnose keeps failing (stage-local — no upstream calls possible)', async () => {
    const fetchImpl = geminiReturning([[GOOD_SCENE]])
    const diagnose = vi.fn(() => [err('still unknown')])
    const director = createGeminiVisualDirector({ diagnose, apiKey: 'test-key', fetchImpl })
    await expect(director.direct(input())).rejects.toMatchObject({ name: 'StageRetryExhausted', stage: 'visual' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('prompt carries the LOCKED windows, fps, catalogue, purpose enum, style presets, seed context (§4 rule 3, §9.4)', () => {
    const prompt = buildVisualPrompt(input())
    expect(prompt).toContain(VISUAL_PROMPT_VERSION)
    expect(prompt).toContain('startFrame: 0')
    expect(prompt).toContain('durationInFrames: 180')
    expect(prompt).toContain('fps: 30')
    expect(prompt).toContain('hero')                 // composition catalogue id
    expect(prompt).toContain('grid')                 // visual recipe id
    expect(prompt).toContain('drift')                // motion recipe id
    expect(prompt).toContain(STYLE_PRESETS[0]!.id)
    expect(prompt).toContain('scene-001')
    for (const p of ['hook', 'explain_network', 'data_reveal', 'outro']) expect(prompt).toContain(p)
    // the prompt must state that windows are immutable
    expect(prompt).toMatch(/never change (the )?(scene )?windows|windows are locked/i)
  })

  it('VISUAL_RESPONSE_SCHEMA requires sceneId/purpose/composition/visual/typography etc. and forbids extra keys', () => {
    expect(VISUAL_RESPONSE_SCHEMA.type).toBe('object')
    expect((VISUAL_RESPONSE_SCHEMA.properties as { scenes: { type: string } }).scenes.type).toBe('array')
    expect(VISUAL_RESPONSE_SCHEMA.additionalProperties).toBe(false)
  })

  it('rejects an empty scene list and retries with the missing scene id (R21)', async () => {
    const fetchImpl = geminiReturning([[], [GOOD_SCENE]])
    const director = createGeminiVisualDirector({ diagnose: () => [], apiKey: 'test-key', fetchImpl })
    const scenes = await director.direct(input())
    expect(scenes).toEqual([GOOD_SCENE])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const retryBody = String(fetchImpl.mock.calls[1]![1]!.body)
    expect(retryBody).toContain('VISUAL_INVALID')
    expect(retryBody).toContain('scene-hero')
  })

  it('accepts the production object envelope { scenes: [...] }', async () => {
    const fetchImpl = geminiReturning([{ scenes: [GOOD_SCENE] }])
    const diagnose = vi.fn(() => [] as Diagnostic[])
    const director = createGeminiVisualDirector({ diagnose, apiKey: 'test-key', fetchImpl })
    const scenes = await director.direct(input())
    expect(scenes).toEqual([GOOD_SCENE])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
