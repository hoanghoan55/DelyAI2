import { describe, it, expect, vi } from 'vitest'
import { geminiGenerateJson } from '@/ai/gemini/client'

const SCHEMA = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false }

describe('geminiGenerateJson', () => {
  it('POSTs v1beta generateContent with x-goog-api-key and JSON schema, parses candidate text', async () => {
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
    const prev = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY
    await expect(geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: vi.fn() }))
      .rejects.toThrow(/GEMINI_API_KEY/)
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev
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
