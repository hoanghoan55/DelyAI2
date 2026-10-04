import { secondsToFrames } from '@/timeline/convert'
import type { Diagnostic } from '@/timeline/diagnostics'
import type { MasterTimeline } from '@/timeline/master'
import { hasComposition, hasMotion, hasVisual, listAvailable, resolveComposition, resolveMotion, resolveVisual } from '@/video-engine/registry'
import { ENGINE_VERSION, IR_VERSION } from '@/video-engine/version'
import { computeCompiledHash } from '@/video-engine/ir/hash'
import type { AssetRef, CompiledAudioCue, CompiledEvent, CompiledLayer, CompiledScene, CompiledTypography } from '@/video-engine/ir/types'
import type { SceneDSL } from '@/video-engine/schema'
import { CompilerError } from './errors'
import { computeSourceHash, resolveParams } from './params'

export type CompileSceneInput = { dsl: SceneDSL; timeline: MasterTimeline; assets?: AssetRef[] }

const err = (code: string, message: string, sceneId: string): Diagnostic => ({ severity: 'error', code, message, sceneId })

/**
 * Every frame in the IR must be an integer. `secondsToFrames` rounds, but a
 * non-finite seconds value (NaN/Infinity) would round to NaN and silently poison
 * the hash. Fail loudly instead of emitting a non-integer frame (Review Focus #1).
 */
function assertFrames(frame: number, sceneId: string, context: string): void {
  if (!Number.isInteger(frame)) {
    throw new CompilerError(`Non-integer frame computed for ${context}`, [
      err('NON_FINITE_FRAME', `Invalid frame value ${frame} computed for ${context}; frame counts must be finite integers.`, sceneId),
    ])
  }
}

