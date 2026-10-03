import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateProject, StageError } from '@/ai/generate'
import { demoProjectDsl } from '@/ai/demo-project.dsl'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import type { StoryDirector, StoryPlan } from '@/ai/story/contract'
import type { VisualDirector, VisualDirectorInput } from '@/ai/visual/contract'
import type { TtsAdapter } from '@/ai/tts/contract'
import type { SceneDSL } from '@/video-engine/schema'
import type { VoiceTimeline } from '@/timeline/voice'
import type { AttemptRecord } from '@/ai/gemini/retry'

const RUN_ID = 'run-unit-1'
const BRIEF = { topic: 'Kiến trúc DeLyAI2', targetSeconds: 10, language: 'vi' }

let repoRoot: string
// R6: tests/setup-env.ts loads .env, which sets TTS_VOICE — a leftover env voice
// would override the injected `voiceId: 'injected-voice'` the manifest asserts.
let savedTtsVoice: string | undefined
beforeEach(() => {
  clearRegistered()
  registerBackends()
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'delyai-gen-'))
  savedTtsVoice = process.env.TTS_VOICE
  delete process.env.TTS_VOICE
})
afterEach(() => {
  if (savedTtsVoice === undefined) delete process.env.TTS_VOICE
  else process.env.TTS_VOICE = savedTtsVoice
  fs.rmSync(repoRoot, { recursive: true, force: true })
})

const STORY: StoryPlan = {
  title: 'Kiến trúc',
  scenes: [
    { id: 'scene-001', purpose: 'hook', durationSeconds: 9, title: 'Mở', narration: 'Xin chào các bạn.' },
    { id: 'scene-002', purpose: 'outro', durationSeconds: 9, title: 'Kết', narration: 'Hẹn gặp lại.' },
  ],
}

function countingStory(): StoryDirector & { calls: number } {
  const self = { calls: 0 }
  return Object.assign(self, {
    async direct(_b: unknown, onAttempt?: (r: AttemptRecord) => void) {
      self.calls++
      onAttempt?.({ attempt: 1, ok: true, at: new Date().toISOString() })
      const plan = structuredClone(STORY)
      // R5: a re-run MUST differ from the first payload. A byte-identical re-run
      // rehashes to the first run's story sourceHash, so resume would treat the
      // voice artifact as still valid, never re-run TTS, and the §7.3 chain test
      // (`tts.calls === 4`) would be unreachable.
      if (self.calls > 1) {
        for (const scene of plan.scenes) scene.title = `${scene.title} #${self.calls}`
      }
      return plan
    },
  })
}

/** Writes real mp3 stubs so validateVoice passes — file existence is part of the contract. */
function countingTts(repo: string, runId: string): TtsAdapter & { calls: number } {
  const self = { calls: 0 }
  const runDir = path.join(repo, 'generated', runId)
  const END_MS: Record<string, number> = { 'scene-001': 2000, 'scene-002': 1500 }
  return Object.assign(self, {
    async synthesize(input: { sceneId: string; text: string; language: string; voice: string }) {
      self.calls++
      const endMs = END_MS[input.sceneId] ?? 1000
      fs.mkdirSync(path.join(runDir, 'voice'), { recursive: true })
      fs.writeFileSync(path.join(runDir, 'voice', `${input.sceneId}.mp3`), `mp3-of-${input.sceneId}`)
      return {
        timingSource: 'exact', totalMs: endMs,
        segments: [{ id: `${input.sceneId}-voice`, text: input.text, startMs: 0, endMs, words: [{ word: 'x', startMs: 0, endMs: endMs - 100 }], timingSource: 'exact', sceneId: input.sceneId, wordTimingSource: 'whisper' }],
      } satisfies VoiceTimeline
    },
  })
}

/** Every scene claims the SAME segment `sceneId`, so `retimeScenes`' duplicate
 *  guard (R19) fires — pins that a retime failure reports through the timeline
 *  stage's failStage funnel (R27), not as an escaping RetimeError. */
