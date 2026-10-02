import type { StoryDirector, StoryPlan } from './contract'

export const FIXTURE_STORY: StoryPlan = {
  title: 'DeLyAI2 — Video Engine Phase 0',
  scenes: [
    { id: 'scene-hero', purpose: 'hook', durationSeconds: 6, title: 'DeLyAI2', narration: 'Một video engine xác định, dựng từ Scene DSL.' },
    { id: 'scene-split', purpose: 'explain_concept', durationSeconds: 9, title: 'Kiến trúc', narration: 'AI mô tả ý định, engine quyết định bố cục và chuyển động.' },
    { id: 'scene-network', purpose: 'explain_network', durationSeconds: 9, title: 'Ba renderer', narration: 'Remotion, Canvas 2D và Three.js chạy trên một master timeline.' },
    { id: 'scene-outro', purpose: 'outro', durationSeconds: 6, title: 'Sẵn sàng cho Phase 1', narration: 'Nền tảng đã xác định, có thể mở rộng.' },
  ],
}

export function createFixtureStoryDirector(): StoryDirector {
  return {
    // The brief is intentionally ignored: Phase 0 returns a fixed plan. The
    // parameter is omitted rather than underscored so it is not an unused binding.
    async direct() {
      return structuredClone(FIXTURE_STORY)
    },
  }
}
