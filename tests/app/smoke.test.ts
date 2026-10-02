import { describe, it, expect, beforeEach } from 'vitest'
import { buildFixtureProject } from '@/ai/project'
import { clearRegistered, registerBackends } from '@/video-engine/runtime'
import { toPlayerProps } from '@/app/player-props'

beforeEach(() => { clearRegistered(); registerBackends() })

describe('app shell', () => {
  it('derives player props from the master timeline, not from constants', () => {
    const { compiledScenes, timeline } = buildFixtureProject()
    const props = toPlayerProps({ compiledScenes, timeline })
    expect(props.durationInFrames).toBe(900)
    expect(props.fps).toBe(30)
    expect(props.compositionWidth).toBe(1920)
    expect(props.compositionHeight).toBe(1080)
    expect(props.inputProps.scenes).toBe(compiledScenes)
    expect(props.inputProps.timeline).toBe(timeline)
  })
})
