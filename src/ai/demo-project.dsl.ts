import type { ProjectDsl } from '@/video-engine/schema'
import { FIXTURE_SCENES } from './visual/fixture'

/**
 * The Phase 0 vertical slice as a ProjectDsl. The scenes are NOT re-authored
 * here — they come from the visual director's fixture, so the DSL the engine
 * renders is exactly the DSL the director produced.
 *
 * 6 + 9 + 9 + 6 = 30s @ 30fps = 180 + 270 + 270 + 180 = 900 frames.
 */
export const demoProjectDsl: ProjectDsl = {
  dslVersion: '0.1',
  project: { id: 'delyai2-phase0-demo', title: 'DeLyAI2 — Video Engine Phase 0', language: 'vi' },
  render: { fps: 30, width: 1920, height: 1080 },
  style: { styleId: 'default' },
  seed: 20261003,
  voiceScenePolicy: 'strict',
  music: null,
  scenes: FIXTURE_SCENES,
}
