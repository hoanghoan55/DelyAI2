import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'
import { parseProjectDsl, type ProjectDsl } from '@/video-engine/schema'
import { compileScene } from '@/video-engine/compiler'
import { buildMasterTimeline } from '@/timeline/master'
import { demoProjectDsl } from './demo-project.dsl'

export type FixtureProject = { dsl: ProjectDsl; compiledScenes: CompiledScene[]; timeline: MasterTimeline }

/**
 * Composition root for the Phase 0 demo: parse → timeline → compile.
 *
 * This is the ONLY module in `src/ai/**` allowed to import the compiler. It is
 * the composition root, not a director — directors produce DSL and stop there.
 */
export function buildFixtureProject(input: ProjectDsl = demoProjectDsl): FixtureProject {
  const parsed = parseProjectDsl(input)
  const timeline = buildMasterTimeline({
    fps: parsed.render.fps,
    width: parsed.render.width,
    height: parsed.render.height,
    voiceScenePolicy: parsed.voiceScenePolicy,
    voice: null,
    music: null,
    scenes: parsed.scenes.map((s) => ({ sceneId: s.sceneId, duration: s.duration })),
  })
  const compiledScenes = parsed.scenes.map((scene) => compileScene({ dsl: scene, timeline, assets: [] }))
  return { dsl: parsed, compiledScenes, timeline }
}
