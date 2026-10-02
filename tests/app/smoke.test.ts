import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildFixtureProject } from '@/ai/project'
import { clearRegistered, registerBackends } from '@/video-engine/runtime'
import { toPlayerProps } from '@/app/player-props'

describe('app shell', () => {
  beforeEach(() => { clearRegistered(); registerBackends() })

  it('derives player props from the master timeline, not from constants', () => {
    const { compiledScenes, timeline } = buildFixtureProject()

    // Derivation: a deliberately mutated timeline must flow through verbatim.
    // Hardcoded 900/30/1920/1080 would fail every one of these.
    const mutated = toPlayerProps({
      compiledScenes,
      timeline: { ...timeline, fps: 24, totalFrames: 720, width: 1280, height: 720 },
    })
    expect(mutated.durationInFrames).toBe(720)
    expect(mutated.fps).toBe(24)
    expect(mutated.compositionWidth).toBe(1280)
    expect(mutated.compositionHeight).toBe(720)

    // Reference identity: no clone/map/spread of the arrays and objects.
    expect(mutated.inputProps.scenes).toBe(compiledScenes)

    // The real fixture's numbers stay pinned too.
    const props = toPlayerProps({ compiledScenes, timeline })
    expect(props.durationInFrames).toBe(900)
    expect(props.fps).toBe(30)
    expect(props.compositionWidth).toBe(1920)
    expect(props.compositionHeight).toBe(1080)
    expect(props.inputProps.scenes).toBe(compiledScenes)
    expect(props.inputProps.timeline).toBe(timeline)
  })
})

describe('app module evaluation order', () => {
  it('importing App with an empty registry does not throw', async () => {
    // Reproduces the blank-SPA bug: App must not compile the fixture at module
    // scope, because that runs before the entry's registerBackends().
    clearRegistered()
    vi.resetModules()
    await expect(import('@/app/App')).resolves.toBeDefined()
  })
})
