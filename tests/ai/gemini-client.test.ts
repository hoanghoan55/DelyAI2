import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { geminiGenerateJson, resetGeminiKeyRotation } from '@/ai/gemini/client'

const SCHEMA = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false }

describe('geminiGenerateJson', () => {
  it('POSTs v1beta generateContent with x-goog-api-key and JSON schema, parses candidate text', async () => {
    const prevModel = process.env.GEMINI_MODEL
    delete process.env.GEMINI_MODEL // default-URL assertion must not depend on ambient .env (GEMINI_MODEL override)
    // R8: mock declares the real fetch signature; `input` is read back via mock.calls below.
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain(':generateContent')
      expect(init?.method).toBe('POST')
      return Response.json({
        candidates: [{ content: { parts: [{ text: '{"title":"ok"}' }] } }],
      })
    })
    const out = await geminiGenerateJson(
      { prompt: 'hello', responseSchema: SCHEMA, model: 'gemini-3.8-flash' },
      { apiKey: 'test-key', fetchImpl },
    )
    expect(out).toEqual({ title: 'ok' })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key')
    const body = JSON.parse(String(init!.body))
    expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', responseSchema: SCHEMA })
    expect(JSON.stringify(body)).not.toContain('temperature') // Gemini 3: no sampling knobs
    expect(JSON.stringify(body)).toContain('hello')
    if (prevModel !== undefined) process.env.GEMINI_MODEL = prevModel
  })

  it('defaults model to gemini-3.8-flash and reads GEMINI_MODEL override', async () => {
    const prevModel = process.env.GEMINI_MODEL
    delete process.env.GEMINI_MODEL // the default assertion must not depend on ambient env
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain(':generateContent')
      expect(init?.method).toBe('POST')
      return Response.json({ candidates: [{ content: { parts: [{ text: '{}' }] } }] })
    })
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { apiKey: 'k', fetchImpl })
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('/gemini-3.8-flash:generateContent')
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { apiKey: 'k', model: 'gemini-custom', fetchImpl })
    expect(String(fetchImpl.mock.calls[1]![0])).toContain('/gemini-custom:generateContent')
    if (prevModel !== undefined) process.env.GEMINI_MODEL = prevModel
  })

  it('throws when GEMINI_API_KEY is absent', async () => {
    // env hygiene: setup-env.ts loads .env, so GEMINI_API_KEYS is ambient too —
    // the pool branch must be absent for this "no key at all" assertion.
    const prev = process.env.GEMINI_API_KEY
    const prevMulti = process.env.GEMINI_API_KEYS
    delete process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEYS
    await expect(geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: vi.fn() }))
      .rejects.toThrow(/GEMINI_API_KEY/)
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev
    if (prevMulti !== undefined) process.env.GEMINI_API_KEYS = prevMulti
  })

  it('throws on non-2xx, on empty candidates, and on unparseable text', async () => {
    const key = { apiKey: 'k' }
    const r1 = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain(':generateContent')
      expect(init?.method).toBe('POST')
      return new Response('quota', { status: 429 })
    })
    await expect(geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { ...key, fetchImpl: r1 }))
      .rejects.toThrow(/GEMINI_HTTP_429/)
    const r2 = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain(':generateContent')
      expect(init?.method).toBe('POST')
      return Response.json({ candidates: [] })
    })
    await expect(geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { ...key, fetchImpl: r2 }))
      .rejects.toThrow(/GEMINI_NO_CANDIDATE/)
    const r3 = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain(':generateContent')
      expect(init?.method).toBe('POST')
      return Response.json({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })
    })
    await expect(geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { ...key, fetchImpl: r3 }))
      .rejects.toThrow(/GEMINI_BAD_JSON/)
  })
})

// rotation tests — env vars must be saved/deleted/restored around each test:
// setup-env.ts loads .env (GEMINI_API_KEY + GEMINI_API_KEYS are ambient now).
describe('geminiGenerateJson key rotation', () => {
  // helper: save both env keys, delete both, restore in afterEach (R6 pattern)
  let saved: { single?: string; multi?: string }
  beforeEach(() => {
    saved = { single: process.env.GEMINI_API_KEY, multi: process.env.GEMINI_API_KEYS }
    delete process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEYS
    resetGeminiKeyRotation()
  })
  afterEach(() => {
    if (saved.single !== undefined) process.env.GEMINI_API_KEY = saved.single
    else delete process.env.GEMINI_API_KEY
    if (saved.multi !== undefined) process.env.GEMINI_API_KEYS = saved.multi
    else delete process.env.GEMINI_API_KEYS
    resetGeminiKeyRotation()
  })

  // R8: mock declares the real fetch signature so mock.calls types check.
  // Params are `void`ed (same as Task 5's story mock) rather than asserted.
  const okFetch = () =>
    vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input
      void _init
      return Response.json({ candidates: [{ content: { parts: [{ text: '{}' }] } }] })
    })
  const keyOf = (fetchImpl: ReturnType<typeof vi.fn>, i: number) =>
    (fetchImpl.mock.calls[i]![1]!.headers as Record<string, string>)['x-goog-api-key']

  it('GEMINI_API_KEYS pool round-robins across consecutive calls', async () => {
    process.env.GEMINI_API_KEYS = 'k-one, k-two,k-three'
    const f = okFetch()
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: f })
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: f })
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: f })
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: f })
    expect([keyOf(f, 0), keyOf(f, 1), keyOf(f, 2), keyOf(f, 3)]).toEqual(['k-one', 'k-two', 'k-three', 'k-one'])
    // trims around commas
  })

  it('pool wins over GEMINI_API_KEY when both are set', async () => {
    process.env.GEMINI_API_KEY = 'single'
    process.env.GEMINI_API_KEYS = 'pool-a,pool-b'
    const f = okFetch()
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: f })
    expect(keyOf(f, 0)).toBe('pool-a')
  })

  it('single GEMINI_API_KEY (no pool) keeps every call on the same key', async () => {
    process.env.GEMINI_API_KEY = 'only'
    const f = okFetch()
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: f })
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: f })
    expect([keyOf(f, 0), keyOf(f, 1)]).toEqual(['only', 'only'])
  })

  it('explicit env.apiKey overrides the pool and leaves the counter untouched', async () => {
    process.env.GEMINI_API_KEYS = 'pool-a,pool-b'
    const f = okFetch()
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { apiKey: 'explicit', fetchImpl: f })
    expect(keyOf(f, 0)).toBe('explicit')
    // pool branch was not consumed: next env-driven call starts at pool-a
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: f })
    expect(keyOf(f, 1)).toBe('pool-a')
  })

  it('resetGeminiKeyRotation() rewinds the counter', async () => {
    process.env.GEMINI_API_KEYS = 'a,b'
    const f = okFetch()
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: f })
    resetGeminiKeyRotation()
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: f })
    expect([keyOf(f, 0), keyOf(f, 1)]).toEqual(['a', 'a'])
  })

  it('throws the existing message when neither env key nor injection is present', async () => {
    await expect(geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: vi.fn() }))
      .rejects.toThrow(/GEMINI_API_KEY is not set/)
  })
})
