import type { Diagnostic } from '@/timeline/diagnostics'
import type { CompiledScene } from '@/video-engine/ir'
import { hasComposition, hasVisual, resolveComposition } from '@/video-engine/registry'

/**
 * Layer 3 — scene. Registry membership (composition, visual recipe), slot
 * membership against the composition's declared slots, and layer frame windows
 * against the scene length. Every diagnostic names the scene and, where one is
 * implicated, the layer.
 *
 * Total: a missing/`null` scene, a missing `composition`, a null layer, or a
 * missing layer `frameWindow` is reported as a diagnostic rather than throwing —
 * this is the layer you run *because* you suspect the input is malformed.
 */
export function checkScenes(scenes: CompiledScene[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const scene of scenes ?? []) {
    if (!scene) {
      diagnostics.push({
        severity: 'error',
        code: 'QA_INVALID_SCENE',
        message: 'Encountered a null or missing scene entry.',
      })
      continue
    }
    const composition = scene.composition
    if (!composition || !hasComposition(composition.id)) {
      diagnostics.push({
        severity: 'error',
        code: 'QA_UNKNOWN_COMPOSITION',
        sceneId: scene.sceneId,
        message: `Unknown composition "${composition?.id}".`,
      })
      continue
    }
    const declared = new Set(resolveComposition(composition.id).slots.map((s) => s.id))
    for (const layer of scene.layers ?? []) {
      if (!layer) {
        diagnostics.push({
          severity: 'error',
          code: 'QA_INVALID_LAYER',
          sceneId: scene.sceneId,
          message: `Scene "${scene.sceneId}" has a null or missing layer entry.`,
        })
        continue
      }
      if (!hasVisual(layer.recipeId)) {
        diagnostics.push({
          severity: 'error',
          code: 'QA_UNKNOWN_RECIPE',
          sceneId: scene.sceneId,
          layerId: layer.id,
          message: `Layer "${layer.id}" uses unregistered visual recipe "${layer.recipeId}".`,
        })
      }
      if (!declared.has(layer.slot)) {
        diagnostics.push({
          severity: 'error',
          code: 'QA_UNKNOWN_SLOT',
          sceneId: scene.sceneId,
          layerId: layer.id,
          message: `Layer "${layer.id}" targets slot "${layer.slot}", which composition "${composition.id}" does not declare.`,
        })
      }
      const frameWindow = layer.frameWindow
      if (!frameWindow) {
        diagnostics.push({
          severity: 'error',
          code: 'QA_INVALID_LAYER_WINDOW',
          sceneId: scene.sceneId,
          layerId: layer.id,
          message: `Layer "${layer.id}" has no frame window.`,
        })
        continue
      }
      const last = frameWindow.from + frameWindow.durationInFrames
      const sceneFrames = scene.timing?.durationInFrames
      const startsBeforeScene = frameWindow.from < 0
      const endsAfterScene = typeof sceneFrames === 'number' && last > sceneFrames
      if (startsBeforeScene || endsAfterScene) {
        diagnostics.push({
          severity: 'error',
          code: 'QA_LAYER_OUT_OF_SCENE',
          sceneId: scene.sceneId,
          layerId: layer.id,
          message: `Layer "${layer.id}" window [${frameWindow.from}, ${last}) exceeds the ${sceneFrames}-frame scene.`,
        })
      }
    }
  }
  return diagnostics
}
