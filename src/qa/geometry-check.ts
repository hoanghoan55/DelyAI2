import type { Diagnostic } from '@/timeline/diagnostics'
import type { CompiledScene } from '@/video-engine/ir'
import { hasComposition, resolveComposition } from '@/video-engine/registry'

/**
 * Layer 4 — geometry. Every slot rect must be a real, in-frame rectangle.
 *
 * The composition's own `layout` is queried with the scene's declared slots and
 * render size — the same call the runtime makes — so this checks the geometry
 * that will actually be rendered, not a re-derivation of it.
 */
export function checkGeometry(scenes: CompiledScene[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const scene of scenes) {
    if (!hasComposition(scene.composition.id)) continue
    const rects = resolveComposition(scene.composition.id).layout({
      slots: scene.composition.slots,
      render: scene.render,
      style: {},
    })
    for (const rect of rects) {
      if (!(rect.width > 0) || !(rect.height > 0)) {
        diagnostics.push({
          severity: 'error',
          code: 'QA_SLOT_DEGENERATE',
          sceneId: scene.sceneId,
          message: `Slot "${rect.slot}" has a non-positive size (${rect.width}x${rect.height}).`,
        })
      }
      if (
        rect.x < 0 ||
        rect.y < 0 ||
        rect.x + rect.width > scene.render.width ||
        rect.y + rect.height > scene.render.height
      ) {
        diagnostics.push({
          severity: 'error',
          code: 'QA_SLOT_OUT_OF_FRAME',
          sceneId: scene.sceneId,
          message: `Slot "${rect.slot}" rect [${rect.x}, ${rect.y}, ${rect.width}, ${rect.height}] leaves the ${scene.render.width}x${scene.render.height} frame.`,
        })
      }
    }
  }
  return diagnostics
}
