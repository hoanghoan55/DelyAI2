import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  briefHash, stageSourceHash, writeJsonArtifact, readJsonArtifact,
  readManifest, writeManifest, createManifest,
  validateStory, validateVoice, validateTimeline, validateVisual, validateCompiled, validateRenderProps, validateVideo,
} from '@/ai/artifacts'
import { demoProjectDsl } from '@/ai/demo-project.dsl'
import { buildFixtureProject } from '@/ai/project'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import { ENGINE_VERSION } from '@/video-engine/version'
import type { Manifest } from '@/ai/artifacts'
import type { Brief, StoryPlan } from '@/ai/story/contract'

let runDir: string
beforeEach(() => { clearRegistered(); registerBackends(); runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delyai-art-')) })
afterEach(() => fs.rmSync(runDir, { recursive: true, force: true }))

const BRIEF: Brief = { topic: 'x', targetSeconds: 10, language: 'vi' }
const STORY: StoryPlan = {
  title: 'T',
  scenes: [{ id: 'scene-001', purpose: 'hook', durationSeconds: 5, title: 'a', narration: 'b' }],
}
const UPSTREAM = 'u'.repeat(64)

function manifest(): Manifest {
  return createManifest({
    runId: 'run-1', brief: BRIEF, briefHash: briefHash(BRIEF), paddingSeconds: 0.5,
    storyPromptVersion: 'story-prompt-1', visualPromptVersion: 'visual-prompt-1', asrModel: 'medium', voiceId: 'v1',
  })
}

describe('hash chain (spec §7.3)', () => {
  it('briefHash is stable and payload-sensitive', () => {
    expect(briefHash(BRIEF)).toBe(briefHash({ ...BRIEF }))
    expect(briefHash(BRIEF)).not.toBe(briefHash({ ...BRIEF, topic: 'y' }))
  })

  it('stageSourceHash depends on upstream AND payload — mutating the payload invalidates the stage', () => {
    const a = stageSourceHash({ upstream: UPSTREAM, stageInputs: { p: 1 }, payload: { v: 1 } })
    const b = stageSourceHash({ upstream: UPSTREAM, stageInputs: { p: 1 }, payload: { v: 2 } })
    const c = stageSourceHash({ upstream: 'other', stageInputs: { p: 1 }, payload: { v: 1 } })
    const d = stageSourceHash({ upstream: UPSTREAM, stageInputs: { p: 2 }, payload: { v: 1 } })
    expect(new Set([a, b, c, d]).size).toBe(4)
  })

  it('mutating the brief invalidates every downstream hop, and nothing else (spec §9.2)', () => {
    const build = (b: Brief) => {
      const h0 = briefHash(b)
      const h1 = stageSourceHash({ upstream: h0, stageInputs: { promptVersion: 's1' }, payload: STORY })
      const h2 = stageSourceHash({ upstream: h1, stageInputs: { paddingSeconds: 0.5 }, payload: { totalMs: 1 } })
      const h3 = stageSourceHash({ upstream: h2, stageInputs: { seed: 1 }, payload: { scenes: [] } })
      return { h0, h1, h2, h3 }
    }
    const original = build(BRIEF)
    const mutated = build({ ...BRIEF, topic: 'CHANGED' })
    expect(mutated.h0).not.toBe(original.h0)
    expect(mutated.h1).not.toBe(original.h1)
    expect(mutated.h2).not.toBe(original.h2)
    expect(mutated.h3).not.toBe(original.h3)
    // same payload at every hop — the ONLY difference is the propagated upstream hash
    const h1SamePayload = stageSourceHash({ upstream: mutated.h0, stageInputs: { promptVersion: 's1' }, payload: STORY })
    expect(h1SamePayload).toBe(mutated.h1)
    expect(h1SamePayload).not.toBe(original.h1)
  })
})

describe('read/write', () => {
  it('round-trips header + payload; returns null on missing or corrupt', () => {
    const file = path.join(runDir, 'story.json')
    expect(readJsonArtifact(file)).toBeNull()
    writeJsonArtifact(file, { schemaVersion: 'story-1', runId: 'run-1', sourceHash: 'abc' }, STORY)
    const back = readJsonArtifact<StoryPlan>(file)
    expect(back?.payload).toEqual(STORY)
    expect(back?.header.sourceHash).toBe('abc')
    expect(back?.header.runId).toBe('run-1')
    expect(typeof back?.header.createdAt).toBe('string')
    fs.writeFileSync(file, '{not json')
    expect(readJsonArtifact(file)).toBeNull()
    fs.writeFileSync(file, '"just a string"')
    expect(readJsonArtifact(file)).toBeNull()
  })

  it('manifest round-trips', () => {
    const m = manifest()
    expect(readManifest(runDir)).toBeNull()
    writeManifest(runDir, m)
    expect(readManifest(runDir)).toEqual(m)
    fs.writeFileSync(path.join(runDir, 'manifest.json'), 'garbage')
    expect(readManifest(runDir)).toBeNull()
  })
})

describe('stage validators (spec §7.4)', () => {
  it('story: valid payload + chain → ok; garbage payload → not ok; wrong chain → not ok', () => {
    const m = manifest()
    m.stages.story.stageInputs = { promptVersion: 'story-prompt-1' }
    const h = stageSourceHash({ upstream: briefHash(BRIEF), stageInputs: m.stages.story.stageInputs, payload: STORY })
    m.stages.story.sourceHash = h
    writeJsonArtifact(path.join(runDir, 'story.json'), { schemaVersion: 'story-1', runId: 'run-1', sourceHash: h }, STORY)
    expect(validateStory(runDir, briefHash(BRIEF), m)).toEqual({ ok: true, sourceHash: h })

    fs.writeFileSync(path.join(runDir, 'story.json'), '{"schemaVersion":"x","runId":"y","createdAt":"z","sourceHash":"abc","payload":{"nope":1}}')
    expect(validateStory(runDir, briefHash(BRIEF), m).ok).toBe(false) // sourceHash no longer covers this payload → chain mismatch

    writeJsonArtifact(path.join(runDir, 'story.json'), { schemaVersion: 'story-1', runId: 'run-1', sourceHash: h }, { title: 'T', scenes: [] })
    expect(validateStory(runDir, briefHash(BRIEF), m).ok).toBe(false) // payload edited after hashing → chain mismatch (StoryPlanSchema is the second net)
  })

  it('voice: requires timeline shape AND every referenced mp3 present non-empty', () => {
    const m = manifest()
    m.stages.voice.stageInputs = { tts: { modelId: 'omnivoice', voiceId: 'v1', outputFormat: 'mp3', voiceSettings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 }, normalizeText: false }, asr: { model: 'medium', wordTimestamps: true } }
    const voiceTl = {
      timingSource: 'exact', totalMs: 1000,
      segments: [{ id: 'scene-001-voice', text: 'b', startMs: 0, endMs: 1000, words: [{ word: 'b', startMs: 0, endMs: 900 }], timingSource: 'exact', sceneId: 'scene-001', wordTimingSource: 'whisper' }],
    }
    const h = stageSourceHash({ upstream: UPSTREAM, stageInputs: m.stages.voice.stageInputs, payload: voiceTl })
    m.stages.voice.sourceHash = h
    writeJsonArtifact(path.join(runDir, 'voicetimeline.json'), { schemaVersion: 'voice-1', runId: 'run-1', sourceHash: h }, voiceTl)
    fs.mkdirSync(path.join(runDir, 'voice'), { recursive: true })
    fs.writeFileSync(path.join(runDir, 'voice', 'scene-001.mp3'), 'mp3-bytes')
    expect(validateVoice(runDir, UPSTREAM, m).ok).toBe(true)

    fs.writeFileSync(path.join(runDir, 'voice', 'scene-001.mp3'), '')
    expect(validateVoice(runDir, UPSTREAM, m).ok).toBe(false) // zero-byte mp3
    fs.writeFileSync(path.join(runDir, 'voice', 'scene-001.mp3'), 'mp3-bytes')
    fs.rmSync(path.join(runDir, 'voice', 'scene-001.mp3'))
    expect(validateVoice(runDir, UPSTREAM, m).ok).toBe(false) // missing mp3
  })

  it('timeline: Σ durationInFrames === totalFrames, no diagnostics, chain match', () => {
    const m = manifest()
    const project = buildFixtureProject()
    const good = project.timeline
    m.stages.timeline.stageInputs = { paddingSeconds: 0.5, fps: good.fps, width: good.width, height: good.height, voiceScenePolicy: 'strict' }
    const h = stageSourceHash({ upstream: UPSTREAM, stageInputs: m.stages.timeline.stageInputs, payload: good })
    m.stages.timeline.sourceHash = h
    writeJsonArtifact(path.join(runDir, 'master-timeline.json'), { schemaVersion: 'master-1', runId: 'run-1', sourceHash: h }, good)
    expect(validateTimeline(runDir, UPSTREAM, m).ok).toBe(true)

    const broken = { ...good, totalFrames: good.totalFrames + 1 }
    writeJsonArtifact(path.join(runDir, 'master-timeline.json'), { schemaVersion: 'master-1', runId: 'run-1', sourceHash: h }, broken)
    expect(validateTimeline(runDir, UPSTREAM, m).ok).toBe(false)
  })

  it('visual: parseProjectDsl strict acceptance', () => {
    const m = manifest()
    m.stages.visual.stageInputs = { promptVersion: 'visual-prompt-1', seed: demoProjectDsl.seed, style: demoProjectDsl.style, catalogue: { compositions: ['hero'], visual: [], motion: [] } }
    const h = stageSourceHash({ upstream: UPSTREAM, stageInputs: m.stages.visual.stageInputs, payload: demoProjectDsl })
    m.stages.visual.sourceHash = h
    writeJsonArtifact(path.join(runDir, 'project.dsl.json'), { schemaVersion: 'dsl-1', runId: 'run-1', sourceHash: h }, demoProjectDsl)
    expect(validateVisual(runDir, UPSTREAM, m).ok).toBe(true)

    const bad = { ...demoProjectDsl, scenes: [] } // min(1) violated
    writeJsonArtifact(path.join(runDir, 'project.dsl.json'), { schemaVersion: 'dsl-1', runId: 'run-1', sourceHash: h }, bad)
    expect(validateVisual(runDir, UPSTREAM, m).ok).toBe(false)
  })

  it('compiled: every scene file parses and computeCompiledHash recomputes', () => {
    const m = manifest()
    const project = buildFixtureProject()
    const entries = project.compiledScenes.map((s) => ({ sceneId: s.sceneId, compiledHash: s.provenance.compiledHash }))
    m.stages.compile.stageInputs = { engineVersion: ENGINE_VERSION }
    const h = stageSourceHash({ upstream: UPSTREAM, stageInputs: m.stages.compile.stageInputs, payload: entries })
    m.stages.compile.sourceHash = h
    fs.mkdirSync(path.join(runDir, 'compiled'), { recursive: true })
    for (const scene of project.compiledScenes) {
      writeJsonArtifact(path.join(runDir, 'compiled', `${scene.sceneId}.json`), { schemaVersion: 'ir-1', runId: 'run-1', sourceHash: h }, scene)
    }
    // setup: stage ④'s output must exist — validateCompiled reads scene order from project.dsl.json
    // (the real pipeline always has it: Task 9 writes the dsl before compile runs). Header not under test.
    writeJsonArtifact(path.join(runDir, 'project.dsl.json'), { schemaVersion: 'dsl-1', runId: 'run-1', sourceHash: 'visual-stage' }, project.dsl)
    expect(validateCompiled(runDir, UPSTREAM, m).ok).toBe(true)

    // corrupt one scene's params so the recomputed hash no longer matches its provenance
    // (scene-hero compiles to 0 layers — clearing them would be a no-op; target the first scene WITH layers)
    const victimScene = project.compiledScenes.find((s) => s.layers.length > 0)!
    const victim = path.join(runDir, 'compiled', `${victimScene.sceneId}.json`)
    const doc = JSON.parse(fs.readFileSync(victim, 'utf8')) as { payload: { layers: unknown[] } }
    doc.payload.layers = []
    fs.writeFileSync(victim, JSON.stringify(doc))
    expect(validateCompiled(runDir, UPSTREAM, m).ok).toBe(false)
  })

  it('renderProps + stale video (spec §9.2)', () => {
    const m = manifest()
    const project = buildFixtureProject()
    const props = { scenes: project.compiledScenes, timeline: project.timeline, voice: null, audioSrcBySceneId: {} }
    m.stages.renderProps.stageInputs = { audioSceneIds: [] }
    const h = stageSourceHash({ upstream: UPSTREAM, stageInputs: m.stages.renderProps.stageInputs, payload: props })
    m.stages.renderProps.sourceHash = h
    writeJsonArtifact(path.join(runDir, 'render-props.json'), { schemaVersion: 'render-props-1', runId: 'run-1', sourceHash: h }, props)
    expect(validateRenderProps(runDir, UPSTREAM, m).ok).toBe(true)

    // video: non-empty file + manifest.render.sourceHash === props hash
    fs.writeFileSync(path.join(runDir, 'video.mp4'), 'fake-mp4-bytes')
    expect(validateVideo(runDir, h)).toEqual({ ok: false, reason: expect.stringContaining('manifest') }) // manifest.render not set yet
    m.render = { sourceHash: h, output: 'video.mp4' }
    writeManifest(runDir, m) // setup: validateVideo reads render state from the on-disk manifest
    expect(validateVideo(runDir, h).ok).toBe(true)                                        // fresh
    expect(validateVideo(runDir, 'x'.repeat(64)).ok).toBe(false)                           // STALE — props changed
    fs.writeFileSync(path.join(runDir, 'video.mp4'), '')                                   // empty file
    m.render = { sourceHash: h, output: 'video.mp4' }
    expect(validateVideo(runDir, h).ok).toBe(false)                                        // empty ≠ done
  })
})
