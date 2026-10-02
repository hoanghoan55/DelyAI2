import type { VisionChecker } from './index'

/**
 * Fixture vision checker: reports itself unavailable and returns no findings.
 * It never calls a model. Downstream code can be written against the interface
 * now, but must treat `available: false` as "not run" rather than "passed".
 */
export function createFixtureVisionChecker(): VisionChecker {
  return {
    async check() {
      return { available: false, findings: [] }
    },
  }
}
