import type { CompositionId, JsonObject, RendererKind } from '@/video-engine/schema'
import type { Diagnostic } from '@/timeline/diagnostics'

export type LayerFrameWindow = { from: number; durationInFrames: number }
export type SceneTiming = { startFrame: number; durationInFrames: number }
export type RenderSettings = { fps: number; width: number; height: number }

export type AssetRef = { id: string; version?: string; contentHash?: string }

export type CompiledMotion = {
  recipeId: string
  recipeVersion: string
  frameWindow: LayerFrameWindow
  params: JsonObject
}

export type CompiledLayer = {
  id: string
  layerKind: 'visual' | 'effect' | 'text' | 'media'
  recipeId: string
  recipeVersion: string
  renderer: RendererKind
  slot: string
  frameWindow: LayerFrameWindow
  /** Defaults already applied by the compiler; runtime must not resolve defaults. */
  params: JsonObject
  motion: CompiledMotion[]
  zIndex: number
  assetRefs: AssetRef[]
  backdrop?: boolean
}

export type CompiledTypography = {
  text: string
  animation: 'none' | 'fade' | 'reveal' | 'typewriter' | 'word-by-word'
  slot: string
  frameWindow: LayerFrameWindow
}

export type CompiledEvent = { atFrame: number; kind: string; payload: JsonObject }
export type CompiledAudioCue = { atFrame: number; durationInFrames: number; cue: JsonObject }

export type Provenance = { engineVersion: string; sourceHash: string; compiledHash: string }

export type CompiledScene = {
  irVersion: '0.1'
  sceneId: string
  seed: number
  render: RenderSettings
  timing: SceneTiming
  composition: { id: CompositionId; slots: string[] }
  layers: CompiledLayer[]
  typography: CompiledTypography | null
  events: CompiledEvent[]
  audio: CompiledAudioCue[]
  diagnostics: Diagnostic[]
  provenance: Provenance
}
