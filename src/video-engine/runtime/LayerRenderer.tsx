import React from 'react'
import { getRendererBackend } from '@/video-engine/registry'
import type { CompiledLayer, RenderSettings } from '@/video-engine/ir'

export type LayerRendererProps = { layer: CompiledLayer; absoluteFrame: number; render: RenderSettings; seed: number }

/**
 * Dispatches an IR layer to the renderer backend registered for layer.renderer.
 * The runtime knows nothing about Canvas or Three beyond this lookup.
 */
export const LayerRenderer: React.FC<LayerRendererProps> = (props) => {
  const Backend = getRendererBackend(props.layer.renderer) as React.FC<LayerRendererProps>
  return <Backend {...props} />
}
