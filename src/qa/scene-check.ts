import type { Diagnostic } from '@/timeline/diagnostics'
import type { CompiledScene } from '@/video-engine/ir'
import { hasComposition, hasVisual, resolveComposition } from '@/video-engine/registry'

/**
 * Layer 3 — scene. Registry membership (composition, visual recipe), slot
 * membership against the composition's declared slots, and layer frame windows
 * against the scene length. Every diagnostic names the scene and, where one is
 * implicated, the layer.
 */
export function checkScenes(scenes: CompiledScene[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const scene of scenes) {
    if (!hasComposition(scene.composition.id)) {
      diagnostics.push({
        severity: 'error',
        code: 'QA_UNKNOWN_COMPOSITION',
        sceneId: scene.sceneId,
        message: `Unknown composition "${scene.composition.id}".`,
      })
      continue
    }
    const declared = new Set(resolveComposition(scene.composition.id).slots.map((s) => s.id))
    for (const layer of scene.layers) {
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
          message: `Layer "${layer.id}" targets slot "${layer.slot}", which composition "${scene.composition.id}" does not declare.`,
        })
      }
      const last = layer.frameWindow.from + layer.frameWindow.durationInFrames
      if (layer.frameWindow.from < 0 || last > scene.timing.durationInFrames) {
        diagnostics.push({
          severity: 'error',
          code: 'QA_LAYER_OUT_OF_SCENE',
          sceneId: scene.sceneId,
          layerId: layer.id,
          message: `Layer "${layer.id}" window [${layer.frameWindow.from}, ${last}) exceeds the ${scene.timing.durationInFrames}-frame scene.`,
        })
      }
    }
  }
  return diagnostics
}
