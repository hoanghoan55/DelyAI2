import { registerComposition } from '@/video-engine/registry/registry'
import { COMPOSITIONS } from './defs'

export function registerCompositions(): void {
  for (const def of COMPOSITIONS) registerComposition(def)
}