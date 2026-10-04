// tests/integration/generate-e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { generateProject } from '@/ai/generate'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import { readJsonArtifact, readManifest } from '@/ai/artifacts'

const HAS_CREDS = Boolean(process.env.GEMINI_API_KEY && process.env.TTS_API_KEY)
const RUN_ID = 'run-e2e-1'
const BRIEF = { topic: 'Giới thiệu kiến trúc DeLyAI2 cho người mới', targetSeconds: 10, language: 'vi' }

const ffprobeJson = (file: string) =>
  JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' })) as {
    streams: { codec_type: string; codec_name: string }[]
    format: { duration: string }
  }

// Only a fully verified run is cleaned up: a FAILED run's `generated/<id>/` must
// survive so `manifest.json` (per-attempt errors/diagnostics) stays readable for
// diagnosis — the failure path this file exists to prove can be inspected.
let e2eVerified = false

describe.skipIf(!HAS_CREDS)('Phase 1A end-to-end (spec §1, §9.3) — needs .env + running TTS server', () => {
  beforeAll(() => { clearRegistered(); registerBackends() })
  afterAll(() => { if (e2eVerified) fs.rmSync(path.join(process.cwd(), 'generated', RUN_ID), { recursive: true, force: true }) })

  it('brief → real Gemini/TTS/ASR → video.mp4 with audio, zero voice warnings', async () => {
    const result = await generateProject({ brief: BRIEF, runId: RUN_ID })
    const dir = result.dir

    // --- MP4: h264 + aac, duration ≈ Σ scenes (spec §9.3) ---
    const probe = ffprobeJson(result.videoPath!)
    const types = probe.streams.map((s) => `${s.codec_type}:${s.codec_name}`)
    expect(types).toContain('video:h264')
    expect(types).toContain('audio:aac')                                  // audio actually present (Review Focus 1)
    const expected = result.timeline.totalFrames / result.timeline.fps
    expect(Number(probe.format.duration)).toBeGreaterThan(0)
    expect(Math.abs(Number(probe.format.duration) - expected)).toBeLessThan(1.0)

    // --- zero voice diagnostics (spec §1 success criterion 1) ---
    const codes = result.timeline.diagnostics.map((d) => d.code)
    expect(codes).not.toContain('VOICE_OVERRUNS_SCENE')
    expect(codes).not.toContain('VOICE_UNKNOWN_SCENE')
    expect(codes).not.toContain('VOICE_ESTIMATED_TIMING')

    // --- scene count and audio mapping are 1:1 (spec §9.3) ---
    const compiledFiles = fs.readdirSync(path.join(dir, 'compiled')).filter((f) => f.endsWith('.json'))
    expect(compiledFiles).toHaveLength(Object.keys(result.timeline.sceneWindows).length)
    const props = readJsonArtifact<{ audioSrcBySceneId: Record<string, string>; voice: { segments: { sceneId: string }[] } }>(path.join(dir, 'render-props.json'))
    expect(props).not.toBeNull()
    const segmentSceneIds = props!.payload.voice.segments.map((s) => s.sceneId)
    expect(segmentSceneIds).toHaveLength(new Set(segmentSceneIds).size)     // every sceneId exactly once
    expect(Object.keys(props!.payload.audioSrcBySceneId).sort()).toEqual([...segmentSceneIds].sort())
    for (const id of segmentSceneIds) expect(result.timeline.sceneWindows[id]).toBeDefined()

    // --- manifest config block recorded (spec §7.5) ---
    const manifest = readManifest(dir)
    expect(manifest).not.toBeNull()
    expect(manifest!.tts.model).toBe('omnivoice')
    expect(manifest!.retime.paddingSeconds).toBe(0.5)
    expect(manifest!.render?.sourceHash).toBeTruthy()
    expect(manifest!.stages.visual.attempts?.length ?? 0).toBeGreaterThanOrEqual(1)

    // --- word provenance present (spec §12) ---
    const wordSeg = result.voice.segments.find((s) => s.words.length > 0)
    expect(wordSeg?.wordTimingSource).toBe('whisper')
  }, 600_000)

  it('resume on the completed run issues ZERO Gemini/TTS/ASR calls (spec §10)', async () => {
    let httpCalls = 0
    const countingFetch: typeof fetch = (input, init) => {
      httpCalls++
      return fetch(input as never, init)
    }
    const before = fs.statSync(path.join(process.cwd(), 'generated', RUN_ID, 'video.mp4')).mtimeMs
    const second = await generateProject({ brief: BRIEF, runId: RUN_ID, fetchImpl: countingFetch })
    expect(httpCalls).toBe(0)                                              // token-saving proof (spec §9.3)
    expect(second.videoPath).toBe(path.join(process.cwd(), 'generated', RUN_ID, 'video.mp4'))
    expect(fs.statSync(second.videoPath!).mtimeMs).toBe(before)            // video NOT re-rendered
    e2eVerified = true
  }, 120_000)
})
