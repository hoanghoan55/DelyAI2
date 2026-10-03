import fs from 'node:fs'
import path from 'node:path'
import type { Brief, StoryDirector, StoryPlan, StorySceneOutline } from './story/contract'
import type { VisualDirector } from './visual/contract'
import type { TtsAdapter } from './tts/contract'
import type { VoiceTimeline } from '@/timeline/voice'
import type { MasterTimeline } from '@/timeline/master'
import type { Diagnostic } from '@/timeline/diagnostics'
import { SCENE_DSL_VERSION, parseProjectDsl, type CompositionId, type SceneDSL, type ProjectDsl } from '@/video-engine/schema'
import { buildMasterTimeline } from '@/timeline/master'
import { listAvailable } from '@/video-engine/registry'
import { buildProject, diagnoseScenes } from './project'
import { retimeScenes, RETIME_PADDING_SECONDS } from './retime'
// Direct stage imports — never `./index`: index.ts re-exports generateProject,
// so importing it here would be a cycle (composition root, see AGENTS.md).
import { createRemoteTtsAdapter } from './tts/remote'
import { createGeminiStoryDirector } from './gemini/story-director'
import { createGeminiVisualDirector } from './gemini/visual-director'
import { STORY_PROMPT_VERSION } from './gemini/prompts/story'
import { VISUAL_PROMPT_VERSION } from './gemini/prompts/visual'
import type { AttemptRecord } from './gemini/retry'
import {
  briefHash, stageSourceHash, createManifest, readManifest, writeManifest,
  writeJsonArtifact, readJsonArtifact,
  validateStory, validateVoice, validateTimeline, validateVisual, validateCompiled, validateRenderProps,
  type GenerateStage,
} from './artifacts'

export type { GenerateStage }
export type GenerateProgress = { stage: GenerateStage; status: 'start' | 'done' | 'skip' | 'fail'; detail?: string }

export class StageError extends Error {
  constructor(readonly stage: GenerateStage, message: string, readonly attempts?: AttemptRecord[]) {
    super(`[${stage}] ${message}`); this.name = 'StageError'
  }
}

const RENDER_DEFAULTS = { fps: 30, width: 1920, height: 1080 } // matches the Phase 0 demo; spec §8 exposes no flags
const RUN_ID_PATTERN = /^[\w-]+$/

export type GenerateOptions = {
  brief: Brief
  runId?: string
  repoRoot?: string
  voiceId?: string
  paddingSeconds?: number
  adapters?: { story?: StoryDirector; visual?: VisualDirector; tts?: TtsAdapter }
  fetchImpl?: typeof fetch
  measureDuration?: (filePath: string) => Promise<number>
  onProgress?: (event: GenerateProgress) => void
}

export type GenerateResult = {
  runId: string; dir: string
  videoPath: string | null
  renderPropsPath: string
  story: StoryPlan; voice: VoiceTimeline; timeline: MasterTimeline
  diagnostics: Diagnostic[]
}

