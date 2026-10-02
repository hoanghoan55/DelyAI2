import type { CompositionDef } from '@/video-engine/registry/types'
import { cardsLayout, centeredLayout, comparisonLayout, dataLayout, gridLayout, heroLayout, mediaTextLayout, splitLayout, fullFrame } from './layouts'

const V = '1.0.0'
export const COMPOSITIONS: CompositionDef[] = [
  { id: 'hero', version: V, slots: [{ id: 'main', role: 'primary' }], layout: heroLayout },
  { id: 'centered', version: V, slots: [{ id: 'main', role: 'primary' }], layout: centeredLayout },
  { id: 'full-screen', version: V, slots: [{ id: 'main', role: 'primary' }], layout: fullFrame },
  { id: 'split', version: V, slots: [{ id: 'main', role: 'primary' }, { id: 'aside', role: 'secondary' }], layout: splitLayout },
  { id: 'grid', version: V, slots: [{ id: 'cell-1', role: 'primary' }, { id: 'cell-2', role: 'secondary' }, { id: 'cell-3', role: 'tertiary' }, { id: 'cell-4', role: 'quaternary' }], layout: gridLayout },
  { id: 'comparison', version: V, slots: [{ id: 'left', role: 'primary' }, { id: 'right', role: 'secondary' }], layout: comparisonLayout },
  { id: 'cards', version: V, slots: [{ id: 'card-1', role: 'primary' }, { id: 'card-2', role: 'secondary' }, { id: 'card-3', role: 'tertiary' }], layout: cardsLayout },
  { id: 'media-text', version: V, slots: [{ id: 'media', role: 'primary' }, { id: 'text', role: 'secondary' }], layout: mediaTextLayout },
  { id: 'data', version: V, slots: [{ id: 'main', role: 'primary' }], layout: dataLayout },
]