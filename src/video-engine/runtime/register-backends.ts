import { clearRegistry, clearRendererBackends, registerRendererBackend } from '@/video-engine/registry'
import { registerMetadata } from '@/video-engine/registry/register'
import { DomBackend } from './DomBackend'

/**
 * Wipes every registry and backend registry. Tests call this in `beforeEach`
 * so one test's registrations never leak into the next. Tasks 9–11 append
 * their own recipe-registry clears here (canvas2d, three, motion).
 */
export function clearRegistered(): void {
  clearRegistry()
  clearRendererBackends()
}

/**
 * Full registration used by the Remotion entry point and the app. Metadata
 * registration is separate so compiler/metadata tests stay renderer-free.
 * Tasks 9–10 add the canvas2d and three backends here.
 */
export function registerBackends(): void {
  registerMetadata()
  registerRendererBackend('dom', DomBackend as unknown as (p: unknown) => unknown)
}
