import type { RendererKind } from '@/video-engine/schema'
import type { CompiledLayer, RenderSettings } from '@/video-engine/ir'

export type RendererBackendProps = {
  layer: CompiledLayer
  /** Absolute master-timeline frame for the current render tick. */
  absoluteFrame: number
  render: RenderSettings
  seed: number
}

export type RendererBackend = (props: RendererBackendProps) => unknown

const backends = new Map<RendererKind, RendererBackend>()

export function registerRendererBackend(kind: RendererKind, backend: RendererBackend): void {
  backends.set(kind, backend)
}
export function getRendererBackend(kind: RendererKind): RendererBackend {
  const b = backends.get(kind)
  if (!b) throw new Error(`No renderer backend registered for "${kind}"`)
  return b
}
/** Non-throwing probe, used by QA layer 5 to report a missing backend as a diagnostic. */
export const hasRendererBackend = (kind: RendererKind): boolean => backends.has(kind)
export function clearRendererBackends(): void {
  backends.clear()
}