function duplicateSegmentTts(repo: string, runId: string): TtsAdapter & { calls: number } {
  const self = { calls: 0 }
  const runDir = path.join(repo, 'generated', runId)
  return Object.assign(self, {
    async synthesize(input: { sceneId: string; text: string; language: string; voice: string }) {
      self.calls++
      fs.mkdirSync(path.join(runDir, 'voice'), { recursive: true })
      fs.writeFileSync(path.join(runDir, 'voice', `${input.sceneId}.mp3`), `mp3-of-${input.sceneId}`)
      return {
        timingSource: 'exact', totalMs: 1000,
        segments: [{ id: `${input.sceneId}-voice`, text: input.text, startMs: 0, endMs: 1000, words: [], timingSource: 'exact', sceneId: 'scene-001' }],
      } satisfies VoiceTimeline
    },
  })
}

/** Returns demo scenes re-id'd/retimed to the locked input — valid DSL, compilable.
 *  In 'always-fail' mode `calls` counts ATTEMPTS, not `direct()` invocations: the
 *  bounded retry is stage-local (spec §2/§4 — one invocation, ≤3 attempts inside
 *  it, attempt 3 ⇒ run fails), so the §9.2 assertion `[1, 2, 3]` pins "visual
 *  failed 3 attempts", which one `self.calls++` per invocation could never reach. */
function countingVisual(mode: 'ok' | 'always-fail' = 'ok'): VisualDirector & { calls: number } {
  const self = { calls: 0 }
  return Object.assign(self, {
    async direct(input: VisualDirectorInput, onAttempt?: (r: AttemptRecord) => void) {
      if (mode === 'always-fail') {
        const attempts: AttemptRecord[] = []
        for (const n of [1, 2, 3]) {
          self.calls++
          attempts.push({ attempt: n, ok: false, at: new Date().toISOString(), error: 'visual rejected' })
        }
        for (const a of attempts) onAttempt?.(a)
        throw Object.assign(new Error('visual: all 3 attempts failed — fake reject'), { name: 'StageRetryExhausted', attempts })
      }
      self.calls++
      onAttempt?.({ attempt: 1, ok: true, at: new Date().toISOString() })
      return input.scenes.map((outline, i) => {
        const clone = structuredClone(demoProjectDsl.scenes[i % demoProjectDsl.scenes.length]!) as SceneDSL
        return { ...clone, sceneId: outline.id, duration: outline.durationSeconds, purpose: outline.purpose } as SceneDSL
      })
    },
  })
}

function fakes() {
  return { story: countingStory(), tts: countingTts(repoRoot, RUN_ID), visual: countingVisual() }
}
const adaptersOf = (f: ReturnType<typeof fakes>) => ({ story: f.story, tts: f.tts, visual: f.visual })

/** R7: a FACTORY, never a shared module-level singleton — vitest.config has no
 *  clearMocks, so a shared `vi.fn` would leak call counts across tests. Each test
 *  calls `makeFakeRender()` and passes its own instance to `generateProject`. */
const makeFakeRender = () => vi.fn(async ({ runDir }: { runDir: string }) => {
  fs.writeFileSync(path.join(runDir, 'video.mp4'), 'mp4')
  return { videoPath: path.join(runDir, 'video.mp4') }
})

