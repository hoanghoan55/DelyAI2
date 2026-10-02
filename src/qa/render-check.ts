import type { Diagnostic } from '@/timeline/diagnostics'
import type { CompiledLayer } from '@/video-engine/ir'
import { hasRendererBackend } from '@/video-engine/registry'

/**
 * Layer 5 — render. Every layer's renderer must have a registered backend at
 * render time. This is the check that catches a recipe whose renderer kind was
 * never wired up (metadata-only registration deliberately fails it).
 *
 * Uses the non-throwing `hasRendererBackend` probe, so a missing backend is
 * reported as a diagnostic rather than thrown.
 *
 * Total: a missing/`null` layer list or a `null` layer entry is skipped/reported
 * rather than throwing.
 */
export function checkRender(layers: CompiledLayer[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const layer of layers ?? []) {
    if (!layer) {
      diagnostics.push({
        severity: 'error',
        code: 'QA_INVALID_LAYER',
        message: 'Encountered a null or missing layer entry.',
      })
      continue
    }
    if (!hasRendererBackend(layer.renderer)) {
      diagnostics.push({
        severity: 'error',
        code: 'RENDERER_BACKEND_MISSING',
        layerId: layer.id,
        message: `No renderer backend registered for "${layer.renderer}" (layer "${layer.id}").`,
      })
    }
  }
  return diagnostics
}
