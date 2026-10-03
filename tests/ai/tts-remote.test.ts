import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRemoteTtsAdapter } from '@/ai/tts/remote'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'

let outDir: string
beforeEach(() => {
  clearRegistered(); registerBackends()
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delyai-tts-'))
})
afterEach(() => fs.rmSync(outDir, { recursive: true, force: true }))

const MP3_BYTES = Buffer.from('ID3fake-mp3-bytes')
const ASR_OK = {
  text: 'xin chào',
  language: 'vi',
  duration: 1.0,
  // whisper's native extra key `probability` rides along — parsing must tolerate it (Task 1 contract).
  segments: [{ start: 0, end: 1.0, words: [{ word: 'xin', start: 0.0, end: 0.4, probability: 0.98 }, { word: 'chào', start: 0.4, end: 0.95, probability: 0.97 }] }],
}

function makeFetch(routes: { tts?: () => Response; asr?: () => Response }) {
  // Signature typed on the mock itself so `calls[i][1]` is `RequestInit`; the
  // implementation only reads the URL, so it declares no unused parameter.
  return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
    const url = String(input)
    if (url.includes('/v1/text-to-speech/')) return routes.tts?.() ?? new Response(MP3_BYTES, { headers: { 'X-Audio-Duration': '1.00' } })
    if (url.includes('/v1/speech-to-text')) return routes.asr?.() ?? Response.json(ASR_OK)
    throw new Error(`unexpected fetch ${url}`)
  })
}

const base = { baseUrl: 'http://tts.test', apiKey: 'test-key', voiceId: 'v1' } as const