describe('generateProject — full pipeline through render-props (spec §3 order)', () => {
  it('writes every artifact with a consistent chain; result carries timeline/voice/story', async () => {
    const f = fakes()
    const fakeRender = makeFakeRender()
    const progress: string[] = []
    const result = await generateProject({
      brief: BRIEF, runId: RUN_ID, repoRoot,
      adapters: adaptersOf(f),
      renderVideo: fakeRender,
      onProgress: (e) => progress.push(`${e.stage}:${e.status}`),
    })

    const dir = path.join(repoRoot, 'generated', RUN_ID)
    for (const file of ['brief.json', 'story.json', 'voicetimeline.json', 'master-timeline.json', 'project.dsl.json', 'render-props.json', 'manifest.json']) {
      expect(fs.existsSync(path.join(dir, file)), file).toBe(true)
    }
    expect(fs.readdirSync(path.join(dir, 'compiled')).sort()).toEqual(['scene-001.json', 'scene-002.json'])
    expect(fs.existsSync(path.join(dir, 'voice', 'scene-001.mp3'))).toBe(true)

    // pipeline order visible in progress events (spec §3)
    const starts = progress.filter((p) => p.endsWith(':start')).map((p) => p.split(':')[0])
    expect(starts).toEqual(['story', 'voice', 'timeline', 'visual', 'compile', 'renderProps', 'render'])

    // audio authority: durations = endMs/1000 + 0.5
    expect(result.story.scenes.map((s) => s.id)).toEqual(['scene-001', 'scene-002'])
    expect(result.voice.segments.map((s) => s.endMs)).toEqual([2000, 1500])
    expect(result.timeline.sceneWindows['scene-001']!.durationInFrames).toBe(75)  // 2.5s @30
    expect(result.timeline.sceneWindows['scene-002']!.durationInFrames).toBe(60)  // 2.0s @30
    expect(result.timeline.diagnostics).toEqual([])                               // zero voice warnings by construction
    expect(result.videoPath).toBe(path.join(dir, 'video.mp4'))
    expect(fakeRender).toHaveBeenCalledTimes(1)

    // render-props carries props + header (spec §7.2)
    const propsDoc = JSON.parse(fs.readFileSync(path.join(dir, 'render-props.json'), 'utf8'))
    expect(propsDoc).toMatchObject({ runId: RUN_ID, sourceHash: expect.any(String) })
    expect(propsDoc.payload.scenes).toHaveLength(2)
    expect(propsDoc.payload.audioSrcBySceneId).toEqual({
      'scene-001': `generated/${RUN_ID}/voice/scene-001.mp3`,
      'scene-002': `generated/${RUN_ID}/voice/scene-002.mp3`,
    })
    expect(propsDoc.payload.voice.segments[0].wordTimingSource).toBe('whisper')

    // manifest records §5.2 config + per-stage attempts
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    expect(manifest.tts).toMatchObject({ provider: 'tts-studio', model: 'omnivoice', voiceId: 'injected-voice', outputFormat: 'mp3', normalizeText: false })
    expect(manifest.retime.paddingSeconds).toBe(0.5)
    expect(manifest.stages.story.attempts).toHaveLength(1)
    expect(manifest.stages.story.status).toBe('done')
    expect(manifest.engineVersion).toBe('0.1.0')

    // call counts for the run: 1 story, 2 TTS, 1 visual
    expect([f.story.calls, f.tts.calls, f.visual.calls]).toEqual([1, 2, 1])
  })
})

