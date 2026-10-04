/** Prompt vocabulary for StyleRef.styleId (spec §2: token consumption is Phase 1B —
 *  1A only designs the vocabulary; the DSL field already exists). */
export const STYLE_PRESETS: { id: string; description: string }[] = [
  { id: 'default', description: 'balanced, neutral brand look' },
  { id: 'cinematic', description: 'deep contrast, dark backdrop, filmic pacing' },
  { id: 'minimal', description: 'high whitespace, few elements, mono accents' },
  { id: 'energetic', description: 'bright accents, fast motion, playful shapes' },
  { id: 'corporate', description: 'clean grids, blue accents, calm motion' },
]
