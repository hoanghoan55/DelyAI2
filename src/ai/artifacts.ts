import fs from 'node:fs'
import path from 'node:path'
import { hashObject } from '@/shared'
import { parseProjectDsl } from '@/video-engine/schema'
import { ENGINE_VERSION } from '@/video-engine/version'
import { StoryPlanSchema } from './story/schema'
import { computeCompiledHash } from './project'
import type { Brief, StoryPlan } from './story/contract'
import type { AttemptRecord } from './gemini/retry'

export type ArtifactHeader = { schemaVersion: string; runId: string; createdAt: string; sourceHash: string }
export type GenerateStage = 'story' | 'voice' | 'timeline' | 'visual' | 'compile' | 'renderProps' | 'render'
export type { AttemptRecord }
export type StageRecord = { status: 'pending' | 'done' | 'failed'; stageInputs?: Record<string, unknown>; sourceHash?: string; attempts?: AttemptRecord[]; at?: string; error?: string }

export type Manifest = {
  schemaVersion: 'manifest-1'
  runId: string
  createdAt: string
  briefHash: string
  engineVersion: string
  tts: { baseUrl: string; provider: 'tts-studio'; model: 'omnivoice'; voiceId: string; outputFormat: 'mp3'; voiceSettings: { stability: 0.5; similarity_boost: 0.75; style: 0.0; speed: 1.0 }; normalizeText: false }
  asr: { model: string; wordTimestamps: true; durationSource: 'ffprobe'; maxDurationDeltaSeconds: 0.1 }
  retime: { paddingSeconds: number }
  promptVersions: { story: string; visual: string }
  stages: Record<GenerateStage, StageRecord>
  render?: { sourceHash: string; output: 'video.mp4' }
}

/** Plan ruling (spec §7.3): hash commits upstream + stage inputs + payload. */
export function briefHash(brief: Brief): string {
  return hashObject({ upstream: null, stageInputs: {}, payload: brief })
}
export function stageSourceHash(input: { upstream: string; stageInputs: Record<string, unknown>; payload: unknown }): string {
  return hashObject(input)
}

export function writeJsonArtifact(
  filePath: string,
  header: { schemaVersion: string; runId: string; sourceHash: string; createdAt?: string },
  payload: unknown,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const doc: ArtifactHeader & { payload: unknown } = {
    schemaVersion: header.schemaVersion,
    runId: header.runId,
    createdAt: header.createdAt ?? new Date().toISOString(),
    sourceHash: header.sourceHash,
    payload,
  }
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2))
}

export function readJsonArtifact<T>(filePath: string): { header: ArtifactHeader; payload: T } | null {
  try {
    const doc = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<ArtifactHeader> & { payload?: unknown }
    if (typeof doc.sourceHash !== 'string' || typeof doc.runId !== 'string' || typeof doc.schemaVersion !== 'string') return null
    return { header: doc as ArtifactHeader, payload: doc.payload as T }
  } catch {
    return null
  }
}

export function readManifest(runDir: string): Manifest | null {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8')) as Manifest
    if (doc.schemaVersion !== 'manifest-1' || !doc.stages) return null
    return doc
  } catch {
    return null
  }
}
export function writeManifest(runDir: string, manifest: Manifest): void {
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

export function createManifest(input: {
  runId: string; brief: Brief; briefHash: string; paddingSeconds: number
  storyPromptVersion: string; visualPromptVersion: string; asrModel: string; voiceId?: string
}): Manifest {
  const stages = {} as Manifest['stages']
  for (const s of ['story', 'voice', 'timeline', 'visual', 'compile', 'renderProps', 'render'] as GenerateStage[]) {
    stages[s] = { status: 'pending' }
  }
  return {
    schemaVersion: 'manifest-1',
    runId: input.runId,
    createdAt: new Date().toISOString(),
    briefHash: input.briefHash,
    engineVersion: ENGINE_VERSION,
    tts: {
      baseUrl: process.env.TTS_BASE_URL ?? 'http://localhost:8080',
      provider: 'tts-studio',
      model: 'omnivoice',
      voiceId: input.voiceId ?? '',
      outputFormat: 'mp3',
      voiceSettings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, speed: 1.0 },
      normalizeText: false,
    },
    asr: { model: input.asrModel, wordTimestamps: true, durationSource: 'ffprobe', maxDurationDeltaSeconds: 0.1 },
    retime: { paddingSeconds: input.paddingSeconds },
    promptVersions: { story: input.storyPromptVersion, visual: input.visualPromptVersion },
    stages,
  }
}

