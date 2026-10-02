import { describe, it, expect } from 'vitest'
import { computeCompiledHash, type CompiledScene, type CompiledLayer } from '@/video-engine/ir'

const layer: CompiledLayer = {
  id: 'l1', layerKind: 'visual', recipeId: 'particle-field', recipeVersion: '1.0.0',
  renderer: 'canvas2d', slot: 'main', frameWindow: { from: 0, durationInFrames: 180 },
  params: { a: 1, b: 2 }, motion: [], zIndex: 0, assetRefs: [],
}

const scene: CompiledScene = {
  irVersion: '0.1', sceneId: 'scene-01', seed: 1,
  render: { fps: 30, width: 1920, height: 1080 },
  timing: { startFrame: 0, durationInFrames: 180 },
  composition: { id: 'hero', slots: ['main'] },
  layers: [layer], typography: null, events: [], audio: [], diagnostics: [],
  provenance: { engineVersion: '0.1.0', sourceHash: 'abc', compiledHash: '' },
}

describe('computeCompiledHash', () => {
  it('ignores the existing provenance.compiledHash (no circularity)', () => {
    const a = computeCompiledHash(scene)
    const b = computeCompiledHash({ ...scene, provenance: { ...scene.provenance, compiledHash: 'deadbeef' } })
    expect(a).toBe(b)
  })
  it('changes when IR content changes', () => {
    const a = computeCompiledHash(scene)
    const b = computeCompiledHash({ ...scene, timing: { startFrame: 0, durationInFrames: 181 } })
    expect(a).not.toBe(b)
  })
  it('is order-independent for params keys', () => {
    const withB = { ...scene, layers: [{ ...layer, params: { b: 2, a: 1 } }] } as CompiledScene
    expect(computeCompiledHash(scene)).toBe(computeCompiledHash(withB))
  })
  it('is not order-independent for the layers array (order is semantic)', () => {
    const two = { ...scene, layers: [layer, { ...layer, id: 'l2', zIndex: 1 }] } as CompiledScene
    const twoSwapped = { ...scene, layers: [{ ...layer, id: 'l2', zIndex: 1 }, layer] } as CompiledScene
    expect(computeCompiledHash(two)).not.toBe(computeCompiledHash(twoSwapped))
  })
})