describe('generateProject — resume token-saving (spec §9.2)', () => {
  it('valid upstream ⇒ zero story/TTS/visual calls; every stage reports skip', async () => {
    const f = fakes()
    const fakeRender = makeFakeRender()
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: fakeRender })
    expect([f.story.calls, f.tts.calls, f.visual.calls]).toEqual([1, 2, 1])

    const progress: string[] = []
    await generateProject({
      brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: fakeRender,
      onProgress: (e) => progress.push(`${e.stage}:${e.status}`),
    })
    expect([f.story.calls, f.tts.calls, f.visual.calls]).toEqual([1, 2, 1]) // UNCHANGED — 0 new calls
    expect(progress.filter((p) => p.endsWith(':skip'))).toEqual([
      'story:skip', 'voice:skip', 'timeline:skip', 'visual:skip', 'compile:skip', 'renderProps:skip', 'render:skip',
    ])
    expect(progress.filter((p) => p.endsWith(':start'))).toEqual([])
    expect(fakeRender).toHaveBeenCalledTimes(1) // resume did not re-render
  })

  it('run #1 Visual fails 3 attempts → resume: Story/TTS counts unchanged, Visual retried (spec §9.2)', async () => {
    const f = { story: countingStory(), tts: countingTts(repoRoot, RUN_ID), visual: countingVisual('always-fail') }
    await expect(generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f) }))
      .rejects.toBeInstanceOf(StageError)
    expect([f.story.calls, f.tts.calls, f.visual.calls]).toEqual([1, 2, 3])
    const failedManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'generated', RUN_ID, 'manifest.json'), 'utf8'))
    expect(failedManifest.stages.visual.status).toBe('failed')
    expect(failedManifest.stages.visual.attempts).toHaveLength(3)

    f.visual = countingVisual('ok') // second attempt: the director is fixed
    const result = await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: makeFakeRender() })
    expect([f.story.calls, f.tts.calls]).toEqual([1, 2])     // ZERO new story/TTS calls
    expect(f.visual.calls).toBe(1)                            // visual retried from scratch
    expect(result.timeline.sceneWindows['scene-001']!.durationInFrames).toBe(75)
  })

  it('corrupt-but-existing story.json is NOT done — story re-runs (Review Focus 2)', async () => {
    const f = fakes()
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: makeFakeRender() })
    const storyPath = path.join(repoRoot, 'generated', RUN_ID, 'story.json')
    fs.writeFileSync(storyPath, '{"truncated": ')
    // After corruption the sourceHash chain moves, so render legitimately re-runs
    // here — the injection only prevents a real spawn, no count assertion.
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: makeFakeRender() })
    expect(f.story.calls).toBe(2)  // re-ran
    expect(f.tts.calls).toBe(4)    // new story hash invalidates voice (§7.3) — re-ran too
  })

  it('same runId with a DIFFERENT brief is a hard failure (no silent resume)', async () => {
    const f = fakes()
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: makeFakeRender() })
    await expect(generateProject({ brief: { ...BRIEF, topic: 'KHÁC' }, runId: RUN_ID, repoRoot, adapters: adaptersOf(f) }))
      .rejects.toThrow(/BRIEF_MISMATCH/)
  })

  it('corrupt brief.json + DIFFERENT brief with an existing manifest ⇒ BRIEF_MISMATCH (R26)', async () => {
    const f = fakes()
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: makeFakeRender() })
    fs.writeFileSync(path.join(repoRoot, 'generated', RUN_ID, 'brief.json'), '{"truncated": ')
    await expect(generateProject({ brief: { ...BRIEF, topic: 'KHÁC' }, runId: RUN_ID, repoRoot, adapters: adaptersOf(f) }))
      .rejects.toThrow(/BRIEF_MISMATCH/)
    expect(f.story.calls).toBe(1) // rejected before any stage ran — the corrupt artifact was NOT overwritten
    const stillCorrupt = fs.readFileSync(path.join(repoRoot, 'generated', RUN_ID, 'brief.json'), 'utf8')
    expect(stillCorrupt).toBe('{"truncated": ')
  })

  it('corrupt brief.json + SAME brief ⇒ resumes normally and self-heals the identity artifact (R26)', async () => {
    const f = fakes()
    const fakeRender = makeFakeRender()
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: fakeRender })
    fs.writeFileSync(path.join(repoRoot, 'generated', RUN_ID, 'brief.json'), 'not json at all')
    const progress: string[] = []
    const result = await generateProject({
      brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: fakeRender,
      onProgress: (e) => progress.push(`${e.stage}:${e.status}`),
    })
    expect(result.runId).toBe(RUN_ID)
    expect([f.story.calls, f.tts.calls, f.visual.calls]).toEqual([1, 2, 1]) // zero-call resume still holds
    expect(progress.filter((p) => p.endsWith(':skip'))).toEqual([
      'story:skip', 'voice:skip', 'timeline:skip', 'visual:skip', 'compile:skip', 'renderProps:skip', 'render:skip',
    ])
    const healed = JSON.parse(fs.readFileSync(path.join(repoRoot, 'generated', RUN_ID, 'brief.json'), 'utf8'))
    expect(healed).toMatchObject({ runId: RUN_ID, payload: BRIEF, sourceHash: expect.any(String) })
  })
})

