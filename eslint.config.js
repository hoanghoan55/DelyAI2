import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Build output and dependencies are never linted. `dist/` exists after
  // `vite build` and `build/` after `remotion bundle`, so this must be ignored
  // or CI's build → lint order goes red.
  { ignores: ['dist/**', 'build/**', 'node_modules/**', 'out/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/video-engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use SeededRandom — deterministic rendering is required.' },
      ],
    },
  },
  {
    // Spec §2 dependency rule: ai/** must not reach the engine beyond schema.
    // src/ai/project.ts is the composition root and the single documented exception.
    files: ['src/ai/**/*.{ts,tsx}'],
    ignores: ['src/ai/project.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/video-engine/compiler', '@/video-engine/compiler/*'], message: 'ai/** may not call the compiler. Only src/ai/project.ts (the composition root) may.' },
            { group: ['@/video-engine/ir', '@/video-engine/ir/*'], message: 'ai/** may not import the IR — that is the engine output contract.' },
            { group: ['@/video-engine/runtime', '@/video-engine/runtime/*'], message: 'ai/** may not import the runtime.' },
            { group: ['@/video-engine/compositions', '@/video-engine/compositions/*'], message: 'ai/** may not import compositions.' },
            { group: ['@/video-engine/{canvas,three,motion}', '@/video-engine/{canvas,three,motion}/*'], message: 'ai/** may not import renderer implementations.' },
          ],
        },
      ],
    },
  },
  {
    // The composition root breaks the ai → video-engine rule deliberately (spec §2).
    // State the exception explicitly rather than relying on the `ignores` above.
    files: ['src/ai/project.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
)