export type StageValidation = { ok: true; sourceHash: string } | { ok: false; reason: string }

function checkChain(doc: { header: ArtifactHeader; payload: unknown } | null, upstream: string, stageInputs: Record<string, unknown>, manifest: Manifest, stage: GenerateStage): StageValidation | null {
  if (!doc) return { ok: false, reason: `${stage}: artifact missing or corrupt` }
  const expected = stageSourceHash({ upstream, stageInputs, payload: doc.payload })
  if (doc.header.sourceHash !== expected) return { ok: false, reason: `${stage}: sourceHash chain mismatch` }
  const record = manifest.stages[stage]
  if (record.sourceHash !== undefined && record.sourceHash !== expected) return { ok: false, reason: `${stage}: manifest sourceHash differs` }
  return null
}

export function validateStory(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.story.stageInputs
  if (!stageInputs) return { ok: false, reason: 'story: never ran (no stageInputs in manifest)' }
  const doc = readJsonArtifact<StoryPlan>(path.join(runDir, 'story.json'))
  const chain = checkChain(doc, upstream, stageInputs, manifest, 'story')
  if (chain) return chain
  const parsed = StoryPlanSchema.safeParse(doc!.payload)
  if (!parsed.success) return { ok: false, reason: `story: StoryPlanSchema rejected payload — ${parsed.error.issues[0]?.message}` }
  return { ok: true, sourceHash: doc!.header.sourceHash }
}

export function validateVoice(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.voice.stageInputs
  if (!stageInputs) return { ok: false, reason: 'voice: never ran' }
  type VoiceTl = { timingSource?: string; totalMs?: number; segments?: { sceneId: string; endMs: number; words?: unknown[] }[] }
  const doc = readJsonArtifact<VoiceTl>(path.join(runDir, 'voicetimeline.json'))
  const chain = checkChain(doc, upstream, stageInputs, manifest, 'voice')
  if (chain) return chain
  const payload = doc!.payload
  if (!Array.isArray(payload.segments) || payload.segments.length === 0) return { ok: false, reason: 'voice: no segments' }
  for (const seg of payload.segments) {
    if (!seg.sceneId || !Number.isFinite(seg.endMs)) return { ok: false, reason: 'voice: malformed segment' }
    const mp3 = path.join(runDir, 'voice', `${seg.sceneId}.mp3`)
    const stat = fs.existsSync(mp3) ? fs.statSync(mp3) : null
    if (!stat || stat.size === 0) return { ok: false, reason: `voice: missing/empty ${path.basename(mp3)}` }
  }
  return { ok: true, sourceHash: doc!.header.sourceHash }
}

export function validateTimeline(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.timeline.stageInputs
  if (!stageInputs) return { ok: false, reason: 'timeline: never ran' }
  type MasterLike = { totalFrames: number; sceneWindows: Record<string, { durationInFrames: number }>; diagnostics: unknown[] }
  const doc = readJsonArtifact<MasterLike>(path.join(runDir, 'master-timeline.json'))
  const chain = checkChain(doc, upstream, stageInputs, manifest, 'timeline')
  if (chain) return chain
  const t = doc!.payload
  if (!t.sceneWindows || typeof t.totalFrames !== 'number') return { ok: false, reason: 'timeline: malformed' }
  const sum = Object.values(t.sceneWindows).reduce((acc, w) => acc + w.durationInFrames, 0)
  if (sum !== t.totalFrames) return { ok: false, reason: `timeline: Σ durationInFrames ${sum} !== totalFrames ${t.totalFrames}` }
  if (Array.isArray(t.diagnostics) && t.diagnostics.length > 0) return { ok: false, reason: `timeline: ${t.diagnostics.length} diagnostics present` }
  return { ok: true, sourceHash: doc!.header.sourceHash }
}

