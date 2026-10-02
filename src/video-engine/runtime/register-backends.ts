import { clearRegistry, clearRendererBackends, registerRendererBackend } from '@/video-engine/registry'
import { registerMetadata } from '@/video-engine/registry/register'
import { registerCanvasRecipes, clearCanvasRecipes, Canvas2DBackend } from '@/video-engine/canvas'
import { registerThreeRecipes, clearThreeRecipes, ThreeBackend } from '@/video-engine/three'
import { registerMotionRecipes, clearMotionRecipes } from '@/video-engine/motion'
import { DomBackend } from './DomBackend'

/**
 * Resets every registry this engine actually wires: the metadata registry
 * (visual/motion/composition), the renderer-backend registry, and the sibling
 * implementation registries for canvas2d, three, and motion. Tests call this in
 * `beforeEach` so one test's registrations never leak into the next.
 */
export function clearRegistered(): void {
  clearRegistry()
  clearRendererBackends()
  clearCanvasRecipes()
  clearThreeRecipes()
  clearMotionRecipes()
}

/**
 * Full registration used by the Remotion entry point and the app. Metadata
 * registration is separate so compiler/metadata tests stay renderer-free.
 */
export function registerBackends(): void {
  registerMetadata()
  registerCanvasRecipes()
  registerThreeRecipes()
  registerMotionRecipes()
  registerRendererBackend('dom', DomBackend as unknown as (p: unknown) => unknown)
  registerRendererBackend('canvas2d', Canvas2DBackend as unknown as (p: unknown) => unknown)
  registerRendererBackend('three', ThreeBackend as unknown as (p: unknown) => unknown)
}