describe('createRemoteTtsAdapter', () => {
  it('synthesizes, validates duration, and normalizes words to ms with provenance', async () => {
    const fetchImpl = makeFetch({})
    const measure = vi.fn(async (file: string) => {
      expect(fs.existsSync(file)).toBe(true) // ffprobe can only measure a file already on disk
      return 1.0 // ffprobe: 1.00s, |1.00 − 1.00| ≤ 0.1
    })
    const adapter = createRemoteTtsAdapter({ ...base, outDir, fetchImpl, measureDuration: measure })

    const timeline = await adapter.synthesize({ text: 'xin chào', language: 'vi', voice: 'v1', sceneId: 'scene-001' })

    expect(fs.existsSync(path.join(outDir, 'scene-001.mp3'))).toBe(true)
    expect(timeline.timingSource).toBe('exact')
    const seg = timeline.segments[0]!
    expect(seg).toMatchObject({
      id: 'scene-001-voice', sceneId: 'scene-001', startMs: 0, endMs: 1000,
      timingSource: 'exact', wordTimingSource: 'whisper',
      words: [{ word: 'xin', startMs: 0, endMs: 400 }, { word: 'chào', startMs: 400, endMs: 950 }],
    })
    // pinned TTS request body (spec §5.2)
    const ttsCall = fetchImpl.mock.calls[0]!
    const body = JSON.parse(String(ttsCall[1]!.body))
    expect(body).toMatchObject({
      text: 'xin chào', language: 'vi', model_id: 'omnivoice', output_format: 'mp3',
      normalize_text: false, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, speed: 1.0 },
    })
    expect((ttsCall[1]!.headers as Record<string, string>)['x-api-key']).toBe('test-key')
    // ASR asks for words (multipart field)
    const asrCall = fetchImpl.mock.calls[1]!
    const form = asrCall[1]!.body as FormData
    expect(form.get('word_timestamps')).toBe('true')
    expect(form.get('language')).toBe('vi')
  })

  it('hard-fails when |X-Audio-Duration − measured| > 0.1 (spec §5.3)', async () => {
    const fetchImpl = makeFetch({ tts: () => new Response(MP3_BYTES, { headers: { 'X-Audio-Duration': '2.50' } }) })
    const adapter = createRemoteTtsAdapter({ ...base, outDir, fetchImpl, measureDuration: async () => 1.0 })
    await expect(adapter.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' }))
      .rejects.toThrow(/TTS_DURATION_MISMATCH/)
  })

  it('accepts a header/measure delta ≤ 0.1', async () => {
    const fetchImpl = makeFetch({ tts: () => new Response(MP3_BYTES, { headers: { 'X-Audio-Duration': '1.05' } }) })
    const adapter = createRemoteTtsAdapter({ ...base, outDir, fetchImpl, measureDuration: async () => 1.10 })
    const tl = await adapter.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' })
    expect(tl.segments[0]!.endMs).toBe(1100) // measured wins, once, rounded once
  })

  it('hard-fails when word_timestamps=true but words are absent (spec §6.2)', async () => {
    const asr = { ...ASR_OK, segments: [{ start: 0, end: 1.0 }] } // no words key
    const fetchImpl = makeFetch({ asr: () => Response.json(asr) })
    const adapter = createRemoteTtsAdapter({ ...base, outDir, fetchImpl, measureDuration: async () => 1.0 })
    await expect(adapter.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' }))
      .rejects.toThrow(/ASR_MISSING_WORDS/)
  })

  it('hard-fails on empty words array too', async () => {
    const asr = { ...ASR_OK, segments: [{ start: 0, end: 1.0, words: [] }] }
    const fetchImpl = makeFetch({ asr: () => Response.json(asr) })
    const adapter = createRemoteTtsAdapter({ ...base, outDir, fetchImpl, measureDuration: async () => 1.0 })
    await expect(adapter.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' }))
      .rejects.toThrow(/ASR_MISSING_WORDS/)
  })

  it('hard-fails on non-2xx TTS and non-2xx ASR (no fallback)', async () => {
    const failTts = makeFetch({ tts: () => new Response('boom', { status: 500 }) })
    const a1 = createRemoteTtsAdapter({ ...base, outDir, fetchImpl: failTts, measureDuration: async () => 1 })
    await expect(a1.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' })).rejects.toThrow(/TTS_HTTP_/)

    const failAsr = makeFetch({ asr: () => new Response('bad', { status: 400 }) })
    const a2 = createRemoteTtsAdapter({ ...base, outDir, fetchImpl: failAsr, measureDuration: async () => 1 })
    await expect(a2.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' })).rejects.toThrow(/ASR_HTTP_/)
  })

  it('default measureDuration uses real ffprobe on a synthesized WAV', async () => {
    // 1.0s, 8kHz, mono, 16-bit PCM — generated at runtime, never committed.
    // 44-byte canonical header: fmt chunk is 16 bytes (sample/byte rates are uint32),
    // so every chunk boundary lands where ffprobe expects the next tag.
    const sr = 8000, data = Buffer.alloc(sr * 2)
    const header = Buffer.alloc(44)
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + data.length, 4)
    header.write('WAVE', 8)
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20)       // PCM
    header.writeUInt16LE(1, 22)       // mono
    header.writeUInt32LE(sr, 24)      // sample rate
    header.writeUInt32LE(sr * 2, 28)  // byte rate
    header.writeUInt16LE(2, 32)       // block align
    header.writeUInt16LE(16, 34)      // bits per sample
    header.write('data', 36)
    header.writeUInt32LE(data.length, 40)
    const wav = Buffer.concat([header, data])
    const file = path.join(outDir, 'tone.wav')
    fs.writeFileSync(file, wav)
    const { measureAudioDuration } = await import('@/ai/tts/remote')
    await expect(measureAudioDuration(file)).resolves.toBeCloseTo(1.0, 1)
  })
})

describe('fixture tts omits word provenance', () => {
  it('fixture segments carry empty words and NO wordTimingSource key', async () => {
    const { createFixtureTtsAdapter } = await import('@/ai/tts/fixture')
    const tl = await createFixtureTtsAdapter().synthesize({ text: 'một hai ba', language: 'vi', voice: 'f', sceneId: 's1' })
    const seg = tl.segments[0]!
    expect(seg.words).toEqual([])
    expect('wordTimingSource' in seg).toBe(false)
    expect(seg.timingSource).toBe('fixture')
  })
})
