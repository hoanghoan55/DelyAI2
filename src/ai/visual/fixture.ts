import type { SceneDSL } from '@/video-engine/schema'
import type { VisualDirector } from './contract'

/**
 * The Phase 0 vertical slice, authored once. `FIXTURE_SCENES` is the single
 * source: the director returns it, and demo-project.dsl.ts wraps it in a
 * ProjectDsl. Recipe ids are engine-owned; the director only chooses among ids
 * the engine advertises via `listAvailable()`.
 *
 * Layer/renderer assignment follows spec §11 exactly. Scene 1 and Scene 4 are
 * DOM-only, so their `visual` arrays are empty — a scene with no visual layers
 * is a valid DOM scene, not a missing layer. Do not add a decorative canvas
 * recipe to them: that silently changes their renderer to `DOM + Canvas 2D`
 * and breaks the §11 table.
 */
export const FIXTURE_SCENES: SceneDSL[] = [
  {
    // 1. Hero — typography reveal, DOM only. 6.0s. (spec §11 row 1)
    schemaVersion: '0.1', sceneId: 'scene-hero', purpose: 'hook', duration: 6,
    composition: 'hero',
    visual: [],
    motion: [],
    typography: { text: 'DeLyAI2', animation: 'reveal', slot: 'main', startSeconds: 0.4, durationSeconds: 5 },
    // `audio`/`events` have schema defaults of `[]`; listed explicitly because
    // `SceneDSL` is the Zod *output* type, where defaulted fields are required.
    audio: [], events: [],
    style: { styleId: 'default' }, seed: 20261003,
  },
  {
    // 2. Split explain — dom text + `particle-field`, DOM + Canvas 2D. 9.0s. (spec §11 row 2)
    schemaVersion: '0.1', sceneId: 'scene-split', purpose: 'explain_concept', duration: 9,
    composition: 'split',
    visual: [{ id: 'split-particles', recipe: 'particle-field', slot: 'aside', params: { count: 48, hue: 200, speed: 1 } }],
    motion: [{ recipe: 'slide', target: 'split-particles', params: { axis: 'x', distance: 0.08, easing: 'out' } }],
    typography: { text: 'AI mô tả ý định', animation: 'fade', slot: 'main', startSeconds: 1, durationSeconds: 4 },
    audio: [], events: [],
    style: { styleId: 'default' }, seed: 20261003,
  },
  {
    // 3. 3D network — `network-graph` + `camera-flythrough`, Three.js. 9.0s. (spec §11 row 3)
    schemaVersion: '0.1', sceneId: 'scene-network', purpose: 'explain_network', duration: 9,
    composition: 'full-screen',
    visual: [{ id: 'network', recipe: 'network-graph', slot: 'main', params: { nodes: 28, radius: 2.6, color: '#4a9eff' } }],
    motion: [{ recipe: 'camera-flythrough', target: 'network', params: { from: 0.9, to: 1.05 } }],
    typography: { text: 'Một master timeline', animation: 'word-by-word', slot: 'main', startSeconds: 0.6, durationSeconds: 4 },
    audio: [], events: [],
    style: { styleId: 'default' }, seed: 20261003,
  },
  {
    // 4. Typography outro — typography, DOM only. 6.0s. (spec §11 row 4)
    schemaVersion: '0.1', sceneId: 'scene-outro', purpose: 'outro', duration: 6,
    composition: 'centered',
    visual: [],
    motion: [],
    typography: { text: 'Phase 1', animation: 'typewriter', slot: 'main', startSeconds: 0.8, durationSeconds: 3 },
    audio: [], events: [],
    style: { styleId: 'default' }, seed: 20261003,
  },
]

export function createFixtureVisualDirector(): VisualDirector {
  return {
    // The input is intentionally ignored: Phase 0 returns the fixed slice. The
    // parameter is omitted rather than underscored so it is not an unused binding.
    async direct() {
      return structuredClone(FIXTURE_SCENES)
    },
  }
}