export async function generateProject(options: GenerateOptions): Promise<GenerateResult> {
  const repoRoot = options.repoRoot ?? process.cwd()
  const brief = options.brief
  const progress = options.onProgress ?? (() => undefined)

  // ---- run identity ------------------------------------------------------
  const runId = options.runId ?? `run-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
  if (!RUN_ID_PATTERN.test(runId)) throw new StageError('story', `RUN_ID_INVALID: "${runId}" must match /^[\w-]+$/`)
  const dir = path.join(repoRoot, 'generated', runId)
  fs.mkdirSync(dir, { recursive: true })

  // ---- manifest (read first: it is the brief-identity fallback — R26) ----
  let manifest = readManifest(dir)

  // ---- brief artifact (identity of the run) ------------------------------
  const bHash = briefHash(brief)
  const briefPath = path.join(dir, 'brief.json')
  const existingBrief = readJsonArtifact<Brief>(briefPath)
  if (existingBrief) {
    if (JSON.stringify(existingBrief.payload) !== JSON.stringify(brief)) {
      throw new StageError('story', `BRIEF_MISMATCH: run "${runId}" belongs to a different brief`)
    }
  } else if (manifest && manifest.briefHash !== bHash) {
    // Corrupt/missing brief.json with an existing manifest (R26): the manifest's
    // hash is the identity of record. Hash comparison — order-independent — so a
    // different brief on the same runId can never silently overwrite it.
    throw new StageError('story', `BRIEF_MISMATCH: run "${runId}" belongs to a different brief`)
  } else {
    // True first run, or self-heal after corruption: (re)write the artifact.
    writeJsonArtifact(briefPath, { schemaVersion: 'brief-1', runId, sourceHash: bHash }, brief)
  }

  // ---- manifest creation (first run only) --------------------------------
  if (!manifest) {
    manifest = createManifest({
      runId, brief, briefHash: bHash,
      paddingSeconds: options.paddingSeconds ?? RETIME_PADDING_SECONDS, // first run wins; resume reads the manifest
      storyPromptVersion: STORY_PROMPT_VERSION, visualPromptVersion: VISUAL_PROMPT_VERSION,
      asrModel: process.env.WHISPER_MODEL ?? 'medium',
      voiceId: options.voiceId ?? process.env.TTS_VOICE ?? '',
    })
    writeManifest(dir, manifest)
  }
  const stageInputsOf = (stage: GenerateStage): Record<string, unknown> | undefined => manifest!.stages[stage].stageInputs

  // Explicit type annotation is REQUIRED: TypeScript only applies never-returning
  // call narrowing (definite assignment of `story`/`voice`/…) when a const-bound
  // function carries an explicit type annotation, not just a return type.
  const failStage: (stage: GenerateStage, err: unknown, attempts?: AttemptRecord[]) => never = (stage, err, attempts) => {
    manifest!.stages[stage] = {
      ...manifest!.stages[stage],
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      attempts: attempts ?? (err as { attempts?: AttemptRecord[] })?.attempts,
      at: new Date().toISOString(),
    }
    writeManifest(dir, manifest!)
    progress({ stage, status: 'fail', detail: manifest!.stages[stage].error })
    if (err instanceof StageError) throw err
    throw new StageError(stage, err instanceof Error ? err.message : String(err), attempts)
  }

  let upstream = bHash

  // ---- ① story -----------------------------------------------------------
  const storyInputs = { promptVersion: STORY_PROMPT_VERSION }
  const storyValid = stageInputsOf('story') ? validateStory(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  let story: StoryPlan
  if (storyValid.ok) {
    story = readJsonArtifact<StoryPlan>(path.join(dir, 'story.json'))!.payload
    upstream = storyValid.sourceHash
    progress({ stage: 'story', status: 'skip' })
  } else {
    progress({ stage: 'story', status: 'start', detail: storyValid.reason })
    try {
      const director = options.adapters?.story ?? createGeminiStoryDirector({ fetchImpl: options.fetchImpl })
      const attempts: AttemptRecord[] = []
      story = await director.direct(brief, (r) => attempts.push(r))
      const sourceHash = stageSourceHash({ upstream, stageInputs: storyInputs, payload: story })
      writeJsonArtifact(path.join(dir, 'story.json'), { schemaVersion: 'story-1', runId, sourceHash }, story)
      manifest.stages.story = { status: 'done', stageInputs: storyInputs, sourceHash, attempts, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'story', status: 'done' })
    } catch (err) { failStage('story', err) }
  }

  // ---- ② voice (TTS + ASR per scene) -------------------------------------
  const voiceInputsFromManifest = (): Record<string, unknown> => ({
    tts: {
      modelId: 'omnivoice', voiceId: manifest!.tts.voiceId || 'injected-voice',
      outputFormat: 'mp3', voiceSettings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, speed: 1.0 }, normalizeText: false,
    },
    asr: { model: manifest!.asr.model, wordTimestamps: true },
  })
  const voiceValid = stageInputsOf('voice') ? validateVoice(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  let voice: VoiceTimeline
  if (voiceValid.ok) {
    voice = readJsonArtifact<VoiceTimeline>(path.join(dir, 'voicetimeline.json'))!.payload
    upstream = voiceValid.sourceHash
    progress({ stage: 'voice', status: 'skip' })
  } else {
    progress({ stage: 'voice', status: 'start', detail: voiceValid.reason })
    try {
      const injected = options.adapters?.tts
      let voiceId = manifest.tts.voiceId || options.voiceId || process.env.TTS_VOICE || ''
      if (!injected && !voiceId) {
        // Resolve lazily, ONLY when this stage actually runs (spec §9.3's
        // zero-call resume) — a skipped voice stage must never touch HTTP.
        const baseUrl = process.env.TTS_BASE_URL ?? 'http://localhost:8080'
        const apiKey = process.env.TTS_API_KEY
        if (!apiKey) throw new Error('TTS_API_KEY is not set (put it in .env — never in code)')
        const res = await (options.fetchImpl ?? fetch)(`${baseUrl}/v1/voices`, { headers: { 'x-api-key': apiKey } })
        if (!res.ok) throw new Error(`TTS_VOICES_HTTP_${res.status}`)
        const data = (await res.json()) as { voices?: { voice_id?: string }[] }
        voiceId = data.voices?.[0]?.voice_id ?? ''
        if (!voiceId) throw new Error('TTS_NO_VOICES: GET /v1/voices returned no voices')
      }
      if (!injected && !process.env.TTS_API_KEY) throw new Error('TTS_API_KEY is not set (put it in .env — never in code)')
      manifest.tts.voiceId = voiceId || 'injected-voice'
      writeManifest(dir, manifest)

      const baseUrl = process.env.TTS_BASE_URL ?? 'http://localhost:8080'
      const tts: TtsAdapter = injected ?? createRemoteTtsAdapter({
        baseUrl,
        apiKey: process.env.TTS_API_KEY ?? '',
        voiceId: manifest.tts.voiceId,
        outDir: path.join(dir, 'voice'),
        fetchImpl: options.fetchImpl,
        measureDuration: options.measureDuration,
      })
      const parts: VoiceTimeline[] = []
      for (const scene of story.scenes) {
        parts.push(await tts.synthesize({ text: scene.narration, language: brief.language, voice: manifest.tts.voiceId, sceneId: scene.id }))
      }
      voice = mergeVoiceTimelines(parts)
      const stageInputs = voiceInputsFromManifest()
      const sourceHash = stageSourceHash({ upstream, stageInputs, payload: voice })
      writeJsonArtifact(path.join(dir, 'voicetimeline.json'), { schemaVersion: 'voice-1', runId, sourceHash }, voice)
      manifest.stages.voice = { status: 'done', stageInputs, sourceHash, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'voice', status: 'done' })
    } catch (err) { failStage('voice', err) }
  }

  // ---- ③ retime + ④ master timeline --------------------------------------
  const padding = manifest.retime.paddingSeconds
  const timelineInputs = { paddingSeconds: padding, fps: RENDER_DEFAULTS.fps, width: RENDER_DEFAULTS.width, height: RENDER_DEFAULTS.height, voiceScenePolicy: 'strict' }
  const timelineValid = stageInputsOf('timeline') ? validateTimeline(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  let timeline: MasterTimeline
  // Outer scope so the visual stage can consume it when the timeline was skipped.
  let retimed: StorySceneOutline[]
  if (timelineValid.ok) {
    timeline = readJsonArtifact<MasterTimeline>(path.join(dir, 'master-timeline.json'))!.payload
    // Skip-path retime: the chain pins story+voice to the exact payload that the
    // run which wrote this artifact already retimed successfully (retime is pure),
    // so it cannot throw here — the throwing path is the run branch's try below.
    retimed = retimeScenes(story.scenes, voice, padding)
    upstream = timelineValid.sourceHash
    progress({ stage: 'timeline', status: 'skip' })
  } else {
    progress({ stage: 'timeline', status: 'start', detail: timelineValid.reason })
    try {
      // R27: retime lives INSIDE the try — a RetimeError must funnel through
      // failStage('timeline', …) (progress + manifest + StageError), not escape.
      retimed = retimeScenes(story.scenes, voice, padding)
      timeline = buildMasterTimeline({
        fps: RENDER_DEFAULTS.fps, width: RENDER_DEFAULTS.width, height: RENDER_DEFAULTS.height,
        scenes: retimed.map((s) => ({ sceneId: s.id, duration: s.durationSeconds })),
        voice, music: null, voiceScenePolicy: 'strict',
      })
      if (timeline.diagnostics.length > 0) {
        throw new Error(`TIMELINE_DIAGNOSTICS: ${timeline.diagnostics.map((d) => d.code).join(', ')} — retime/strict construction violated (spec §3)`)
      }
      const sourceHash = stageSourceHash({ upstream, stageInputs: timelineInputs, payload: timeline })
      writeJsonArtifact(path.join(dir, 'master-timeline.json'), { schemaVersion: 'master-1', runId, sourceHash }, timeline)
      manifest.stages.timeline = { status: 'done', stageInputs: timelineInputs, sourceHash, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'timeline', status: 'done' })
    } catch (err) { failStage('timeline', err) }
  }

  // ---- ⑤ visual (locked windows + catalogue) -----------------------------
  const catalogue = listAvailable()
  const seed = Number.parseInt(briefHash(brief).slice(0, 8), 16) % 2147483647
  const style: ProjectDsl['style'] = { styleId: 'default' }
  const visualInputs = {
    promptVersion: VISUAL_PROMPT_VERSION,
    seed,
    style,
    catalogue: {
      compositions: catalogue.composition.map((c) => c.id),
      visual: catalogue.visual.map((r) => r.id),
      motion: catalogue.motion.map((r) => r.id),
    },
  }
  const visualValid = stageInputsOf('visual') ? validateVisual(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  let dsl: ProjectDsl
  if (visualValid.ok) {
    dsl = readJsonArtifact<ProjectDsl>(path.join(dir, 'project.dsl.json'))!.payload
    upstream = visualValid.sourceHash
    progress({ stage: 'visual', status: 'skip' })
  } else {
    progress({ stage: 'visual', status: 'start', detail: visualValid.reason })
    try {
      const director = options.adapters?.visual ?? createGeminiVisualDirector({
        diagnose: (scenes: SceneDSL[]) => diagnoseScenes(scenes, timeline),
        fetchImpl: options.fetchImpl,
      })
      const attempts: AttemptRecord[] = []
      const scenes = await director.direct({
        topic: brief.topic,
        language: brief.language,
        scenes: retimed,
        availableCompositions: catalogue.composition.map((c) => c.id) as CompositionId[],
        availableVisualRecipes: catalogue.visual,
        availableMotionRecipes: catalogue.motion,
        style,
        assets: [],
        timelineWindow: { startSeconds: 0, durationSeconds: timeline.totalFrames / RENDER_DEFAULTS.fps },
        constraints: {},
        sceneWindows: timeline.sceneWindows,
        fps: RENDER_DEFAULTS.fps,
      }, (r) => attempts.push(r))
      const candidate: ProjectDsl = {
        dslVersion: SCENE_DSL_VERSION,
        project: { id: runId, title: story.title, language: brief.language },
        render: { ...RENDER_DEFAULTS },
        style,
        seed,
        voiceScenePolicy: 'strict',
        music: null,
        scenes,
      }
      dsl = parseProjectDsl(candidate) // final strict guard
      const sourceHash = stageSourceHash({ upstream, stageInputs: visualInputs, payload: dsl })
      writeJsonArtifact(path.join(dir, 'project.dsl.json'), { schemaVersion: 'dsl-1', runId, sourceHash }, dsl)
      manifest.stages.visual = { status: 'done', stageInputs: visualInputs, sourceHash, attempts, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'visual', status: 'done' })
    } catch (err) { failStage('visual', err) }
  }

  // ---- ⑥ compile (via buildProject — the only compiler path, spec §8) -----
  const compileInputs = { engineVersion: manifest.engineVersion }
  const compileValid = stageInputsOf('compile') ? validateCompiled(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  if (compileValid.ok) {
    upstream = compileValid.sourceHash
    progress({ stage: 'compile', status: 'skip' })
  } else {
    progress({ stage: 'compile', status: 'start', detail: compileValid.reason })
    try {
      const built = buildProject({ dsl, voice })
      if (built.timeline.totalFrames !== timeline.totalFrames) {
        throw new Error(`COMPILE_TIMELINE_MISMATCH: compiled ${built.timeline.totalFrames} ≠ locked ${timeline.totalFrames}`)
      }
      const entries = built.compiledScenes.map((s) => ({ sceneId: s.sceneId, compiledHash: s.provenance.compiledHash }))
      const sourceHash = stageSourceHash({ upstream, stageInputs: compileInputs, payload: entries })
      fs.mkdirSync(path.join(dir, 'compiled'), { recursive: true })
      for (const scene of built.compiledScenes) {
        writeJsonArtifact(path.join(dir, 'compiled', `${scene.sceneId}.json`), { schemaVersion: 'ir-1', runId, sourceHash }, scene)
      }
      manifest.stages.compile = { status: 'done', stageInputs: compileInputs, sourceHash, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'compile', status: 'done' })
    } catch (err) { failStage('compile', err) }
  }
  const compiledScenes = readCompiledScenes(dir)

  // ---- ⑥b render-props.json (header + props, spec §7.2) ------------------
  const audioSrcBySceneId = Object.fromEntries(voice.segments.map((s) => [s.sceneId, `generated/${runId}/voice/${s.sceneId}.mp3`]))
  const propsPayload = { scenes: compiledScenes, timeline, voice, audioSrcBySceneId }
  const propsInputs = { audioSceneIds: voice.segments.map((s) => s.sceneId).sort() }
  const propsValid = stageInputsOf('renderProps') ? validateRenderProps(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  if (propsValid.ok) {
    upstream = propsValid.sourceHash
    progress({ stage: 'renderProps', status: 'skip' })
  } else {
    progress({ stage: 'renderProps', status: 'start', detail: propsValid.reason })
    try {
      const sourceHash = stageSourceHash({ upstream, stageInputs: propsInputs, payload: propsPayload })
      writeJsonArtifact(path.join(dir, 'render-props.json'), { schemaVersion: 'render-props-1', runId, sourceHash }, propsPayload)
      manifest.stages.renderProps = { status: 'done', stageInputs: propsInputs, sourceHash, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'renderProps', status: 'done' })
    } catch (err) { failStage('renderProps', err) }
  }

  // The render stage (video.mp4 + manifest.render) is added by Task 11; up to
  // render-props the run is complete and `videoPath` stays null.

  return {
    runId, dir,
    videoPath: null,
    renderPropsPath: path.join(dir, 'render-props.json'),
    story, voice, timeline,
    diagnostics: timeline.diagnostics,
  }
}

/** Scene-relative segments concatenated; totalMs = Σ endMs (total voiced ms across scenes). */
export function mergeVoiceTimelines(parts: VoiceTimeline[]): VoiceTimeline {
  const segments = parts.flatMap((p) => p.segments)
  if (segments.some((s) => s.timingSource !== 'exact')) throw new Error('VOICE_TIMING_SOURCE_MIXED: every part must be exact')
  return { timingSource: 'exact', totalMs: segments.reduce((acc, s) => acc + s.endMs, 0), segments }
}

function readCompiledScenes(dir: string) {
  const dslDoc = readJsonArtifact<{ scenes: { sceneId: string }[] }>(path.join(dir, 'project.dsl.json'))
  if (!dslDoc) throw new StageError('compile', 'project.dsl.json missing after compile stage')
  return dslDoc.payload.scenes.map((s) => {
    const doc = readJsonArtifact<never>(path.join(dir, 'compiled', `${s.sceneId}.json`))
    if (!doc) throw new StageError('compile', `compiled/${s.sceneId}.json missing`)
    return doc.payload
  })
}
