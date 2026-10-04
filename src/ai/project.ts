import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'
import type { Diagnostic } from '@/timeline/diagnostics'
import type { VoiceTimeline } from '@/timeline/voice'
import { parseProjectDsl, type ProjectDsl, type SceneDSL } from '@/video-engine/schema'
import { compileScene, CompilerError } from '@/video-engine/compiler'
import { buildMasterTimeline } from '@/timeline/master'
import { demoProjectDsl } from './demo-project.dsl'

// R22: the composition root is the sole ai/** module allowed to reach the IR —
// re-exported here so artifacts.ts can verify compiled hashes without importing video-engine/ir.
export { computeCompiledHash } from '@/video-engine/ir'

export type FixtureProject = { dsl: ProjectDsl; compiledScenes: CompiledScene[]; timeline: MasterTimeline }

/**
 * Composition root: parse → timeline → compile. This is the ONLY module in
 * `src/ai/**` allowed to import the compiler (AGENTS.md sanctioned exception).
 * `generate.ts` and the Visual Director's retry reach the compiler only through
 * `buildProject` / `diagnoseScenes` — the exception is not widened.
 */
export function buildProject(input: { dsl: ProjectDsl; voice?: VoiceTimeline | null }): FixtureProject {
  const parsed = parseProjectDsl(input.dsl)
  const timeline = buildMasterTimeline({
    fps: parsed.render.fps,
    width: parsed.render.width,
    height: parsed.render.height,
    voiceScenePolicy: parsed.voiceScenePolicy,
    voice: input.voice ?? null,
    music: null,
    scenes: parsed.scenes.map((s) => ({ sceneId: s.sceneId, duration: s.duration })),
  })
  const compiledScenes = parsed.scenes.map((scene) => compileScene({ dsl: scene, timeline, assets: [] }))
  return { dsl: parsed, compiledScenes, timeline }
}

/** Phase 0 entry point — unchanged behavior, now a delegate. */
export function buildFixtureProject(input: ProjectDsl = demoProjectDsl): FixtureProject {
  return buildProject({ dsl: input, voice: null })
}

/**
 * Compiles scenes against a LOCKED timeline purely to harvest diagnostics —
 * used by the Visual Director's bounded retry (spec §4 rule 2). Never throws;
 * a CompilerError becomes its diagnostics array.
 */
export function diagnoseScenes(scenes: SceneDSL[], timeline: MasterTimeline): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const scene of scenes) {
    try {
      compileScene({ dsl: scene, timeline, assets: [] })
    } catch (err) {
      if (err instanceof CompilerError) diagnostics.push(...err.diagnostics)
      else diagnostics.push({ severity: 'error', code: 'COMPILE_THROW', sceneId: scene.sceneId, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return diagnostics
}
