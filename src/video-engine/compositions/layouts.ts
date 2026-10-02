import type { LayoutArgs, SlotRect } from '@/video-engine/registry/types'

export function fullFrame(args: LayoutArgs): SlotRect[] {
  const { width, height } = args.render
  return [{ slot: args.slots[0] ?? 'main', x: 0, y: 0, width, height }]
}
export const heroLayout = fullFrame
export const dataLayout = fullFrame

export function centeredLayout(args: LayoutArgs): SlotRect[] {
  const { width, height } = args.render
  const w = Math.round(width * 0.8)
  const h = Math.round(height * 0.8)
  return [{ slot: args.slots[0] ?? 'main', x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: w, height: h }]
}

export function splitLayout(args: LayoutArgs): SlotRect[] {
  const { width, height } = args.render
  const left = Math.round(width * 0.5)
  return [
    { slot: args.slots[0] ?? 'main', x: 0, y: 0, width: left, height },
    { slot: args.slots[1] ?? 'aside', x: left, y: 0, width: width - left, height },
  ]
}
export const comparisonLayout = splitLayout

export function gridLayout(args: LayoutArgs): SlotRect[] {
  const { width, height } = args.render
  const cols = 2
  const rows = Math.max(1, Math.ceil(args.slots.length / cols))
  const cw = Math.floor(width / cols)
  const ch = Math.floor(height / rows)
  return args.slots.map((slot, i) => ({ slot, x: (i % cols) * cw, y: Math.floor(i / cols) * ch, width: cw, height: ch }))
}
export const cardsLayout = gridLayout

export function mediaTextLayout(args: LayoutArgs): SlotRect[] {
  const { width, height } = args.render
  const media = Math.round(width * 0.55)
  return [
    { slot: args.slots[0] ?? 'media', x: 0, y: 0, width: media, height },
    { slot: args.slots[1] ?? 'text', x: media, y: 0, width: width - media, height },
  ]
}