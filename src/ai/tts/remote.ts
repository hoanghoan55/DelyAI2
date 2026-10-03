import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { VoiceTimeline, WordTiming } from '@/timeline/voice'
import type { TtsAdapter } from './contract'

const execFileAsync = promisify(execFile)

/** Local TTS server default — `.env` ships `TTS_BASE_URL=` empty, so this code owns the fallback. */
const DEFAULT_BASE_URL = 'http://localhost:8080'

export type RemoteTtsOptions = {
  /** Omitted/empty falls back to `DEFAULT_BASE_URL` (spec §5.1 / .env.example). */
  baseUrl?: string
  apiKey: string
  voiceId: string
  outDir: string
  fetchImpl?: typeof fetch
  measureDuration?: (filePath: string) => Promise<number>
  wordTimestamps?: boolean
}

/** ffprobe duration of the saved file — the timeline authority (spec §5.3). */
export async function measureAudioDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath,
  ])
  const parsed = JSON.parse(stdout) as { format?: { duration?: string } }
  const seconds = Number(parsed.format?.duration)
  if (!Number.isFinite(seconds)) throw new Error(`FFPROBE_NO_DURATION: ${filePath}`)
  return seconds
}

type AsrWord = { word: string; start: number; end: number }
type AsrSegment = { words?: AsrWord[] }

export function createRemoteTtsAdapter(options: RemoteTtsOptions): TtsAdapter {
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL
  const fetchImpl = options.fetchImpl ?? fetch
  const measure = options.measureDuration ?? measureAudioDuration
  const wantWords = options.wordTimestamps ?? true

  return {
    async synthesize(input): Promise<VoiceTimeline> {
      // 1) TTS — pinned body (spec §5.2), header X-Audio-Duration
      const ttsUrl = `${baseUrl}/v1/text-to-speech/${options.voiceId}`
      const ttsRes = await fetchImpl(ttsUrl, {
        method: 'POST',
        headers: { 'x-api-key': options.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          text: input.text,
          language: input.language,
          model_id: 'omnivoice',
          output_format: 'mp3',
          normalize_text: false,
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, speed: 1.0 },
        }),
      })
      if (!ttsRes.ok) throw new Error(`TTS_HTTP_${ttsRes.status}: ${ttsUrl}`)
      // Null-check BEFORE Number(): Number(null) === 0 is finite, so an absent
      // header would otherwise pass as 0s (spec §5.3 — absence is its own failure).
      const rawHeader = ttsRes.headers.get('x-audio-duration')
      if (rawHeader === null) throw new Error('TTS_HEADER_MISSING: X-Audio-Duration absent')
      const headerSeconds = Number(rawHeader)
      if (rawHeader.trim() === '' || !Number.isFinite(headerSeconds)) {
        throw new Error(`TTS_HEADER_MISSING: X-Audio-Duration invalid value "${rawHeader}"`)
      }
      const bytes = Buffer.from(await ttsRes.arrayBuffer())

      // 2) save, then measure — header never trusted alone (spec §5.3)
      fs.mkdirSync(options.outDir, { recursive: true })
      const mp3Path = path.join(options.outDir, `${input.sceneId}.mp3`)
      fs.writeFileSync(mp3Path, bytes)
      const measured = await measure(mp3Path)
      if (Math.abs(headerSeconds - measured) > 0.1) {
        throw new Error(`TTS_DURATION_MISMATCH: header=${headerSeconds.toFixed(3)}s measured=${measured.toFixed(3)}s file=${mp3Path}`)
      }
      const endMs = Math.round(measured * 1000)

      // 3) ASR with word timestamps — absence is a hard failure (spec §6.2)
      const asrUrl = `${baseUrl}/v1/speech-to-text`
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' }), `${input.sceneId}.mp3`)
      form.append('language', input.language)
      form.append('task', 'transcribe')
      if (wantWords) form.append('word_timestamps', 'true')
      const asrRes = await fetchImpl(asrUrl, { method: 'POST', headers: { 'x-api-key': options.apiKey }, body: form })
      if (!asrRes.ok) throw new Error(`ASR_HTTP_${asrRes.status}: ${asrUrl}`)
      const asr = (await asrRes.json()) as { segments?: AsrSegment[] }
      const segments = asr.segments ?? []
      const words: WordTiming[] = []
      if (wantWords) {
        if (segments.length === 0) throw new Error('ASR_MISSING_WORDS: no segments returned')
        for (const seg of segments) {
          // Extra keys per word (e.g. whisper's `probability`) are tolerated — only word/start/end are read.
          if (!seg.words || seg.words.length === 0) throw new Error('ASR_MISSING_WORDS: segment lacks words')
          for (const w of seg.words) {
            words.push({ word: w.word.trim(), startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000) })
          }
        }
      }

      return {
        timingSource: 'exact',
        totalMs: endMs,
        segments: [{
          id: `${input.sceneId}-voice`,
          text: input.text,
          startMs: 0,
          endMs,
          words,
          timingSource: 'exact',
          sceneId: input.sceneId,
          ...(words.length > 0 ? { wordTimingSource: 'whisper' as const } : {}),
        }],
      }
    },
  }
}
