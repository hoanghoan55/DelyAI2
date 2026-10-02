export type AssetPlanningInput = { topic: string; language: string; scenes: { id: string; narration: string }[] }
export type AssetPlan = { assets: { id: string; kind: 'image' | 'audio' | 'font' | 'video'; source: string }[] }

/** Resolves assets to ids/sources. Phase 0 returns an empty plan. */
export interface AssetDirector {
  plan(input: AssetPlanningInput): Promise<AssetPlan>
}