export function validateVisual(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.visual.stageInputs
  if (!stageInputs) return { ok: false, reason: 'visual: never ran' }
  const doc = readJsonArtifact<unknown>(path.join(runDir, 'project.dsl.json'))
  const chain = checkChain(doc, upstream, stageInputs, manifest, 'visual')
  if (chain) return chain
  try {
    parseProjectDsl(doc!.payload)
  } catch (err) {
    return { ok: false, reason: `visual: parseProjectDsl — ${err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)}` }
  }
  return { ok: true, sourceHash: doc!.header.sourceHash }
}

export function validateCompiled(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.compile.stageInputs
  if (!stageInputs) return { ok: false, reason: 'compile: never ran' }
  const dslDoc = readJsonArtifact<{ scenes: { sceneId: string }[] }>(path.join(runDir, 'project.dsl.json'))
  if (!dslDoc) return { ok: false, reason: 'compile: project.dsl.json missing' }
  const dir = path.join(runDir, 'compiled')
  if (!fs.existsSync(dir)) return { ok: false, reason: 'compile: compiled/ missing' }
  const entries: { sceneId: string; compiledHash: string }[] = []
  for (const scene of dslDoc.payload.scenes) {
    const doc = readJsonArtifact<{ provenance?: { compiledHash?: string } }>(path.join(dir, `${scene.sceneId}.json`))
    if (!doc) return { ok: false, reason: `compile: ${scene.sceneId}.json missing/corrupt` }
    const recomputed = computeCompiledHash(doc.payload as never)
    if (doc.payload.provenance?.compiledHash !== recomputed) return { ok: false, reason: `compile: ${scene.sceneId} compiledHash mismatch` }
    entries.push({ sceneId: scene.sceneId, compiledHash: recomputed })
  }
  const expected = stageSourceHash({ upstream, stageInputs, payload: entries })
  if (manifest.stages.compile.sourceHash !== undefined && manifest.stages.compile.sourceHash !== expected) {
    return { ok: false, reason: 'compile: manifest chain mismatch' }
  }
  // recompute against the artifact payload list (the doc we just rebuilt)
  const stored = path.join(dir, `${dslDoc.payload.scenes[0]?.sceneId}.json`)
  const firstHeader = readJsonArtifact(stored)
  if (firstHeader && firstHeader.header.sourceHash !== expected) return { ok: false, reason: 'compile: scene header chain mismatch' }
  return { ok: true, sourceHash: expected }
}

export function validateRenderProps(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.renderProps.stageInputs
  if (!stageInputs) return { ok: false, reason: 'renderProps: never ran' }
  const doc = readJsonArtifact<unknown>(path.join(runDir, 'render-props.json'))
  const chain = checkChain(doc, upstream, stageInputs, manifest, 'renderProps')
  if (chain) return chain
  return { ok: true, sourceHash: doc!.header.sourceHash }
}

/** Spec §7.4 video row: exists + non-empty + manifest.render.sourceHash === current props hash. Never hashes the MP4. */
export function validateVideo(runDir: string, propsSourceHash: string): StageValidation {
  const manifest = readManifest(runDir)
  if (!manifest?.render) return { ok: false, reason: 'render: manifest.render absent (never rendered)' }
  if (manifest.render.sourceHash !== propsSourceHash) return { ok: false, reason: 'render: STALE — manifest.render.sourceHash ≠ render-props sourceHash' }
  const video = path.join(runDir, 'video.mp4')
  const stat = fs.existsSync(video) ? fs.statSync(video) : null
  if (!stat || stat.size === 0) return { ok: false, reason: 'render: video.mp4 missing or empty' }
  return { ok: true, sourceHash: propsSourceHash }
}
