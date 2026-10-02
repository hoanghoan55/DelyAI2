import { registerCompositions } from '@/video-engine/compositions/register'

/**
 * Metadata-only registration entry point. Renderer implementations are wired
 * separately in runtime/register-backends.ts so compiler and registry
 * metadata tests never load Canvas or Three.
 */
export function registerMetadata(): void {
  registerCompositions()
}
export { registerCompositions }