describe('generateProject — failure semantics', () => {
  it('a TTS failure is a hard run failure with the stage recorded (no estimated fallback, spec §3)', async () => {
    const f = fakes()
    const broken: TtsAdapter = { async synthesize() { throw new Error('TTS_HTTP_500') } }
    const err = await generateProject({
      brief: BRIEF, runId: RUN_ID, repoRoot,
      adapters: { story: f.story, visual: f.visual, tts: broken },
    }).catch((e) => e as StageError)
    expect(err).toBeInstanceOf(StageError)
    expect((err as StageError).stage).toBe('voice')
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'generated', RUN_ID, 'manifest.json'), 'utf8'))
    expect(manifest.stages.voice.status).toBe('failed')
    expect(manifest.stages.voice.error).toContain('TTS_HTTP_500')
    expect(manifest.stages.story.status).toBe('done')
  })

  it('rejects runIds that are not path-safe (Review Focus 5 — spawn/path injection)', async () => {
    await expect(generateProject({ brief: BRIEF, runId: 'bad id/..\\x', repoRoot, adapters: adaptersOf(fakes()) }))
      .rejects.toThrow(/RUN_ID_INVALID/)
  })

  it('a retime failure reports through the timeline failStage funnel — no escaping RetimeError (R27)', async () => {
    const f = { story: countingStory(), tts: duplicateSegmentTts(repoRoot, RUN_ID), visual: countingVisual() }
    const progress: string[] = []
    const err = await generateProject({
      brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f),
      onProgress: (e) => progress.push(`${e.stage}:${e.status}`),
    }).catch((e) => e as StageError)
    expect(err).toBeInstanceOf(StageError)
    expect((err as StageError).stage).toBe('timeline')
    expect(progress).toContain('timeline:fail')
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'generated', RUN_ID, 'manifest.json'), 'utf8'))
    expect(manifest.stages.timeline.status).toBe('failed')
    expect(manifest.stages.timeline.error).toContain('RETIME_DUPLICATE_SEGMENT')
    expect(manifest.stages.voice.status).toBe('done') // upstream stages untouched
    expect(manifest.stages.visual.status).toBe('pending') // downstream stages never ran
  })
})

describe('generateProject — render stage + stale video (spec §9.2)', () => {
  it('renders once, skips a fresh resume, re-renders when render-props.sourceHash moves', async () => {
    const f = fakes()
    const renders: string[] = []
    const fakeRender = vi.fn(async (o: { runDir: string }) => {
      renders.push(o.runDir)
      fs.writeFileSync(path.join(o.runDir, 'video.mp4'), 'mp4')
      return { videoPath: path.join(o.runDir, 'video.mp4') }
    })

    const first = await generateProject({
      brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: fakeRender,
    })
    expect(first.videoPath).toBe(path.join(repoRoot, 'generated', RUN_ID, 'video.mp4'))
    expect(fakeRender).toHaveBeenCalledTimes(1)
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'generated', RUN_ID, 'manifest.json'), 'utf8'))
    const propsDoc = JSON.parse(fs.readFileSync(path.join(repoRoot, 'generated', RUN_ID, 'render-props.json'), 'utf8'))
    expect(manifest.render).toEqual({ sourceHash: propsDoc.sourceHash, output: 'video.mp4' })

    // fresh resume: video valid → render skipped, zero new upstream calls
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: fakeRender })
    expect(fakeRender).toHaveBeenCalledTimes(1)                     // NOT called again
    expect([f.story.calls, f.tts.calls, f.visual.calls]).toEqual([1, 2, 1])

    // STALE: manifest.render.sourceHash no longer matches the current render-props
    const manifestPath = path.join(repoRoot, 'generated', RUN_ID, 'manifest.json')
    const stale = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    stale.render.sourceHash = 'stale-hash-not-the-props-hash'
    fs.writeFileSync(manifestPath, JSON.stringify(stale))
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: fakeRender })
    expect(fakeRender).toHaveBeenCalledTimes(2)                     // re-rendered (Review Focus 6)
  })
})
