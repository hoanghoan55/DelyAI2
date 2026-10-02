import type { Diagnostic } from '@/timeline/diagnostics'
import type { CompiledScene } from '@/video-engine/ir'
import { hasComposition, resolveComposition } from '@/video-engine/registry'

/**
 * Layer 4 — geometry. Every slot rect must be a real, in-frame rectangle, and
 * slot rects must not overlap each other.
 *
 * The composition's own `layout` is queried with the scene's declared slots and
 * render size — the same call the runtime makes — so this checks the geometry
 * that will actually be rendered, not a re-derivation of it.
 *
 * Total: a missing/`null` scene, a missing `composition`/`render`, or an
 * unknown composition is skipped rather than thrown on (the layouts destructure
 * `args.render`, so an absent render must be guarded before calling `layout`).
 */
export function checkGeometry(scenes: CompiledScene[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const scene of scenes ?? []) {
    if (!scene?.composition || !scene.render || !hasComposition(scene.composition.id)) continue
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
    // Pairwise overlap. Strict inequality so slots that merely share an edge
    // (split/grid/media-text tile exactly) are NOT flagged — only a genuine
    // area intersection is an "overlap sai" per spec §9.
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!
        const b = rects[j]!
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
          diagnostics.push({
            severity: 'error',
            code: 'QA_SLOT_OVERLAP',
            sceneId: scene.sceneId,
            message: `Slots "${a.slot}" and "${b.slot}" overlap.`,
          })
        }
      }
    }
  }
  return diagnostics
}