export function compileScene(input: CompileSceneInput): CompiledScene {
  const { dsl, timeline } = input
  const assets = input.assets ?? []
  const diagnostics: Diagnostic[] = []

  // 1. Semantic validation — known composition / recipes.
  // AI-facing diagnostics name the valid ids so a corrective retry can
  // self-correct (mirror of the registry's resolve* messages).
  const available = listAvailable()
  const knownIds = (rows: { id: string }[]) => rows.map((r) => r.id).join(', ') || '(none)'
  if (!hasComposition(dsl.composition)) {
    const message = `Unknown composition "${dsl.composition}". Known: ${knownIds(available.composition)}`
    throw new CompilerError(message, [err('UNKNOWN_COMPOSITION', message, dsl.sceneId)])
  }
  for (const v of dsl.visual) {
    if (!hasVisual(v.recipe)) {
      const message = `Unknown visual recipe "${v.recipe}". Known: ${knownIds(available.visual)}`
      throw new CompilerError(message, [err('UNKNOWN_VISUAL_RECIPE', message, dsl.sceneId)])
    }
  }
  for (const m of dsl.motion) {
    if (!hasMotion(m.recipe)) {
      const message = `Unknown motion recipe "${m.recipe}". Known: ${knownIds(available.motion)}`
      throw new CompilerError(message, [err('UNKNOWN_MOTION_RECIPE', message, dsl.sceneId)])
    }
  }

  // 2. Timeline binding — the master timeline owns timing; never recompute it here.
  const window = timeline.sceneWindows[dsl.sceneId]
  if (!window) {
    throw new CompilerError(`Scene "${dsl.sceneId}" has no timeline window`, [err('MISSING_SCENE_WINDOW', `No timeline window for scene "${dsl.sceneId}".`, dsl.sceneId)])
  }
  const declaredFrames = secondsToFrames(dsl.duration, timeline.fps)
  if (declaredFrames !== window.durationInFrames) {
    throw new CompilerError(`Scene "${dsl.sceneId}" duration mismatch`, [
      err('DURATION_MISMATCH', `DSL duration ${dsl.duration}s -> ${declaredFrames} frames, but the timeline window is ${window.durationInFrames} frames.`, dsl.sceneId),
    ])
  }
  // The window is the authority for the scene length; guard it so a bad frame
  // count can never become a non-integer layer window below.
  assertFrames(window.durationInFrames, dsl.sceneId, `scene "${dsl.sceneId}" window`)

  const composition = resolveComposition(dsl.composition)
  const declaredSlots = new Set(composition.slots.map((s) => s.id))
  const sceneDuration = window.durationInFrames
  const layers: CompiledLayer[] = []
  let z = 0

  // The optional `backdropRenderer` hint is recorded as scene data only. Phase 0
  // registers no "backdrop" recipe, so inventing a layer for it would reference a
  // recipe that does not exist. A later phase can resolve it against the registry.

  for (const [i, v] of dsl.visual.entries()) {
    if (v.slot !== undefined && !declaredSlots.has(v.slot)) {
      throw new CompilerError(`Unknown slot "${v.slot}" in composition "${composition.id}"`, [
        err('UNKNOWN_SLOT', `Layer "${v.id ?? i}" targets slot "${v.slot}", which composition "${composition.id}" does not declare (has: ${[...declaredSlots].join(', ')}).`, dsl.sceneId),
      ])
    }
    const recipe = resolveVisual(v.recipe)
    const slot = v.slot ?? composition.slots[Math.min(i, composition.slots.length - 1)]!.id
    layers.push({
      id: v.id ?? `${dsl.sceneId}-visual-${i}`, layerKind: 'visual', recipeId: recipe.id, recipeVersion: recipe.version,
      renderer: recipe.renderer, slot, frameWindow: { from: 0, durationInFrames: sceneDuration },
      params: resolveParams(v.recipe, v.params, 'visual', dsl.sceneId), motion: [], zIndex: z++, assetRefs: [],
    })
  }

  // Compile motion specs once, then attach each to the layer whose id it targets.
  for (const m of dsl.motion) {
    const recipe = resolveMotion(m.recipe)
    if (!m.target) {
      diagnostics.push({ severity: 'warning', code: 'MOTION_WITHOUT_TARGET', sceneId: dsl.sceneId, message: `Motion "${m.recipe}" has no target; it was not applied.` })
      continue
    }
    const target = layers.find((l) => l.id === m.target)
    if (!target) {
      diagnostics.push({ severity: 'error', code: 'MOTION_UNKNOWN_TARGET', sceneId: dsl.sceneId, message: `Motion "${m.recipe}" targets unknown layer "${m.target}".` })
      continue
    }
    if (target.motion.length > 0) {
      diagnostics.push({ severity: 'error', code: 'MOTION_MULTIPLE_PER_LAYER', sceneId: dsl.sceneId, layerId: target.id, message: `Layer "${target.id}" already has a motion; Phase 0 allows one motion per layer.` })
      continue
    }
    target.motion.push({
      recipeId: recipe.id, recipeVersion: recipe.version,
      frameWindow: { from: 0, durationInFrames: sceneDuration },
      params: resolveParams(m.recipe, m.params, 'motion', dsl.sceneId),
    })
  }

  let typography: CompiledTypography | null = null
  if (dsl.typography) {
    const from = dsl.typography.startSeconds === undefined ? 0 : secondsToFrames(dsl.typography.startSeconds, timeline.fps)
    const durationInFrames = dsl.typography.durationSeconds === undefined
      ? sceneDuration - from
      : secondsToFrames(dsl.typography.durationSeconds, timeline.fps)
    if (from >= sceneDuration) {
      diagnostics.push({ severity: 'error', code: 'TYPOGRAPHY_OUT_OF_WINDOW', sceneId: dsl.sceneId, message: `Typography starts at frame ${from}, outside the ${sceneDuration}-frame scene.` })
    } else {
      const windowed = { from, durationInFrames: Math.min(durationInFrames, sceneDuration - from) }
      assertFrames(windowed.from, dsl.sceneId, 'typography start')
      assertFrames(windowed.durationInFrames, dsl.sceneId, 'typography duration')
      typography = {
        text: dsl.typography.text, animation: dsl.typography.animation,
        slot: dsl.typography.slot ?? composition.slots[0]!.id,
        frameWindow: windowed,
      }
    }
  }

  const events: CompiledEvent[] = dsl.events.map((e) => ({ atFrame: secondsToFrames(e.at, timeline.fps), kind: e.kind, payload: e.payload }))
  const audio: CompiledAudioCue[] = dsl.audio.map((a) => ({ atFrame: secondsToFrames(a.at, timeline.fps), durationInFrames: 0, cue: a.params }))
  for (const e of events) assertFrames(e.atFrame, dsl.sceneId, 'event')
  for (const a of audio) assertFrames(a.atFrame, dsl.sceneId, 'audio cue')
  layers.sort((a, b) => a.zIndex - b.zIndex)

  const base: CompiledScene = {
    irVersion: IR_VERSION, sceneId: dsl.sceneId, seed: dsl.seed,
    render: { fps: timeline.fps, width: timeline.width, height: timeline.height },
    timing: { startFrame: window.startFrame, durationInFrames: window.durationInFrames },
    composition: { id: composition.id, slots: composition.slots.map((s) => s.id) },
    layers, typography, events, audio, diagnostics,
    provenance: { engineVersion: ENGINE_VERSION, sourceHash: computeSourceHash(dsl, assets), compiledHash: '' },
  }
  const compiledHash = computeCompiledHash(base)
  return { ...base, provenance: { ...base.provenance, compiledHash } }
}
