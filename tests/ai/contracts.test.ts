import { describe, it, expect } from 'vitest'
import { createFixtureStoryDirector, createFixtureVisualDirector, createFixtureTtsAdapter } from '@/ai'

describe('ai contracts + fixture implementations', () => {
  it('fixture story director returns the 4-scene 30s outline', async () => {
    const plan = await createFixtureStoryDirector().direct({ topic: 'DeLyAI2 Phase 0', targetSeconds: 30, language: 'vi' })
    expect(plan.scenes.map((s) => s.durationSeconds)).toEqual([6, 9, 9, 6])
    expect(plan.scenes.map((s) => s.purpose)).toEqual(['hook', 'explain_concept', 'explain_network', 'outro'])
  })
  it('fixture visual director assigns recipes with declared renderers', async () => {
    const plan = await createFixtureVisualDirector().direct({ topic: 'x', language: 'vi', scenes: [], availableCompositions: [], availableVisualRecipes: [], availableMotionRecipes: [], style: { styleId: 'default' }, assets: [], timelineWindow: { startSeconds: 0, durationSeconds: 30 }, constraints: {} })
    expect(plan).toHaveLength(4)
    expect(plan[0]!.composition).toBe('hero')
    expect(plan[2]!.visual.some((l) => l.recipe === 'network-graph')).toBe(true)
  })
  it('fixture tts adapter reports estimated timing, never real audio', async () => {
    const tl = await createFixtureTtsAdapter().synthesize({ text: 'xin chào', language: 'vi', voice: 'fixture', sceneId: 'scene-01' })
    expect(tl.timingSource).toBe('fixture')
    expect(tl.segments[0]!.sceneId).toBe('scene-01')
    expect(tl.segments[0]!.endMs).toBeGreaterThan(0)
    expect(tl.segments[0]!.timingSource).toBe('fixture')
  })
})
