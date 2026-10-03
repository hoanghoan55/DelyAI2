import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import { join } from 'node:path'
import { buildFixtureProject } from '@/ai/project'
import { clearRegistered, registerBackends } from '@/video-engine/runtime'
import { parseProjectDsl } from '@/video-engine/schema'
import { demoProjectDsl } from '@/ai/demo-project.dsl'
import { RemotionRoot } from '../../remotion/Root'
import { DemoComposition } from '../../remotion/DemoComposition'
import { demoProject } from '../../remotion/project'

// Importing the Remotion entry modules runs their module-scope registration
// (remotion/project.ts). The per-test reset below keeps any later compile call
// independent of that load-time side effect.
beforeEach(() => { clearRegistered(); registerBackends() })

describe('demo composition source', () => {
  it('exposes 900 frames at 30fps 1920x1080 for the fixture project', () => {
    const { timeline } = buildFixtureProject()
    expect(timeline.totalFrames).toBe(900)
    expect(timeline.fps).toBe(30)
    expect(timeline.width).toBe(1920)
    expect(timeline.height).toBe(1080)
  })

  // Hard requirement 2, structurally: every Composition metadata field is read
  // from the timeline. A hardcoded 900/30/1920/1080 anywhere would still pass the
  // fixture-value assertions but fails these derivation assertions.
  it('RemotionRoot derives every metadata field from the master timeline', () => {
    const { timeline } = buildFixtureProject()
    const el = RemotionRoot({}) as unknown as { props: { id: string; durationInFrames: number; fps: number; width: number; height: number } }
    const props = el.props
    expect(props.id).toBe('DeLyDemo')
    expect(props.durationInFrames).toBe(timeline.totalFrames)
    expect(props.fps).toBe(timeline.fps)
    expect(props.width).toBe(timeline.width)
    expect(props.height).toBe(timeline.height)
  })

  // Hard requirement 1: the composition renders the real built project, passed
  // through by reference (no clone/map), not a placeholder.
  it('DemoComposition passes the built project through to ProjectVideo by reference', () => {
    const el = DemoComposition({}) as unknown as { props: { scenes: unknown; timeline: unknown } }
    const props = el.props
    expect(props.scenes).toBe(demoProject.compiledScenes)
    expect(props.timeline).toBe(demoProject.timeline)
  })

  // Carry-forward (Task 12 review Minor-1, binding on Task 15): the inspection
  // mirror must stay value-identical to the single source of truth. Deep `toEqual`
  // on the parsed data, not raw-string equality.
  it('src/ai/fixtures/demo-project.dsl.json parses to demoProjectDsl', () => {
    const raw = JSON.parse(fs.readFileSync(join(process.cwd(), 'src', 'ai', 'fixtures', 'demo-project.dsl.json'), 'utf8'))
    expect(parseProjectDsl(raw)).toEqual(demoProjectDsl)
  })
})

describe('remotion module-order hazard', () => {
  // The Task 14 defect: a fixture compile at module scope running before the
  // module that registers became a *different* module's responsibility. `project.ts`
  // makes registration + compile adjacent statements in one module, so importing
  // it with an empty registry must still succeed. If a future edit splits the
  // register call into another module again, this fails with
  // `CompilerError: Unknown composition "hero"`.
  it('importing remotion/project with an empty registry builds the demo (registration is same-module)', async () => {
    clearRegistered()
    vi.resetModules()
    const mod = await import('../../remotion/project')
    expect(mod.demoProject.compiledScenes).toHaveLength(4)
    expect(mod.demoProject.timeline.totalFrames).toBe(900)
  })
})
