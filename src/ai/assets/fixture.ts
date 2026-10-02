import type { AssetDirector } from './contract'

export function createFixtureAssetDirector(): AssetDirector {
  return {
    // The input is intentionally ignored: Phase 0 resolves no assets. The
    // parameter is omitted rather than underscored so it is not an unused binding.
    async plan() {
      return { assets: [] }
    },
  }
}
