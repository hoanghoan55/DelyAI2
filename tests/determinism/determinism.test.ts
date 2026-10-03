import { describe, it, expect, beforeEach } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { clearRegistered, registerBackends } from '@/video-engine/runtime'
import { buildFixtureProject } from '@/ai/project'
import { getCanvasRecipe } from '@/video-engine/canvas'
import { getThreeRecipe, structuralHashOf } from '@/video-engine/three'
import { createSeededRandom } from '@/shared'

// The determinism levels the spec claims (spec §10), each asserted at its real
// level: compiler exactly, canvas at the sampling level, three structurally.
// `registerBackends` (not `registerMetadata`) is required because the compiler
// resolves motion recipes too, which only the full backend registration wires.
beforeEach(() => { clearRegistered(); registerBackends() })

describe('determinism levels', () => {
  it('compiler: identical DSL compiles to identical hashes (exact)', () => {
    const a = buildFixtureProject().compiledScenes.map((s) => s.provenance.compiledHash)
    const b = buildFixtureProject().compiledScenes.map((s) => s.provenance.compiledHash)
    expect(a).toEqual(b)
    // A sha256 hex digest, not a placeholder string.
    for (const h of a) expect(h).toHaveLength(64)
    expect(a.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true)
  })

  it('canvas: sampled geometry is a pure function of the frame (sampling level)', () => {
    const recipe = getCanvasRecipe('particle-field')
    const params = recipe.paramsSchema.parse({})
    const size = { width: 1920, height: 1080 }
    // No canvas context: `prepare(null, …)` + `samplePositions` are headless.
    const run = () => {
      const state = recipe.prepare!(null, size, params)
      const pts: number[] = []
      for (let f = 0; f < 60; f++) pts.push(...recipe.samplePositions!(f, 30, state, params, createSeededRandom(11)))
      return pts
    }
    expect(run()).toEqual(run())
    expect(run().every(Number.isFinite)).toBe(true)

    // Frame sensitivity: a fixed frame is stable, a neighbouring frame differs —
    // so the equality above is not the trivial "always constant" pass.
    const sampleAt = (frame: number): number[] => {
      const state = recipe.prepare!(null, size, params)
      return recipe.samplePositions!(frame, 30, state, params, createSeededRandom(11))
    }
    expect(sampleAt(10)).toEqual(sampleAt(10))
    expect(sampleAt(10)).not.toEqual(sampleAt(11))
  })

  it('three: descriptors are structurally stable and frame-sensitive (structural level)', () => {
    const recipe = getThreeRecipe('network-graph')
    const args = (frame: number) => ({ frame, fps: 30, params: recipe.paramsSchema.parse({}), rng: createSeededRandom(1234), sizing: { width: 1920, height: 1080 } })
    expect(structuralHashOf(recipe.describe!(args(0)))).toBe(structuralHashOf(recipe.describe!(args(0))))
    expect(structuralHashOf(recipe.describe!(args(0)))).not.toBe(structuralHashOf(recipe.describe!(args(1))))
  })

  it('no Math.random anywhere in the video engine', async () => {
    const root = join(process.cwd(), 'src', 'video-engine')
    const files: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full)
        else if (/\.tsx?$/.test(entry.name)) files.push(full)
      }
    }
    await walk(root)
    // Guard against a silently-empty walk: the engine is dozens of modules.
    // If a future move breaks the root path, this fails instead of passing vacuously.
    expect(files.length).toBeGreaterThanOrEqual(50)

    const offenders: string[] = []
    for (const file of files) {
      if ((await readFile(file, 'utf-8')).includes('Math.random')) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
