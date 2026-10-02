# DeLyAI2 Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean, deterministic AI Video Engine foundation: Scene DSL → Scene Compiler → Compiled IR → Runtime → Remotion + Canvas 2D + Three.js, rendering one 30-second MP4 from a fixture DSL.

**Architecture:** AI (or fixture) produces a versioned, non-executable **Scene DSL** in seconds. A pure, deterministic **Compiler** validates it, resolves composition/recipes/defaults, binds it to the **Master Timeline** (integer frames), and emits a serializable **Compiled Scene IR** with no functions and no float frames. A thin **Runtime interpreter** in Remotion dispatches IR layers to DOM / Canvas 2D / Three.js backends selected by the **recipe registry**.

**Tech Stack:** TypeScript, React 18, Vite 5, Remotion 4, `@remotion/player`, `@remotion/three`, Three.js + React Three Fiber, Canvas 2D, Zod (pinned `3.22.3`), Vitest, ESLint. Package manager: **npm**.

**Spec:** `docs/superpowers/specs/2026-10-03-delyai2-phase0-design.md`

## Global Constraints

- **Zod must be pinned to exactly `3.22.3`** (Remotion `schema` prop requirement).
- **No `Math.random()` anywhere in `src/video-engine/**`** — all randomness via `SeededRandom`. Enforced by ESLint.
- **No float frames in IR.** Every frame value is an integer.
- **No time conversion outside `src/timeline/convert.ts`** — no module may call `Math.floor/ceil/round` to convert seconds↔frames.
- **`secondsToFrames` policy is `Math.round(seconds * fps)`**, single source.
- **Scene DSL is seconds; IR is frames.** DSL is non-executable (no JS/JSX/eval strings).
- **Dependency rules (spec §2 table):** `ai/** → timeline (read-only) + video-engine/schema + shared` only — **except `src/ai/project.ts`, the composition root, which may call the compiler**. `video-engine/** → video-engine/** + timeline + shared`. `timeline/** → shared` only. `qa/** → schema, ir, timeline, shared`. ESLint enforces the `ai/**` rule in Task 1.
- **Locked structure (spec §2):** `src/ai/{story,visual,assets,tts}/` each with `contract.ts` + `fixture.ts`; `src/{app,domain,ai,timeline,video-engine,qa,shared}/`; `remotion/` and `scripts/` at root.
- **`purpose` is semantic metadata only** — compiler must never branch on it.
- **Recipe renderer comes from the registry, never from the DSL** (exception: optional `backdropRenderer`).
- **"Build pass" = `vite build` + `tsc --noEmit` + `npx remotion bundle`.**
- **Docs:** `README.md` and `AGENTS.md` at root; other 6 docs in `docs/`.
- Never commit secrets, generated MP4, or temp files. `out/` is gitignored.
- 1 task = 1 commit; each commit runs typecheck + tests.

## Review Focus

Input classes / failure modes the spec implies but that no single task's happy-path test covers. Each gets a dedicated test in the task that owns the code (called out inline).

1. **Non-finite numbers in DSL/IR reaching the canonical hasher** — a `NaN`/`Infinity` duration must **throw a clear error** (Task 2 `canonicalize`, Task 4 schema `.finite()`), never silently break determinism.
2. **Unknown recipe / composition id in DSL** — must fail **compiler validation with a diagnostic naming the unknown id** (Task 7), never crash at render.
3. **Voice segment whose window exceeds its scene under policy `"strict"`** — must emit a **warning diagnostic** and **not** mutate scene windows (Task 3).
4. **Recipes with no `params` supplied** — compiler must **apply registry defaults** so IR `params` is never missing expected fields (Task 7).
5. **29.97fps scene accumulation** — scene windows must be **gap-free and contiguous** (`Σ durationInFrames === totalFrames`) (Task 3).

## Task Index

| # | Task | Deliverable |
|---|---|---|
| 1 | Repository scaffold | package.json, configs, scripts |
| 2 | Shared primitives | SeededRandom, canonicalize, sha256, ids |
| 3 | Timeline | units, conversions, voice/music/master |
| 4 | Scene DSL schema | Zod strict schema |
| 5 | Compiled IR | IR types + non-circular compiledHash |
| 6 | Registry + compositions | registry, 9 composition primitives |
| 7 | Scene Compiler | DSL → IR with diagnostics |
| 8 | Runtime + Remotion root | interpreter, ProjectVideo, DeLyDemo |
| 9 | Canvas 2D | subsystem + 5 recipes + backend |
| 10 | Three.js | subsystem + 6 recipes + backend |
| 11 | Motion + typography | 7 motion recipes, text animation |
| 12 | AI contracts + fixtures | `ai/{story,visual,assets,tts}` + 30s fixture |
| 13 | QA layers | 6 layers: schema/timeline/scene/geometry/render + vision boundary |
| 14 | App shell | Vite SPA + @remotion/player |
| 15 | Demo wiring + render script | 30s project, render:demo, determinism tests |
| 16 | Documentation | 8 docs incl. AGENTS.md |

---

## Deferred by spec — deliberately not built in Phase 0

Spec §2 locks the *eventual* tree. Four of its entries are **not** Phase 0 deliverables. They are listed here so a reader auditing the plan against §2 does not mistake the omission for an oversight, and so no task wastes a commit scaffolding an empty directory.

| Spec §2 entry | Phase 0 status | Why |
|---|---|---|
| `src/video-engine/effects/` | **Not created.** Spec §6.8 says "Phase 0 tối thiểu" — minimal. No phase-0 scene uses a post/overlay effect, and the recipe registry already represents `layerKind: 'effect'`, so the *concept* is modelled; only the directory is absent. | An empty directory is not a boundary. It gets built in the first phase that ships an actual effect recipe. |
| `src/video-engine/audio/` | **Contract only.** Spec §6.8: "Phase 0 **contract only**, Remotion `<Audio>` không phát file (fixture timing)." The contract is the IR type `CompiledAudioCue` (Task 5) plus the compiler mapping from `AudioCueSpec` (Task 7); both exist. | No phase-0 scene plays a file, so there is nothing for a subsystem to do. `CompiledScene.audio` is populated and asserted; the renderer ignores it by design. |
| `src/video-engine/typography/` | **Not created — folded into `ir/` + `runtime/`.** Spec §6.7 defines it as the pure mapping `{ text, animation, style } → CompiledTypography`, which is exactly the compiler + `TypographyLayer` halves the plan already builds. | See the note in Task 11. |
| `src/domain/**` | **Not created.** Spec §2 lists `domain/{projects,assets,jobs,generation}` — the product data model (Project, RenderSettings, Asset, Job, GenerationRun). Every one of those belongs to a product surface the brief's mục 30 forbids in Phase 0 (Auth, Credits, Marketplace, Chat, History, Batch, Subscription, Billing). | Building `domain/` now would mean inventing product types ahead of the features that need them. Phase 0's data model is the *DSL* and the *IR*, both of which exist. |

`scripts/` (spec §2: "render-demo, helpers") **is** created, but only if Task 15 needs a helper beyond `package.json` scripts — Task 15 says which. Spec §12's script table (`dev, studio, typecheck, test, build, bundle:remotion, render:demo`) is fully covered by `package.json`; a `scripts/` file is added only when a step needs logic that does not fit one command.

---

### Task 1: Repository scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `index.html`, `src/vite-env.d.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: npm scripts `dev`, `studio`, `typecheck`, `test`, `build`, `bundle:remotion`, `render:demo`, `lint`; path alias `@/*` → `src/*`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "delyai2",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "studio": "remotion studio remotion/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "build": "vite build",
    "bundle:remotion": "remotion bundle remotion/index.ts",
    "render:demo": "remotion render remotion/index.ts DeLyDemo out/demo.mp4"
  },
  "dependencies": {
    "@remotion/player": "4.0.190",
    "@remotion/three": "4.0.190",
    "@react-three/fiber": "8.17.10",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "remotion": "4.0.190",
    "three": "0.169.0",
    "zod": "3.22.3"
  },
  "devDependencies": {
    "@types/node": "22.8.1",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@types/three": "0.169.0",
    "@vitejs/plugin-react": "4.3.3",
    "eslint": "9.13.0",
    "typescript": "5.6.3",
    "typescript-eslint": "8.12.2",
    "vite": "5.4.10",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vitest/globals", "node"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "remotion", "scripts", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Write `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Write `vite.config.ts` and `vitest.config.ts`**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  optimizeDeps: { exclude: ['@remotion/player'] },
})
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts', 'src/**/*.test.ts'] },
})
```

- [ ] **Step 5: Write `.gitignore`, `index.html`, `src/vite-env.d.ts`, `eslint.config.js`**

```gitignore
node_modules/
dist/
out/
.codegraph/
*.mp4
*.log
.DS_Store
```

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DeLyAI2 Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

```ts
// src/vite-env.d.ts
/// <reference types="vite/client" />
```

```js
// eslint.config.js
import tseslint from 'typescript-eslint'

export default tseslint.config(
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
)
```

- [ ] **Step 6: Install and verify**

Run: `npm install`
Expected: install completes.

Run: `npx tsc --noEmit`
Expected: no output (no source files yet — exits 0).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts eslint.config.js .gitignore index.html src/vite-env.d.ts
git commit -m "chore: scaffold repo (vite, remotion, vitest, eslint)"
```

---

### Task 2: Shared primitives — SeededRandom, canonical JSON, SHA-256, ids

**Files:**
- Create: `src/shared/rng.ts`, `src/shared/canonical-json.ts`, `src/shared/hash.ts`, `src/shared/ids.ts`, `src/shared/index.ts`
- Test: `tests/shared/rng.test.ts`, `tests/shared/canonical-json.test.ts`, `tests/shared/hash.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class SeededRandom { next(): number; int(min,max): number; float(min,max): number; pick<T>(arr:T[]):T }`
  - `createSeededRandom(seed: number): SeededRandom`
  - `canonicalize(value: unknown): string`
  - `sha256Hex(input: string): string`
  - `hashObject(value: unknown): string` (= `sha256Hex(canonicalize(value))`)
  - `makeId(prefix: string, index: number): string`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/shared/rng.test.ts
import { describe, it, expect } from 'vitest'
import { createSeededRandom } from '@/shared/rng'

describe('SeededRandom', () => {
  it('produces identical sequences for the same seed', () => {
    const a = createSeededRandom(12345)
    const b = createSeededRandom(12345)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    expect(createSeededRandom(1).next()).not.toEqual(createSeededRandom(2).next())
  })

  it('int() stays within inclusive bounds', () => {
    const rng = createSeededRandom(42)
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 7)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(7)
    }
  })

  it('does not call Math.random internally', () => {
    const original = Math.random
    Math.random = () => { throw new Error('Math.random used') }
    try {
      expect(() => createSeededRandom(7).next()).not.toThrow()
    } finally {
      Math.random = original
    }
  })
})
```

```ts
// tests/shared/canonical-json.test.ts
import { describe, it, expect } from 'vitest'
import { canonicalize } from '@/shared/canonical-json'

describe('canonicalize', () => {
  it('sorts object keys lexicographically', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })
  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]')
  })
  it('normalizes negative zero to zero', () => {
    expect(canonicalize(-0)).toBe('0')
  })
  it('throws on NaN', () => {
    expect(() => canonicalize(NaN)).toThrow(/non-finite/i)
  })
  it('throws on Infinity', () => {
    expect(() => canonicalize(Infinity)).toThrow(/non-finite/i)
  })
  it('emits no whitespace and is stable across key insertion order', () => {
    const a = canonicalize({ z: [1, { y: 2, x: 3 }], a: 's' })
    const b = canonicalize({ a: 's', z: [1, { x: 3, y: 2 }] })
    expect(a).toBe(b)
    expect(a).not.toMatch(/\s/)
  })
  it('serializes integers without a decimal point', () => {
    expect(canonicalize(5)).toBe('5')
    expect(canonicalize(5.0)).toBe('5')
  })
})
```

```ts
// tests/shared/hash.test.ts
import { describe, it, expect } from 'vitest'
import { sha256Hex, hashObject } from '@/shared/hash'

describe('sha256Hex', () => {
  it('matches the known digest of the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
  it('matches the known digest of "abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('hashObject is order-independent for objects', () => {
    expect(hashObject({ a: 1, b: 2 })).toBe(hashObject({ b: 2, a: 1 }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/shared`
Expected: FAIL — cannot resolve `@/shared/*`.

- [ ] **Step 3: Implement `src/shared/rng.ts`**

```ts
export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Inclusive integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('SeededRandom.pick: empty array')
    return arr[this.int(0, arr.length - 1)]!
  }
}

export function createSeededRandom(seed: number): SeededRandom {
  return new SeededRandom(seed)
}
```

- [ ] **Step 4: Implement `src/shared/canonical-json.ts`**

```ts
export function canonicalize(value: unknown): string {
  return write(value)
}

function write(value: unknown): string {
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'number') return writeNumber(value as number)
  if (t === 'boolean') return (value as boolean) ? 'true' : 'false'
  if (t === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(write).join(',') + ']'
  if (t === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + write(obj[k])).join(',') + '}'
  }
  throw new Error(`canonicalize: unsupported type "${t}"`)
}

function writeNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error('canonicalize: non-finite number (NaN/Infinity) is not allowed')
  if (Object.is(n, -0)) return '0'
  return String(n) // integers lose their decimal point; floats keep one canonical form
}
```

- [ ] **Step 5: Implement `src/shared/hash.ts` (pure JS SHA-256, isomorphic)**

```ts
// src/shared/hash.ts
import { canonicalize } from './canonical-json'

// Dependency-free SHA-256. Works in Node and in Remotion's render bundle
// (Chromium), where node:crypto is unavailable.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const bitLen = bytes.length * 8
  const withOne = bytes.length + 1
  const total = withOne + ((56 - (withOne % 64)) + 64) % 64 + 8
  const padded = new Uint8Array(total)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false)
  view.setUint32(total - 4, bitLen >>> 0, false)

  const w = new Uint32Array(64)
  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = H as unknown as number[]
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25)
      const ch = (e! & f!) ^ (~e! & g!)
      const t1 = (h! + S1 + ch + K[i]! + w[i]!) >>> 0
      const S0 = rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22)
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!)
      const t2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d! + t1) >>> 0
      d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    H[0] = (H[0]! + a!) >>> 0; H[1] = (H[1]! + b!) >>> 0
    H[2] = (H[2]! + c!) >>> 0; H[3] = (H[3]! + d!) >>> 0
    H[4] = (H[4]! + e!) >>> 0; H[5] = (H[5]! + f!) >>> 0
    H[6] = (H[6]! + g!) >>> 0; H[7] = (H[7]! + h!) >>> 0
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('')
}

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0
}

/** Hash any value using canonical JSON so key order cannot change the result. */
export function hashObject(value: unknown): string {
  return sha256Hex(canonicalize(value))
}
```

- [ ] **Step 6: Implement `src/shared/ids.ts` and `src/shared/index.ts`**

```ts
// src/shared/ids.ts
export function makeId(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(2, '0')}`
}
```

```ts
// src/shared/index.ts
export * from './rng'
export * from './ids'
export { canonicalize } from './canonical-json'
export { sha256Hex, hashObject } from './hash'
```

> **`hashObject` lives in `hash.ts`, not `index.ts`.** It is defined beside `sha256Hex` because it is the same concern (hashing) and because the test imports it from `@/shared/hash`. `index.ts` only re-exports it. Consumers import it either way: `@/shared/hash` (the test) and `@/shared` (the barrel, used by Tasks 5, 7, and 10).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/shared`
Expected: PASS.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/shared tests/shared
git commit -m "feat: shared primitives (SeededRandom, canonical JSON, SHA-256, ids)"
```

---

### Task 3: Timeline — units, conversions, voice, music, master

**Files:**
- Create: `src/timeline/units.ts`, `convert.ts`, `voice.ts`, `music.ts`, `diagnostics.ts`, `master.ts`, `index.ts`
- Test: `tests/timeline/convert.test.ts`, `tests/timeline/master.test.ts`

**Interfaces:**
- Consumes: nothing (self-contained; `shared` not required at this layer).
- Produces:
  - `type Seconds`, `Milliseconds`, `Frames` (branded) + `seconds()`, `milliseconds()`, `frames()`
  - `secondsToFrames(v, fps)`, `framesToSeconds(v, fps)`, `msToFrames(v, fps)`, `framesToMs(v, fps)`, `beatToFrame(beat, bpm, fps)`
  - `type TimingSource`, `WordTiming`, `VoiceSegment`, `VoiceTimeline`
  - `type MusicSection`, `MusicEvent`, `MusicTimeline`
  - `type DiagnosticSeverity`, `Diagnostic`
  - `type SceneWindow`, `MasterEvent`, `MasterTimeline`, `VoiceScenePolicy`, `BuildMasterTimelineInput`
  - `buildMasterTimeline(input): MasterTimeline`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/timeline/convert.test.ts
import { describe, it, expect } from 'vitest'
import { secondsToFrames, framesToSeconds, msToFrames, beatToFrame } from '@/timeline/convert'

describe('secondsToFrames', () => {
  it('is exact at 30fps for whole seconds', () => {
    expect(secondsToFrames(6, 30)).toBe(180)
  })
  it('rounds half up at 30fps', () => {
    expect(secondsToFrames(0.05, 30)).toBe(2) // 1.5 -> 2
  })
  it('is the single rounding policy (round, not floor/ceil)', () => {
    expect(secondsToFrames(1.02, 30)).toBe(31) // 30.6 -> 31 (floor would be 30)
  })
  it('returns an integer for 29.97fps', () => {
    expect(Number.isInteger(secondsToFrames(9, 29.97))).toBe(true)
  })
})

describe('inverse and derived conversions', () => {
  it('framesToSeconds is the inverse ratio', () => {
    expect(framesToSeconds(180, 30)).toBe(6)
  })
  it('msToFrames converts through seconds with the same policy', () => {
    expect(msToFrames(1500, 30)).toBe(45)
  })
  it('beatToFrame maps beats deterministically', () => {
    expect(beatToFrame(4, 120, 30)).toBe(60) // 4 beats @120bpm = 2s = 60 frames
  })
})
```

```ts
// tests/timeline/master.test.ts
import { describe, it, expect } from 'vitest'
import { buildMasterTimeline } from '@/timeline/master'
import type { VoiceTimeline } from '@/timeline/voice'

describe('buildMasterTimeline', () => {
  it('accumulates scene windows contiguously with no gaps', () => {
    const mt = buildMasterTimeline({
      fps: 30, width: 1920, height: 1080,
      scenes: [
        { sceneId: 'scene-01', duration: 6 },
        { sceneId: 'scene-02', duration: 9 },
        { sceneId: 'scene-03', duration: 9 },
        { sceneId: 'scene-04', duration: 6 },
      ],
      voiceScenePolicy: 'strict',
    })
    expect(mt.sceneWindows['scene-01']).toEqual({ startFrame: 0, durationInFrames: 180 })
    expect(mt.sceneWindows['scene-02']).toEqual({ startFrame: 180, durationInFrames: 270 })
    expect(mt.sceneWindows['scene-03']).toEqual({ startFrame: 450, durationInFrames: 270 })
    expect(mt.sceneWindows['scene-04']).toEqual({ startFrame: 720, durationInFrames: 180 })
    expect(mt.totalFrames).toBe(900)
  })

  it('has no gap and no overlap at 29.97fps (Review Focus #5)', () => {
    const mt = buildMasterTimeline({
      fps: 29.97, width: 1920, height: 1080,
      scenes: [{ sceneId: 'a', duration: 2.5 }, { sceneId: 'b', duration: 3.3 }, { sceneId: 'c', duration: 1.7 }],
      voiceScenePolicy: 'strict',
    })
    let cursor = 0
    for (const id of ['a', 'b', 'c']) {
      const w = mt.sceneWindows[id]!
      expect(w.startFrame).toBe(cursor)
      cursor += w.durationInFrames
    }
    expect(cursor).toBe(mt.totalFrames)
  })

  it('strict policy keeps window and warns when voice overruns (Review Focus #3)', () => {
    const voice: VoiceTimeline = {
      timingSource: 'fixture', totalMs: 8000,
      segments: [{ id: 's1', text: 'hi', startMs: 0, endMs: 8000, words: [], timingSource: 'fixture', sceneId: 'scene-01' }],
    }
    const mt = buildMasterTimeline({
      fps: 30, width: 1920, height: 1080,
      scenes: [{ sceneId: 'scene-01', duration: 6 }], voice, voiceScenePolicy: 'strict',
    })
    expect(mt.sceneWindows['scene-01']!.durationInFrames).toBe(180)
    expect(mt.diagnostics.some((d) => d.code === 'VOICE_OVERRUNS_SCENE')).toBe(true)
  })

  it('emits VOICE_UNKNOWN_SCENE for a segment pointing at a missing scene', () => {
    const voice: VoiceTimeline = {
      timingSource: 'fixture', totalMs: 1000,
      segments: [{ id: 's1', text: 'x', startMs: 0, endMs: 1000, words: [], timingSource: 'fixture', sceneId: 'ghost' }],
    }
    const mt = buildMasterTimeline({
      fps: 30, width: 1920, height: 1080, scenes: [{ sceneId: 'scene-01', duration: 6 }], voice, voiceScenePolicy: 'strict',
    })
    expect(mt.diagnostics.some((d) => d.code === 'VOICE_UNKNOWN_SCENE')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/timeline`
Expected: FAIL.

- [ ] **Step 3: Implement `src/timeline/units.ts` and `convert.ts`**

```ts
// src/timeline/units.ts
declare const brand: unique symbol
type Brand<T, B> = T & { readonly [brand]: B }

export type Seconds = Brand<number, 'Seconds'>
export type Milliseconds = Brand<number, 'Milliseconds'>
export type Frames = Brand<number, 'Frames'>

export const seconds = (n: number): Seconds => n as Seconds
export const milliseconds = (n: number): Milliseconds => n as Milliseconds
export const frames = (n: number): Frames => n as Frames
```

```ts
// src/timeline/convert.ts
/**
 * The ONE canonical seconds→frames policy for the whole system.
 * Do not reimplement time conversion anywhere else.
 */
export function secondsToFrames(value: number, fps: number): number {
  return Math.round(value * fps)
}
export function framesToSeconds(value: number, fps: number): number {
  return value / fps
}
export function msToFrames(value: number, fps: number): number {
  return Math.round((value / 1000) * fps)
}
export function framesToMs(value: number, fps: number): number {
  return (value / fps) * 1000
}
export function beatToFrame(beat: number, bpm: number, fps: number): number {
  return Math.round((beat / bpm) * 60 * fps)
}
```

- [ ] **Step 4: Implement `src/timeline/voice.ts`, `music.ts`, `diagnostics.ts`**

```ts
// src/timeline/voice.ts
export type TimingSource = 'exact' | 'estimated' | 'fixture'
export type WordTiming = { word: string; startMs: number; endMs: number }

export type VoiceSegment = {
  id: string
  text: string
  startMs: number
  endMs: number
  /** Empty when timingSource is "estimated" — estimated timing is never exact. */
  words: WordTiming[]
  timingSource: TimingSource
  /** Explicit mapping to a scene — never inferred from a duration ratio. */
  sceneId: string
}

export type VoiceTimeline = {
  segments: VoiceSegment[]
  totalMs: number
  timingSource: TimingSource
}
```

```ts
// src/timeline/music.ts
export type MusicSection = { id: string; startBeat: number; endBeat: number; energy: number }
export type MusicEvent = { atBeat: number; kind: string; payload: Record<string, unknown> }
export type MusicTimeline = { bpm: number; sections: MusicSection[]; events: MusicEvent[] }
```

```ts
// src/timeline/diagnostics.ts
export type DiagnosticSeverity = 'error' | 'warning' | 'info'
export type Diagnostic = {
  severity: DiagnosticSeverity
  code: string
  message: string
  sceneId?: string
  layerId?: string
}
```

- [ ] **Step 5: Implement `src/timeline/master.ts`**

```ts
import { secondsToFrames, msToFrames, beatToFrame } from './convert'
import type { VoiceTimeline } from './voice'
import type { MusicTimeline } from './music'
import type { Diagnostic } from './diagnostics'

export type SceneWindow = { startFrame: number; durationInFrames: number }
export type MasterEvent = { atFrame: number; scope: 'global' | string; kind: string; payload: Record<string, unknown> }

export type MasterTimeline = {
  fps: number
  width: number
  height: number
  totalFrames: number
  sceneWindows: Record<string, SceneWindow>
  voice: VoiceTimeline | null
  music: MusicTimeline | null
  events: MasterEvent[]
  diagnostics: Diagnostic[]
}

export type VoiceScenePolicy = 'strict' | 'extend_to_voice' | 'stretch_to_voice'

export type BuildMasterTimelineInput = {
  fps: number
  width: number
  height: number
  scenes: { sceneId: string; duration: number }[]
  voice?: VoiceTimeline | null
  music?: MusicTimeline | null
  voiceScenePolicy: VoiceScenePolicy
  globalEvents?: Omit<MasterEvent, 'scope'>[]
}

export function buildMasterTimeline(input: BuildMasterTimelineInput): MasterTimeline {
  const { fps } = input
  const diagnostics: Diagnostic[] = []

  // Contiguous integer-frame accumulation — never round cumulative seconds,
  // which would introduce gaps/overlaps at 29.97fps.
  const sceneWindows: Record<string, SceneWindow> = {}
  let cursor = 0
  for (const scene of input.scenes) {
    const durationInFrames = secondsToFrames(scene.duration, fps)
    sceneWindows[scene.sceneId] = { startFrame: cursor, durationInFrames }
    cursor += durationInFrames
  }
  const totalFrames = cursor

  const voice = input.voice ?? null
  if (voice) {
    for (const segment of voice.segments) {
      const window = sceneWindows[segment.sceneId]
      if (!window) {
        diagnostics.push({
          severity: 'error', code: 'VOICE_UNKNOWN_SCENE', sceneId: segment.sceneId,
          message: `Voice segment "${segment.id}" references unknown scene "${segment.sceneId}".`,
        })
        continue
      }
      if (segment.timingSource === 'estimated') {
        diagnostics.push({
          severity: 'warning', code: 'VOICE_ESTIMATED_TIMING', sceneId: segment.sceneId,
          message: `Voice segment "${segment.id}" uses estimated timing; it is not exact.`,
        })
      }
      // Under "strict" the scene window is authoritative: overrun is reported, never absorbed.
      if (msToFrames(segment.endMs, fps) > window.durationInFrames && input.voiceScenePolicy === 'strict') {
        diagnostics.push({
          severity: 'warning', code: 'VOICE_OVERRUNS_SCENE', sceneId: segment.sceneId,
          message: `Voice segment "${segment.id}" ends after scene "${segment.sceneId}" window under "strict" policy.`,
        })
      }
    }
  }

  const events: MasterEvent[] = (input.globalEvents ?? []).map((e) => ({ ...e, scope: 'global' as const }))
  if (input.music) {
    for (const me of input.music.events) {
      events.push({ atFrame: beatToFrame(me.atBeat, input.music.bpm, fps), scope: 'global', kind: me.kind, payload: me.payload })
    }
  }

  return { fps, width: input.width, height: input.height, totalFrames, sceneWindows, voice, music: input.music ?? null, events, diagnostics }
}
```

- [ ] **Step 6: Implement `src/timeline/index.ts`**

```ts
export * from './units'
export * from './convert'
export * from './voice'
export * from './music'
export * from './diagnostics'
export * from './master'
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run tests/timeline && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/timeline tests/timeline
git commit -m "feat: timeline units, conversions, voice/music/master timeline"
```

---

### Task 4: Scene DSL schema (Zod, strict)

**Files:**
- Create: `src/video-engine/schema/scene-dsl.ts`, `src/video-engine/schema/index.ts`
- Test: `tests/video-engine/schema.test.ts`

**Interfaces:**
- Consumes: `zod` only — this is the AI-facing input contract.
- Produces:
  - `SCENE_DSL_VERSION = '0.1'`
  - `SceneDSLSchema`/`type SceneDSL` (one scene), `ProjectDSLSchema`/`type ProjectDsl` (the project wrapper AI emits)
  - `parseSceneDsl(value): SceneDSL`, `parseProjectDsl(value): ProjectDsl` (throw with a readable zod message)
  - `type ScenePurpose`, `RendererKind`, `CompositionId`, `JsonObject`
  - `VisualLayerSpecSchema`/`type VisualLayerSpec`, `MotionLayerSpecSchema`/`MotionLayerSpec`, `TypographySpecSchema`/`TypographySpec`, `AudioCueSpecSchema`/`AudioCueSpec`, `SceneEventSpecSchema`/`SceneEventSpec`, `StyleRefSchema`/`StyleRef`, `VoiceScenePolicySchema`/`VoiceScenePolicy`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/video-engine/schema.test.ts
import { describe, it, expect } from 'vitest'
import { SceneDSLSchema, ProjectDSLSchema, parseProjectDsl, type SceneDSL } from '@/video-engine/schema'

const validScene: SceneDSL = {
  schemaVersion: '0.1',
  sceneId: 'scene-01',
  purpose: 'hook',
  duration: 6,
  composition: 'hero',
  visual: [{ recipe: 'particle-field', params: { count: 40 } }],
  motion: [{ recipe: 'fade', params: {} }],
  typography: { text: 'Deploy in seconds', animation: 'reveal' },
  audio: [],
  events: [],
  style: { styleId: 'default' },
  seed: 12345,
}

describe('SceneDSLSchema', () => {
  it('accepts a valid scene', () => {
    expect(SceneDSLSchema.safeParse(validScene).success).toBe(true)
  })
  it('rejects unknown top-level fields (strict)', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, renderer: 'three' }).success).toBe(false)
  })
  it('accepts the optional backdropRenderer', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, backdropRenderer: 'three' }).success).toBe(true)
  })
  it('rejects an unknown purpose', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, purpose: 'nope' }).success).toBe(false)
  })
  it('rejects a non-positive duration', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, duration: 0 }).success).toBe(false)
  })
  it('rejects a NaN duration (Review Focus #1)', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, duration: NaN }).success).toBe(false)
  })
  it('rejects Infinity duration (Review Focus #1)', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, duration: Infinity }).success).toBe(false)
  })
  it('rejects a non-array visual', () => {
    expect(SceneDSLSchema.safeParse({ ...validScene, visual: 'const x = 1' }).success).toBe(false)
  })
  it('defaults empty arrays and null typography when omitted', () => {
    const minimal = { ...validScene }
    delete (minimal as Record<string, unknown>).visual
    delete (minimal as Record<string, unknown>).motion
    const parsed = SceneDSLSchema.safeParse(minimal)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.visual).toEqual([])
      expect(parsed.data.typography).toBeNull()
    }
  })
})

describe('ProjectDSLSchema', () => {
  it('accepts a project wrapping two scenes and defaults the voice policy to strict', () => {
    const project = {
      dslVersion: '0.1',
      project: { id: 'p1', title: 'Demo', language: 'vi' },
      render: { fps: 30, width: 1920, height: 1080 },
      seed: 1,
      music: null,
      scenes: [validScene, { ...validScene, sceneId: 'scene-02' }],
    }
    const parsed = ProjectDSLSchema.safeParse(project)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.voiceScenePolicy).toBe('strict')
  })
  it('rejects an empty scene list', () => {
    const parsed = ProjectDSLSchema.safeParse({
      dslVersion: '0.1', project: { id: 'p1', title: 'Demo', language: 'vi' },
      render: { fps: 30, width: 1920, height: 1080 }, seed: 1, scenes: [],
    })
    expect(parsed.success).toBe(false)
  })
  it('parseProjectDsl throws a readable error on bad input', () => {
    expect(() => parseProjectDsl({ dslVersion: '9.9' })).toThrow(/Invalid project DSL/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/video-engine/schema.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/video-engine/schema/scene-dsl.ts`**

```ts
import { z } from 'zod'

export const SCENE_DSL_VERSION = '0.1' as const

export const ScenePurposeSchema = z.enum([
  'hook', 'explain_network', 'explain_concept', 'demonstrate',
  'compare', 'data_reveal', 'summary', 'outro',
])
export type ScenePurpose = z.infer<typeof ScenePurposeSchema>

export const RendererKindSchema = z.enum(['dom', 'canvas2d', 'three'])
export type RendererKind = z.infer<typeof RendererKindSchema>

/** Ids are opaque here; the compiler validates existence against the registry. */
export const CompositionIdSchema = z.string().min(1)
export type CompositionId = z.infer<typeof CompositionIdSchema>

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)]),
)
export const JsonObjectSchema = z.record(JsonValueSchema)
export type JsonObject = Record<string, unknown>

export const VisualLayerSpecSchema = z
  .object({
    /** Optional stable layer id; motion `target` matches exactly this. Defaults to `${sceneId}-visual-${index}`. */
    id: z.string().min(1).optional(),
    recipe: z.string().min(1),
    params: JsonObjectSchema.default({}),
    slot: z.string().min(1).optional(),
  })
  .strict()
export type VisualLayerSpec = z.infer<typeof VisualLayerSpecSchema>

export const MotionLayerSpecSchema = z
  .object({ recipe: z.string().min(1), params: JsonObjectSchema.default({}), target: z.string().min(1).optional() })
  .strict()
export type MotionLayerSpec = z.infer<typeof MotionLayerSpecSchema>

export const TypographySpecSchema = z
  .object({
    text: z.string(),
    animation: z.enum(['none', 'fade', 'reveal', 'typewriter', 'word-by-word']).default('fade'),
    slot: z.string().min(1).optional(),
    /** Seconds from scene start. Omitted = whole scene. */
    startSeconds: z.number().min(0).finite().optional(),
    durationSeconds: z.number().positive().finite().optional(),
  })
  .strict()
export type TypographySpec = z.infer<typeof TypographySpecSchema>

export const AudioCueSpecSchema = z
  .object({ at: z.number().min(0).finite(), cue: z.string().min(1), params: JsonObjectSchema.default({}) })
  .strict()
export type AudioCueSpec = z.infer<typeof AudioCueSpecSchema>

export const SceneEventSpecSchema = z
  .object({ at: z.number().min(0).finite(), kind: z.string().min(1), payload: JsonObjectSchema.default({}) })
  .strict()
export type SceneEventSpec = z.infer<typeof SceneEventSpecSchema>

export const StyleRefSchema = z.union([
  z.object({ styleId: z.string().min(1) }).strict(),
  z.object({ tokens: JsonObjectSchema }).strict(),
])
export type StyleRef = z.infer<typeof StyleRefSchema>

export const SceneDSLSchema = z
  .object({
    schemaVersion: z.literal(SCENE_DSL_VERSION),
    sceneId: z.string().min(1),
    purpose: ScenePurposeSchema,
    duration: z.number().positive().finite(),
    composition: CompositionIdSchema,
    backdropRenderer: RendererKindSchema.optional(),
    visual: z.array(VisualLayerSpecSchema).default([]),
    motion: z.array(MotionLayerSpecSchema).default([]),
    typography: TypographySpecSchema.nullable().default(null),
    audio: z.array(AudioCueSpecSchema).default([]),
    events: z.array(SceneEventSpecSchema).default([]),
    style: StyleRefSchema,
    seed: z.number().int().finite(),
  })
  .strict()
export type SceneDSL = z.infer<typeof SceneDSLSchema>

/** Mirrors the timeline's `VoiceScenePolicy` without importing it (no schema → timeline edge). */
export const VoiceScenePolicySchema = z.enum(['strict', 'extend_to_voice', 'stretch_to_voice'])
export type VoiceScenePolicy = z.infer<typeof VoiceScenePolicySchema>

export const MusicSpecSchema = z
  .object({ bpm: z.number().positive().finite(), style: z.string().min(1).optional() })
  .strict()
export type MusicSpec = z.infer<typeof MusicSpecSchema>

export const ProjectDSLSchema = z
  .object({
    dslVersion: z.literal(SCENE_DSL_VERSION),
    project: z.object({ id: z.string().min(1), title: z.string().min(1), language: z.string().min(2) }).strict(),
    render: z
      .object({ fps: z.number().positive().finite(), width: z.number().int().positive(), height: z.number().int().positive() })
      .strict(),
    style: StyleRefSchema.default({ styleId: 'default' }),
    seed: z.number().int().finite(),
    voiceScenePolicy: VoiceScenePolicySchema.default('strict'),
    music: MusicSpecSchema.nullable().default(null),
    scenes: z.array(SceneDSLSchema).min(1),
  })
  .strict()
export type ProjectDsl = z.infer<typeof ProjectDSLSchema>

export function parseSceneDsl(value: unknown): SceneDSL {
  const result = SceneDSLSchema.safeParse(value)
  if (!result.success) throw new Error(`Invalid scene DSL:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`)
  return result.data
}

export function parseProjectDsl(value: unknown): ProjectDsl {
  const result = ProjectDSLSchema.safeParse(value)
  if (!result.success) throw new Error(`Invalid project DSL:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`)
  return result.data
}
```

- [ ] **Step 4: Implement `src/video-engine/schema/index.ts`**

```ts
export * from './scene-dsl'
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/video-engine/schema.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/video-engine/schema tests/video-engine/schema.test.ts
git commit -m "feat: Scene DSL v0 Zod schema"
```

---

### Task 5: Compiled IR types and non-circular compiledHash

**Files:**
- Create: `src/video-engine/version.ts`, `src/video-engine/ir/types.ts`, `src/video-engine/ir/hash.ts`, `src/video-engine/ir/index.ts`
- Test: `tests/video-engine/ir.test.ts`

**Interfaces:**
- Consumes: `@/video-engine/schema` (for `CompositionId`, `RendererKind`, `JsonObject`), `@/timeline/diagnostics`, `@/shared`.
- Produces:
  - `ENGINE_VERSION = '0.1.0'`, `IR_VERSION = '0.1'`
  - `type LayerFrameWindow`, `SceneTiming`, `RenderSettings`, `AssetRef`, `CompiledMotion`, `CompiledLayer`, `CompiledTypography`, `CompiledEvent`, `CompiledAudioCue`, `Provenance`, `CompiledScene`
  - `computeCompiledHash(scene: CompiledScene): string`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/video-engine/ir.test.ts
import { describe, it, expect } from 'vitest'
import { computeCompiledHash, type CompiledScene, type CompiledLayer } from '@/video-engine/ir'

const layer: CompiledLayer = {
  id: 'l1', layerKind: 'visual', recipeId: 'particle-field', recipeVersion: '1.0.0',
  renderer: 'canvas2d', slot: 'main', frameWindow: { from: 0, durationInFrames: 180 },
  params: { a: 1, b: 2 }, motion: [], zIndex: 0, assetRefs: [],
}

const scene: CompiledScene = {
  irVersion: '0.1', sceneId: 'scene-01', seed: 1,
  render: { fps: 30, width: 1920, height: 1080 },
  timing: { startFrame: 0, durationInFrames: 180 },
  composition: { id: 'hero', slots: ['main'] },
  layers: [layer], typography: null, events: [], audio: [], diagnostics: [],
  provenance: { engineVersion: '0.1.0', sourceHash: 'abc', compiledHash: '' },
}

describe('computeCompiledHash', () => {
  it('ignores the existing provenance.compiledHash (no circularity)', () => {
    const a = computeCompiledHash(scene)
    const b = computeCompiledHash({ ...scene, provenance: { ...scene.provenance, compiledHash: 'deadbeef' } })
    expect(a).toBe(b)
  })
  it('changes when IR content changes', () => {
    const a = computeCompiledHash(scene)
    const b = computeCompiledHash({ ...scene, timing: { startFrame: 0, durationInFrames: 181 } })
    expect(a).not.toBe(b)
  })
  it('is order-independent for params keys', () => {
    const withB = { ...scene, layers: [{ ...layer, params: { b: 2, a: 1 } }] } as CompiledScene
    expect(computeCompiledHash(scene)).toBe(computeCompiledHash(withB))
  })
  it('is not order-independent for the layers array (order is semantic)', () => {
    const two = { ...scene, layers: [layer, { ...layer, id: 'l2', zIndex: 1 }] } as CompiledScene
    const twoSwapped = { ...scene, layers: [{ ...layer, id: 'l2', zIndex: 1 }, layer] } as CompiledScene
    expect(computeCompiledHash(two)).not.toBe(computeCompiledHash(twoSwapped))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/video-engine/ir.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/video-engine/version.ts`**

```ts
export const ENGINE_VERSION = '0.1.0'
export const IR_VERSION = '0.1' as const
```

- [ ] **Step 4: Implement `src/video-engine/ir/types.ts`**

```ts
import type { CompositionId, JsonObject, RendererKind } from '@/video-engine/schema'
import type { Diagnostic } from '@/timeline/diagnostics'

export type LayerFrameWindow = { from: number; durationInFrames: number }
export type SceneTiming = { startFrame: number; durationInFrames: number }
export type RenderSettings = { fps: number; width: number; height: number }

export type AssetRef = { id: string; version?: string; contentHash?: string }

export type CompiledMotion = {
  recipeId: string
  recipeVersion: string
  frameWindow: LayerFrameWindow
  params: JsonObject
}

export type CompiledLayer = {
  id: string
  layerKind: 'visual' | 'effect' | 'text' | 'media'
  recipeId: string
  recipeVersion: string
  renderer: RendererKind
  slot: string
  frameWindow: LayerFrameWindow
  /** Defaults already applied by the compiler; runtime must not resolve defaults. */
  params: JsonObject
  motion: CompiledMotion[]
  zIndex: number
  assetRefs: AssetRef[]
  backdrop?: boolean
}

export type CompiledTypography = {
  text: string
  animation: 'none' | 'fade' | 'reveal' | 'typewriter' | 'word-by-word'
  slot: string
  frameWindow: LayerFrameWindow
}

export type CompiledEvent = { atFrame: number; kind: string; payload: JsonObject }
export type CompiledAudioCue = { atFrame: number; durationInFrames: number; cue: JsonObject }

export type Provenance = { engineVersion: string; sourceHash: string; compiledHash: string }

export type CompiledScene = {
  irVersion: '0.1'
  sceneId: string
  seed: number
  render: RenderSettings
  timing: SceneTiming
  composition: { id: CompositionId; slots: string[] }
  layers: CompiledLayer[]
  typography: CompiledTypography | null
  events: CompiledEvent[]
  audio: CompiledAudioCue[]
  diagnostics: Diagnostic[]
  provenance: Provenance
}
```

- [ ] **Step 5: Implement `src/video-engine/ir/hash.ts`**

```ts
import { hashObject } from '@/shared'
import { ENGINE_VERSION } from '@/video-engine/version'
import type { CompiledScene } from './types'

/**
 * Hash of the canonical IR with provenance.compiledHash excluded.
 * This is what determinism is judged on: compile(input) twice must match.
 */
export function computeCompiledHash(scene: CompiledScene): string {
  return hashObject({
    ...scene,
    provenance: { engineVersion: ENGINE_VERSION, sourceHash: scene.provenance.sourceHash },
  })
}
```

- [ ] **Step 6: Implement `src/video-engine/ir/index.ts`**

```ts
export * from './types'
export { computeCompiledHash } from './hash'
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run tests/video-engine/ir.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/video-engine/version.ts src/video-engine/ir tests/video-engine/ir.test.ts
git commit -m "feat: compiled Scene IR types + non-circular compiledHash"
```

---

### Task 6: Registry and composition primitives

**Files:**
- Create: `src/video-engine/registry/types.ts`, `factories.ts`, `registry.ts`, `renderer-backends.ts`, `register.ts`, `index.ts`
- Create: `src/video-engine/compositions/layouts.ts`, `defs.ts`, `register.ts`, `index.ts`
- Test: `tests/video-engine/registry.test.ts`, `tests/video-engine/compositions.test.ts`

**Interfaces:**
- Consumes: `@/video-engine/schema`, `@/video-engine/ir`, `zod`.
- Produces:
  - `type VisualRecipe<P>`, `MotionRecipe<P>`, `CompositionDef`, `SlotDef`, `SlotRect`, `RenderSize`, `StyleTokens`, `LayoutArgs`, `AvailableRecipes`
  - `createVisualRecipe`, `createMotionRecipe`, `createComposition`
  - `registerVisual`, `registerMotion`, `registerComposition`
  - `resolveVisual`, `resolveMotion`, `resolveComposition` (throw with a clear “Unknown … "id"” message)
  - `hasVisual`, `hasMotion`, `hasComposition`, `listAvailable`, `clearRegistry`
  - `registerRendererBackend`, `getRendererBackend`, `type RendererBackend`, `type RendererBackendProps`, `clearRendererBackends`
  - `COMPOSITIONS`, `registerCompositions()`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/video-engine/registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import {
  createVisualRecipe, registerVisual, resolveVisual, listAvailable, clearRegistry,
  registerMotion, createMotionRecipe, resolveMotion, hasVisual,
} from '@/video-engine/registry'

describe('registry', () => {
  beforeEach(() => clearRegistry())

  it('resolves a registered visual recipe and its renderer', () => {
    registerVisual(createVisualRecipe({
      id: 'demo', version: '1.0.0', renderer: 'canvas2d',
      paramsSchema: z.object({ count: z.number().default(10) }), defaults: {},
    }))
    expect(resolveVisual('demo').renderer).toBe('canvas2d')
    expect(hasVisual('demo')).toBe(true)
  })

  it('throws a clear error for an unknown visual id (Review Focus #2)', () => {
    expect(() => resolveVisual('missing')).toThrow(/Unknown visual recipe "missing"/)
  })

  it('throws on duplicate registration', () => {
    const r = createVisualRecipe({ id: 'dup', version: '1.0.0', renderer: 'dom', paramsSchema: z.object({}), defaults: {} })
    registerVisual(r)
    expect(() => registerVisual(r)).toThrow(/Duplicate/)
  })

  it('lists available recipes as metadata only', () => {
    registerVisual(createVisualRecipe({ id: 'r1', version: '1.0.0', renderer: 'dom', paramsSchema: z.object({}), defaults: {} }))
    registerMotion(createMotionRecipe({ id: 'm1', version: '1.0.0', paramsSchema: z.object({}), defaults: {} }))
    expect(resolveMotion('m1').id).toBe('m1')
    const available = listAvailable()
    expect(available.visual.map((v) => v.id)).toContain('r1')
    expect(Object.keys(available.visual[0]!)).not.toContain('paramsSchema')
  })
})
```

```ts
// tests/video-engine/compositions.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { clearRegistry, resolveComposition } from '@/video-engine/registry'
import { registerCompositions } from '@/video-engine/compositions'

const RENDER = { width: 1920, height: 1080 }

describe('composition primitives', () => {
  beforeEach(() => { clearRegistry(); registerCompositions() })

  it('exposes the nine Phase 0 compositions', () => {
    for (const id of ['hero', 'centered', 'full-screen', 'split', 'grid', 'comparison', 'cards', 'media-text', 'data']) {
      expect(resolveComposition(id).id).toBe(id)
    }
  })
  it('hero fills the frame with one slot', () => {
    expect(resolveComposition('hero').layout({ slots: ['main'], render: RENDER, style: {} })[0]).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080 })
  })
  it('split produces two side-by-side slots that do not overlap', () => {
    const rects = resolveComposition('split').layout({ slots: ['main', 'aside'], render: RENDER, style: {} })
    expect(rects).toHaveLength(2)
    expect(rects[0]!.x + rects[0]!.width).toBeLessThanOrEqual(rects[1]!.x)
  })
  it('grid returns one rect per requested slot', () => {
    const rects = resolveComposition('grid').layout({ slots: ['a', 'b', 'c', 'd'], render: RENDER, style: {} })
    expect(rects).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/video-engine/registry.test.ts tests/video-engine/compositions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/video-engine/registry/types.ts`**

```ts
import type { z } from 'zod'
import type { JsonObject, RendererKind } from '@/video-engine/schema'

export type VisualRecipe<P extends JsonObject = JsonObject> = {
  id: string
  version: string
  /** The registry — never the DSL — decides which renderer a recipe runs on. */
  renderer: RendererKind
  paramsSchema: z.ZodType<P>
  defaults: Partial<P>
  plannedDurationHint?: number
}

export type MotionRecipe<P extends JsonObject = JsonObject> = {
  id: string
  version: string
  paramsSchema: z.ZodType<P>
  defaults: Partial<P>
}

export type SlotDef = { id: string; role: string }
export type RenderSize = { width: number; height: number }
export type StyleTokens = JsonObject
export type SlotRect = { slot: string; x: number; y: number; width: number; height: number }
export type LayoutArgs = { slots: string[]; render: RenderSize; style: StyleTokens }

export type CompositionDef = {
  id: string
  version: string
  slots: SlotDef[]
  layout: (args: LayoutArgs) => SlotRect[]
}

export type RecipeMetadata = { id: string; version: string; renderer?: RendererKind }
export type AvailableRecipes = {
  visual: RecipeMetadata[]
  motion: RecipeMetadata[]
  composition: RecipeMetadata[]
}
```

- [ ] **Step 4: Implement `src/video-engine/registry/registry.ts`**

```ts
import type { AvailableRecipes, CompositionDef, MotionRecipe, VisualRecipe } from './types'

const visualRecipes = new Map<string, VisualRecipe>()
const motionRecipes = new Map<string, MotionRecipe>()
const compositions = new Map<string, CompositionDef>()

const known = (m: Map<string, unknown>) => [...m.keys()].join(', ') || '(none)'

export function registerVisual(recipe: VisualRecipe): void {
  if (visualRecipes.has(recipe.id)) throw new Error(`Duplicate visual recipe "${recipe.id}"`)
  visualRecipes.set(recipe.id, recipe)
}
export function registerMotion(recipe: MotionRecipe): void {
  if (motionRecipes.has(recipe.id)) throw new Error(`Duplicate motion recipe "${recipe.id}"`)
  motionRecipes.set(recipe.id, recipe)
}
export function registerComposition(def: CompositionDef): void {
  if (compositions.has(def.id)) throw new Error(`Duplicate composition "${def.id}"`)
  compositions.set(def.id, def)
}

export function resolveVisual(id: string): VisualRecipe {
  const r = visualRecipes.get(id)
  if (!r) throw new Error(`Unknown visual recipe "${id}". Known: ${known(visualRecipes)}`)
  return r
}
export function resolveMotion(id: string): MotionRecipe {
  const r = motionRecipes.get(id)
  if (!r) throw new Error(`Unknown motion recipe "${id}". Known: ${known(motionRecipes)}`)
  return r
}
export function resolveComposition(id: string): CompositionDef {
  const c = compositions.get(id)
  if (!c) throw new Error(`Unknown composition "${id}". Known: ${known(compositions)}`)
  return c
}

export const hasVisual = (id: string): boolean => visualRecipes.has(id)
export const hasMotion = (id: string): boolean => motionRecipes.has(id)
export const hasComposition = (id: string): boolean => compositions.has(id)

export function listAvailable(): AvailableRecipes {
  return {
    visual: [...visualRecipes.values()].map((r) => ({ id: r.id, version: r.version, renderer: r.renderer })),
    motion: [...motionRecipes.values()].map((r) => ({ id: r.id, version: r.version })),
    composition: [...compositions.values()].map((c) => ({ id: c.id, version: c.version })),
  }
}

export function clearRegistry(): void {
  visualRecipes.clear()
  motionRecipes.clear()
  compositions.clear()
}
```

- [ ] **Step 5: Implement `src/video-engine/registry/factories.ts` and `renderer-backends.ts`**

```ts
// src/video-engine/registry/factories.ts
import type { CompositionDef, MotionRecipe, VisualRecipe } from './types'

export function createVisualRecipe<P extends Record<string, unknown>>(r: VisualRecipe<P>): VisualRecipe {
  return r as VisualRecipe
}
export function createMotionRecipe<P extends Record<string, unknown>>(r: MotionRecipe<P>): MotionRecipe {
  return r as MotionRecipe
}
export function createComposition(def: CompositionDef): CompositionDef {
  return def
}
```

```ts
// src/video-engine/registry/renderer-backends.ts
import type { RendererKind } from '@/video-engine/schema'
import type { CompiledLayer, RenderSettings } from '@/video-engine/ir'

export type RendererBackendProps = {
  layer: CompiledLayer
  /** Absolute master-timeline frame for the current render tick. */
  absoluteFrame: number
  render: RenderSettings
  seed: number
}

export type RendererBackend = (props: RendererBackendProps) => unknown

const backends = new Map<RendererKind, RendererBackend>()

export function registerRendererBackend(kind: RendererKind, backend: RendererBackend): void {
  backends.set(kind, backend)
}
export function getRendererBackend(kind: RendererKind): RendererBackend {
  const b = backends.get(kind)
  if (!b) throw new Error(`No renderer backend registered for "${kind}"`)
  return b
}
/** Non-throwing probe, used by QA layer 5 to report a missing backend as a diagnostic. */
export const hasRendererBackend = (kind: RendererKind): boolean => backends.has(kind)
export function clearRendererBackends(): void {
  backends.clear()
}
```

- [ ] **Step 6: Implement `src/video-engine/compositions/layouts.ts`**

```ts
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
```

- [ ] **Step 7: Implement `src/video-engine/compositions/defs.ts` and `register.ts`**

```ts
// src/video-engine/compositions/defs.ts
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
```

```ts
// src/video-engine/compositions/register.ts
import { registerComposition } from '@/video-engine/registry/registry'
import { COMPOSITIONS } from './defs'

export function registerCompositions(): void {
  for (const def of COMPOSITIONS) registerComposition(def)
}
```

- [ ] **Step 8: Implement `index.ts` files and the explicit `register.ts`**

```ts
// src/video-engine/registry/index.ts
export * from './types'
export * from './registry'
export * from './factories'
export * from './renderer-backends'
```

```ts
// src/video-engine/compositions/index.ts
export * from './defs'
export * from './layouts'
export { registerCompositions } from './register'
```

```ts
// src/video-engine/registry/register.ts
import { registerCompositions } from '@/video-engine/compositions/register'

/**
 * Metadata-only registration entry point. Renderer implementations are wired
 * separately in runtime/register-backends.ts so compiler and registry
 * metadata tests never load Canvas or Three.
 */
export function registerMetadata(): void {
  registerCompositions()
}
export { registerCompositions }
```

- [ ] **Step 9: Run tests and typecheck**

Run: `npx vitest run tests/video-engine && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/video-engine/registry src/video-engine/compositions tests/video-engine/registry.test.ts tests/video-engine/compositions.test.ts
git commit -m "feat: recipe registry + nine composition primitives"
```

---

### Task 7: Scene Compiler

**Files:**
- Create: `src/video-engine/compiler/errors.ts`, `params.ts`, `compile-scene.ts`, `index.ts`
- Test: `tests/video-engine/compiler.test.ts`, `tests/video-engine/fixtures/test-recipes.ts`

**Interfaces:**
- Consumes: `@/video-engine/schema`, `@/video-engine/ir`, `@/video-engine/registry`, `@/timeline`, `@/shared`.
- Produces:
  - `class CompilerError extends Error { diagnostics: Diagnostic[] }`
  - `type CompileSceneInput = { dsl: SceneDSL; timeline: MasterTimeline; assets?: AssetRef[] }`
  - `compileScene(input): CompiledScene`
  - `resolveParams(recipeId, raw, kind?)`, `computeSourceHash(dsl, assets)`

- [ ] **Step 1: Implement the shared test fixture `tests/video-engine/fixtures/test-recipes.ts`**

```ts
import { z } from 'zod'
import { createVisualRecipe, createMotionRecipe, registerVisual, registerMotion, registerRendererBackend } from '@/video-engine/registry'
import { registerCompositions } from '@/video-engine/compositions'

/** Minimal recipes used by compiler tests — no renderer implementations. */
export function registerTestRecipes(): void {
  registerCompositions()
  registerVisual(createVisualRecipe({
    id: 'particle-field', version: '1.0.0', renderer: 'canvas2d',
    paramsSchema: z.object({ count: z.number().int().default(40), hue: z.number().default(200) }), defaults: {},
  }))
  registerVisual(createVisualRecipe({
    id: 'network-graph', version: '1.0.0', renderer: 'three',
    paramsSchema: z.object({ nodes: z.number().int().default(20) }), defaults: {},
  }))
  registerMotion(createMotionRecipe({
    id: 'fade', version: '1.0.0', paramsSchema: z.object({ duration: z.number().default(0.5) }), defaults: {},
  }))
  registerRendererBackend('dom', () => null)
  registerRendererBackend('canvas2d', () => null)
  registerRendererBackend('three', () => null)
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/video-engine/compiler.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { compileScene, CompilerError } from '@/video-engine/compiler'
import { clearRegistry, clearRendererBackends } from '@/video-engine/registry'
import { registerTestRecipes } from './fixtures/test-recipes'
import { buildMasterTimeline } from '@/timeline/master'
import type { SceneDSL } from '@/video-engine/schema'

const timelineFor = (duration: number) =>
  buildMasterTimeline({ fps: 30, width: 1920, height: 1080, scenes: [{ sceneId: 'scene-01', duration }], voiceScenePolicy: 'strict' })

const dsl: SceneDSL = {
  schemaVersion: '0.1', sceneId: 'scene-01', purpose: 'hook', duration: 6, composition: 'split',
  visual: [{ recipe: 'particle-field', params: {} }],
  motion: [{ recipe: 'fade', params: {} }],
  typography: { text: 'Hello', animation: 'reveal' },
  audio: [], events: [], style: { styleId: 'default' }, seed: 12345,
}

describe('compileScene', () => {
  beforeEach(() => { clearRegistry(); clearRendererBackends(); registerTestRecipes() })

  it('binds the absolute scene window from the timeline', () => {
    expect(compileScene({ dsl, timeline: timelineFor(6) }).timing).toEqual({ startFrame: 0, durationInFrames: 180 })
  })
  it('applies registry defaults to recipe params (Review Focus #4)', () => {
    const layer = compileScene({ dsl, timeline: timelineFor(6) }).layers.find((l) => l.recipeId === 'particle-field')!
    expect(layer.params.count).toBe(40)
  })
  it('resolves the layer renderer from the registry, not the DSL', () => {
    const layer = compileScene({ dsl, timeline: timelineFor(6) }).layers.find((l) => l.recipeId === 'particle-field')!
    expect(layer.renderer).toBe('canvas2d')
  })
  it('produces a stable compiledHash across two runs', () => {
    const a = compileScene({ dsl, timeline: timelineFor(6) })
    const b = compileScene({ dsl, timeline: timelineFor(6) })
    expect(a.provenance.compiledHash).toBe(b.provenance.compiledHash)
    expect(a.provenance.compiledHash).toHaveLength(64)
  })
  it('fails with UNKNOWN_COMPOSITION naming the id (Review Focus #2)', () => {
    try { compileScene({ dsl: { ...dsl, composition: 'nope' }, timeline: timelineFor(6) }); throw new Error('no throw') }
    catch (e) {
      expect(e).toBeInstanceOf(CompilerError)
      expect((e as CompilerError).diagnostics.some((d) => d.code === 'UNKNOWN_COMPOSITION')).toBe(true)
    }
  })
  it('fails with UNKNOWN_VISUAL_RECIPE naming the id (Review Focus #2)', () => {
    try { compileScene({ dsl: { ...dsl, visual: [{ recipe: 'missing', params: {} }] }, timeline: timelineFor(6) }); throw new Error('no throw') }
    catch (e) { expect((e as CompilerError).diagnostics.some((d) => d.code === 'UNKNOWN_VISUAL_RECIPE')).toBe(true) }
  })
  it('fails with DURATION_MISMATCH when DSL duration disagrees with the window', () => {
    try { compileScene({ dsl: { ...dsl, duration: 5 }, timeline: timelineFor(6) }); throw new Error('no throw') }
    catch (e) { expect((e as CompilerError).diagnostics.some((d) => d.code === 'DURATION_MISMATCH')).toBe(true) }
  })
  it('never branches on purpose', () => {
    const a = compileScene({ dsl, timeline: timelineFor(6) })
    const b = compileScene({ dsl: { ...dsl, purpose: 'outro' }, timeline: timelineFor(6) })
    expect(a.layers.map((l) => l.recipeId)).toEqual(b.layers.map((l) => l.recipeId))
  })
  it('keeps every layer frameWindow inside the scene window', () => {
    const ir = compileScene({ dsl, timeline: timelineFor(6) })
    for (const l of ir.layers) expect(l.frameWindow.durationInFrames).toBeLessThanOrEqual(ir.timing.durationInFrames)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/video-engine/compiler.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement `src/video-engine/compiler/errors.ts`**

```ts
import type { Diagnostic } from '@/timeline/diagnostics'

export class CompilerError extends Error {
  readonly diagnostics: Diagnostic[]
  constructor(message: string, diagnostics: Diagnostic[]) {
    super(message)
    this.name = 'CompilerError'
    this.diagnostics = diagnostics
  }
}
```

- [ ] **Step 5: Implement `src/video-engine/compiler/params.ts`**

```ts
import { hashObject } from '@/shared'
import { resolveVisual, resolveMotion } from '@/video-engine/registry'
import type { JsonObject, SceneDSL } from '@/video-engine/schema'
import type { AssetRef } from '@/video-engine/ir'

/** Validate raw DSL params and fill registry defaults. Runtime never does this. */
export function resolveParams(recipeId: string, raw: JsonObject, kind: 'visual' | 'motion' = 'visual'): JsonObject {
  const recipe = kind === 'visual' ? resolveVisual(recipeId) : resolveMotion(recipeId)
  const parsed = recipe.paramsSchema.safeParse(raw)
  if (!parsed.success) throw new Error(`Invalid params for ${kind} recipe "${recipeId}": ${parsed.error.message}`)
  return parsed.data as JsonObject
}

export function computeSourceHash(dsl: SceneDSL, assets: AssetRef[]): string {
  return hashObject({
    schemaVersion: dsl.schemaVersion,
    dsl,
    assetFingerprints: assets.map((a) => ({ id: a.id, version: a.version ?? null, contentHash: a.contentHash ?? null })),
  })
}
```

- [ ] **Step 6: Implement `src/video-engine/compiler/compile-scene.ts`**

```ts
import { secondsToFrames } from '@/timeline/convert'
import type { Diagnostic } from '@/timeline/diagnostics'
import type { MasterTimeline } from '@/timeline/master'
import { hasComposition, hasMotion, hasVisual, resolveComposition, resolveMotion, resolveVisual } from '@/video-engine/registry'
import { ENGINE_VERSION, IR_VERSION } from '@/video-engine/version'
import { computeCompiledHash } from '@/video-engine/ir/hash'
import type { AssetRef, CompiledAudioCue, CompiledEvent, CompiledLayer, CompiledScene, CompiledTypography } from '@/video-engine/ir/types'
import type { SceneDSL } from '@/video-engine/schema'
import { CompilerError } from './errors'
import { computeSourceHash, resolveParams } from './params'

export type CompileSceneInput = { dsl: SceneDSL; timeline: MasterTimeline; assets?: AssetRef[] }

const err = (code: string, message: string, sceneId: string): Diagnostic => ({ severity: 'error', code, message, sceneId })

export function compileScene(input: CompileSceneInput): CompiledScene {
  const { dsl, timeline } = input
  const assets = input.assets ?? []
  const diagnostics: Diagnostic[] = []

  // 1. Semantic validation — known composition / recipes.
  if (!hasComposition(dsl.composition)) {
    throw new CompilerError(`Unknown composition "${dsl.composition}"`, [err('UNKNOWN_COMPOSITION', `Unknown composition "${dsl.composition}".`, dsl.sceneId)])
  }
  for (const v of dsl.visual) {
    if (!hasVisual(v.recipe)) {
      throw new CompilerError(`Unknown visual recipe "${v.recipe}"`, [err('UNKNOWN_VISUAL_RECIPE', `Unknown visual recipe "${v.recipe}".`, dsl.sceneId)])
    }
  }
  for (const m of dsl.motion) {
    if (!hasMotion(m.recipe)) {
      throw new CompilerError(`Unknown motion recipe "${m.recipe}"`, [err('UNKNOWN_MOTION_RECIPE', `Unknown motion recipe "${m.recipe}".`, dsl.sceneId)])
    }
  }

  // 2. Timeline binding — the master timeline owns timing; never recompute it here.
  const window = timeline.sceneWindows[dsl.sceneId]
  if (!window) {
    throw new CompilerError(`Scene "${dsl.sceneId}" has no timeline window`, [err('MISSING_SCENE_WINDOW', `No timeline window for scene "${dsl.sceneId}".`, dsl.sceneId)])
  }
  const declaredFrames = secondsToFrames(dsl.duration, timeline.fps)
  if (declaredFrames !== window.durationInFrames) {
    throw new CompilerError(`Scene "${dsl.sceneId}" duration mismatch`, [
      err('DURATION_MISMATCH', `DSL duration ${dsl.duration}s -> ${declaredFrames} frames, but the timeline window is ${window.durationInFrames} frames.`, dsl.sceneId),
    ])
  }

  const composition = resolveComposition(dsl.composition)
  const declaredSlots = new Set(composition.slots.map((s) => s.id))
  const sceneDuration = window.durationInFrames
  const layers: CompiledLayer[] = []
  let z = 0

  // The optional `backdropRenderer` hint is recorded as scene data only. Phase 0
  // registers no "backdrop" recipe, so inventing a layer for it would reference a
  // recipe that does not exist. A later phase can resolve it against the registry.

  for (const [i, v] of dsl.visual.entries()) {
    if (v.slot !== undefined && !declaredSlots.has(v.slot)) {
      throw new CompilerError(`Unknown slot "${v.slot}" in composition "${composition.id}"`, [
        err('UNKNOWN_SLOT', `Layer "${v.id ?? i}" targets slot "${v.slot}", which composition "${composition.id}" does not declare (has: ${[...declaredSlots].join(', ')}).`, dsl.sceneId),
      ])
    }
    const recipe = resolveVisual(v.recipe)
    const slot = v.slot ?? composition.slots[Math.min(i, composition.slots.length - 1)]!.id
    layers.push({
      id: v.id ?? `${dsl.sceneId}-visual-${i}`, layerKind: 'visual', recipeId: recipe.id, recipeVersion: recipe.version,
      renderer: recipe.renderer, slot, frameWindow: { from: 0, durationInFrames: sceneDuration },
      params: resolveParams(v.recipe, v.params, 'visual'), motion: [], zIndex: z++, assetRefs: [],
    })
  }

  // Compile motion specs once, then attach each to the layer whose id it targets.
  for (const m of dsl.motion) {
    const recipe = resolveMotion(m.recipe)
    if (!m.target) {
      diagnostics.push({ severity: 'warning', code: 'MOTION_WITHOUT_TARGET', sceneId: dsl.sceneId, message: `Motion "${m.recipe}" has no target; it was not applied.` })
      continue
    }
    const target = layers.find((l) => l.id === m.target)
    if (!target) {
      diagnostics.push({ severity: 'error', code: 'MOTION_UNKNOWN_TARGET', sceneId: dsl.sceneId, message: `Motion "${m.recipe}" targets unknown layer "${m.target}".` })
      continue
    }
    if (target.motion.length > 0) {
      diagnostics.push({ severity: 'error', code: 'MOTION_MULTIPLE_PER_LAYER', sceneId: dsl.sceneId, layerId: target.id, message: `Layer "${target.id}" already has a motion; Phase 0 allows one motion per layer.` })
      continue
    }
    target.motion.push({
      recipeId: recipe.id, recipeVersion: recipe.version,
      frameWindow: { from: 0, durationInFrames: sceneDuration },
      params: resolveParams(m.recipe, m.params, 'motion'),
    })
  }

  let typography: CompiledTypography | null = null
  if (dsl.typography) {
    const from = dsl.typography.startSeconds === undefined ? 0 : secondsToFrames(dsl.typography.startSeconds, timeline.fps)
    const durationInFrames = dsl.typography.durationSeconds === undefined
      ? sceneDuration - from
      : secondsToFrames(dsl.typography.durationSeconds, timeline.fps)
    if (from >= sceneDuration) {
      diagnostics.push({ severity: 'error', code: 'TYPOGRAPHY_OUT_OF_WINDOW', sceneId: dsl.sceneId, message: `Typography starts at frame ${from}, outside the ${sceneDuration}-frame scene.` })
    } else {
      typography = {
        text: dsl.typography.text, animation: dsl.typography.animation,
        slot: dsl.typography.slot ?? composition.slots[0]!.id,
        frameWindow: { from, durationInFrames: Math.min(durationInFrames, sceneDuration - from) },
      }
    }
  }

  const events: CompiledEvent[] = dsl.events.map((e) => ({ atFrame: secondsToFrames(e.at, timeline.fps), kind: e.kind, payload: e.payload }))
  const audio: CompiledAudioCue[] = dsl.audio.map((a) => ({ atFrame: secondsToFrames(a.at, timeline.fps), durationInFrames: 0, cue: a.params }))
  layers.sort((a, b) => a.zIndex - b.zIndex)

  const base: CompiledScene = {
    irVersion: IR_VERSION, sceneId: dsl.sceneId, seed: dsl.seed,
    render: { fps: timeline.fps, width: timeline.width, height: timeline.height },
    timing: { startFrame: window.startFrame, durationInFrames: window.durationInFrames },
    composition: { id: composition.id, slots: composition.slots.map((s) => s.id) },
    layers, typography, events, audio, diagnostics,
    provenance: { engineVersion: ENGINE_VERSION, sourceHash: computeSourceHash(dsl, assets), compiledHash: '' },
  }
  const compiledHash = computeCompiledHash(base)
  return { ...base, provenance: { ...base.provenance, compiledHash } }
}
```

- [ ] **Step 7: Implement `src/video-engine/compiler/index.ts`**

```ts
export { compileScene } from './compile-scene'
export type { CompileSceneInput } from './compile-scene'
export { CompilerError } from './errors'
export { computeSourceHash, resolveParams } from './params'
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npx vitest run tests/video-engine/compiler.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/video-engine/compiler tests/video-engine/compiler.test.ts tests/video-engine/fixtures
git commit -m "feat: deterministic scene compiler with diagnostics"
```

---

### Task 8: Runtime interpreter + Remotion root

**Files:**
- Create: `src/video-engine/runtime/frame-math.ts`, `LayerRenderer.tsx`, `TypographyLayer.tsx`, `SceneRenderer.tsx`, `ProjectVideo.tsx`, `register-backends.ts`, `index.ts`
- Create: `remotion/DemoComposition.tsx`, `remotion/Root.tsx`, `remotion/index.ts`
- Test: `tests/video-engine/runtime.test.ts`

**Interfaces:**
- Consumes: `@/video-engine/ir`, `@/video-engine/registry`, `@/timeline/master`.
- Produces:
  - `absoluteFrameOf(timing: Pick<SceneTiming,'startFrame'>, sceneLocalFrame): number`
  - `layerLocalFrame(window: LayerFrameWindow, sceneLocalFrame): number`
  - `LayerRenderer`, `TypographyLayer`, `SceneRenderer`, `ProjectVideo`
  - `registerBackends()` — wires DOM/Canvas/Three renderer backends (Canvas/Three added in Tasks 9–10).
  - Remotion composition id `DeLyDemo` (placeholder until Task 15).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/video-engine/runtime.test.ts
import { describe, it, expect } from 'vitest'
import { absoluteFrameOf, layerLocalFrame } from '@/video-engine/runtime'

describe('runtime frame math', () => {
  it('absolute frame = scene start + local frame', () => {
    expect(absoluteFrameOf({ startFrame: 450 }, 30)).toBe(480)
  })
  it('clamps a scene-local frame into the layer window', () => {
    expect(layerLocalFrame({ from: 30, durationInFrames: 90 }, 200)).toBe(119) // 30 + 90 - 1
    expect(layerLocalFrame({ from: 30, durationInFrames: 90 }, 0)).toBe(30)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/video-engine/runtime.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/video-engine/runtime/frame-math.ts`**

```ts
import type { LayerFrameWindow, SceneTiming } from '@/video-engine/ir'

/** Absolute master frame = scene start + local scene frame. */
export function absoluteFrameOf(timing: Pick<SceneTiming, 'startFrame'>, sceneLocalFrame: number): number {
  return timing.startFrame + sceneLocalFrame
}

/** Clamp a scene-local frame into a layer's local window (inclusive end). */
export function layerLocalFrame(window: LayerFrameWindow, sceneLocalFrame: number): number {
  const last = window.from + window.durationInFrames - 1
  return Math.min(Math.max(sceneLocalFrame, window.from), last)
}
```

- [ ] **Step 4: Implement `src/video-engine/runtime/LayerRenderer.tsx` and `DomBackend.tsx`**

```tsx
// src/video-engine/runtime/LayerRenderer.tsx
import React from 'react'
import { getRendererBackend } from '@/video-engine/registry'
import type { CompiledLayer, RenderSettings } from '@/video-engine/ir'

export type LayerRendererProps = { layer: CompiledLayer; absoluteFrame: number; render: RenderSettings; seed: number }

/**
 * Dispatches an IR layer to the renderer backend registered for layer.renderer.
 * The runtime knows nothing about Canvas or Three beyond this lookup.
 */
export const LayerRenderer: React.FC<LayerRendererProps> = (props) => {
  const Backend = getRendererBackend(props.layer.renderer) as React.FC<LayerRendererProps>
  return <Backend {...props} />
}
```

```tsx
// src/video-engine/runtime/DomBackend.tsx
import React from 'react'
import type { RendererBackendProps } from '@/video-engine/registry'

/** Fallback DOM renderer backend: renders a labeled placeholder box per layer. */
export const DomBackend: React.FC<RendererBackendProps> = ({ layer }) => (
  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(247,249,255,0.5)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 24 }}>
    {layer.recipeId}
  </div>
)
```

- [ ] **Step 5: Implement `src/video-engine/runtime/TypographyLayer.tsx`**

```tsx
import React from 'react'
import { interpolate, useVideoConfig } from 'remotion'
import type { CompiledTypography } from '@/video-engine/ir'

export const TypographyLayer: React.FC<{ typography: CompiledTypography; sceneLocalFrame: number }> = ({ typography, sceneLocalFrame }) => {
  const { fps } = useVideoConfig()
  const local = sceneLocalFrame - typography.frameWindow.from
  const progress = interpolate(local, [0, Math.round(fps * 0.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const opacity = typography.animation === 'none' ? 1 : progress
  const visible = typography.animation === 'typewriter'
    ? typography.text.slice(0, Math.ceil(typography.text.length * progress))
    : typography.text
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f7f9ff', opacity, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 96, fontWeight: 700, letterSpacing: -1, textAlign: 'center', padding: 80 }}>
      {visible}
    </div>
  )
}
```

- [ ] **Step 6: Implement `src/video-engine/runtime/SceneRenderer.tsx`**

```tsx
import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { resolveComposition } from '@/video-engine/registry'
import type { CompiledScene } from '@/video-engine/ir'
import { LayerRenderer } from './LayerRenderer'
import { TypographyLayer } from './TypographyLayer'
import { absoluteFrameOf, layerLocalFrame } from './frame-math'

export const SceneRenderer: React.FC<{ scene: CompiledScene }> = ({ scene }) => {
  const sceneLocalFrame = useCurrentFrame()
  const composition = resolveComposition(scene.composition.id)
  const rects = composition.layout({ slots: scene.composition.slots, render: scene.render, style: {} })
  const rectBySlot = new Map(rects.map((r) => [r.slot, r]))

  return (
    <AbsoluteFill style={{ backgroundColor: '#05070d' }}>
      {scene.layers.map((layer) => {
        const rect = rectBySlot.get(layer.slot)
        if (!rect) return null
        const localFrame = layerLocalFrame(layer.frameWindow, sceneLocalFrame)
        const absoluteFrame = absoluteFrameOf(scene.timing, localFrame)
        return (
          <AbsoluteFill key={layer.id} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, overflow: 'hidden' }}>
            <LayerRenderer layer={layer} absoluteFrame={absoluteFrame} render={scene.render} seed={scene.seed} />
          </AbsoluteFill>
        )
      })}
      {scene.typography ? (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <TypographyLayer typography={scene.typography} sceneLocalFrame={sceneLocalFrame} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  )
}
```

- [ ] **Step 7: Implement `src/video-engine/runtime/ProjectVideo.tsx` and `register-backends.ts`**

```tsx
// src/video-engine/runtime/ProjectVideo.tsx
import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'
import { SceneRenderer } from './SceneRenderer'

export type ProjectVideoProps = { scenes: CompiledScene[]; timeline: MasterTimeline }

/** Master composition: sequences each compiled scene at its absolute window. */
export const ProjectVideo: React.FC<ProjectVideoProps> = ({ scenes, timeline }) => (
  <AbsoluteFill style={{ backgroundColor: '#05070d' }}>
    {scenes.map((scene) => (
      <Sequence key={scene.sceneId} from={scene.timing.startFrame} durationInFrames={scene.timing.durationInFrames} premountFor={timeline.fps}>
        <SceneRenderer scene={scene} />
      </Sequence>
    ))}
  </AbsoluteFill>
)
```

```ts
// src/video-engine/runtime/register-backends.ts
import { registerRendererBackend } from '@/video-engine/registry'
import { registerMetadata } from '@/video-engine/registry/register'
import { DomBackend } from './DomBackend'

/**
 * Full registration used by the Remotion entry point and the app. Metadata
 * registration is separate so compiler/metadata tests stay renderer-free.
 * Tasks 9–10 add the canvas2d and three backends here.
 */
export function registerBackends(): void {
  registerMetadata()
  registerRendererBackend('dom', DomBackend as unknown as (p: unknown) => unknown)
}
```

- [ ] **Step 8: Implement `src/video-engine/runtime/index.ts`**

```ts
export { SceneRenderer } from './SceneRenderer'
export { LayerRenderer } from './LayerRenderer'
export { TypographyLayer } from './TypographyLayer'
export { DomBackend } from './DomBackend'
export { ProjectVideo } from './ProjectVideo'
export type { ProjectVideoProps } from './ProjectVideo'
export { registerBackends, clearRegistered } from './register-backends'
export { absoluteFrameOf, layerLocalFrame } from './frame-math'
```

- [ ] **Step 9: Implement the Remotion entry files**

```tsx
// remotion/DemoComposition.tsx
import React from 'react'
import { AbsoluteFill } from 'remotion'

/** Placeholder until Task 15 wires the fixture project. */
export const DemoComposition: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: '#05070d', color: '#f7f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
    DeLyAI2 — demo pending
  </AbsoluteFill>
)
```

```tsx
// remotion/Root.tsx
import React from 'react'
import { Composition } from 'remotion'
import { DemoComposition } from './DemoComposition'

export const RemotionRoot: React.FC = () => (
  <Composition id="DeLyDemo" component={DemoComposition} durationInFrames={900} fps={30} width={1920} height={1080} />
)
```

```ts
// remotion/index.ts
import './register' // side-effect: registerAll() the engine before root
import { registerRoot } from 'remotion'
import { RemotionRoot } from './Root'

registerRoot(RemotionRoot)
```

```ts
// remotion/register.ts
import { registerBackends } from '@/video-engine/runtime'

registerBackends()
```

- [ ] **Step 10: Run tests, bundle check, typecheck**

Run: `npx vitest run tests/video-engine/runtime.test.ts && npx tsc --noEmit`
Expected: PASS.

Run: `npx remotion bundle remotion/index.ts`
Expected: bundle succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/video-engine/runtime remotion tests/video-engine/runtime.test.ts
git commit -m "feat: runtime interpreter + remotion root composition"
```

---

### Task 9: Canvas 2D subsystem and recipes

**Files:**
- Create: `src/video-engine/canvas/types.ts`, `recipes/particle-field.ts`, `recipes/grid.ts`, `recipes/waveform.ts`, `recipes/glow.ts`, `recipes/geometric-lines.ts`, `canvas-registry.ts`, `Canvas2DBackend.tsx`, `register.ts`, `index.ts`
- Modify: `src/video-engine/runtime/register-backends.ts` (add canvas2d backend)
- Test: `tests/video-engine/canvas.test.ts`

**Interfaces:**
- Consumes: `@/video-engine/registry`, `@/shared`, `@/video-engine/ir`, `zod`.
- Produces:
  - `type Size`, `CanvasState`, `CanvasRenderArgs<P>`, `CanvasRecipe<P>`, `createCanvasRecipe`
  - `getCanvasRecipe(id): CanvasRecipe`, `canvasRecipeRegistry`
  - `CANVAS_RECIPES`, `registerCanvasRecipes()`
  - `Canvas2DBackend`

> **Note:** each recipe imports `createSeededRandom` from `@/shared` at module top (not via `require`). The `prepare` step builds a `SeededRandom` from a constant derived from params, so state is deterministic and independent of the render tick.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/video-engine/canvas.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { clearRegistry, clearRendererBackends, resolveVisual } from '@/video-engine/registry'
import { registerCanvasRecipes, CANVAS_RECIPES, getCanvasRecipe } from '@/video-engine/canvas'
import { createSeededRandom } from '@/shared'

beforeEach(() => { clearRegistry(); clearRendererBackends(); registerCanvasRecipes() })

describe('canvas recipes', () => {
  it('registers the five Phase 0 recipes on canvas2d', () => {
    for (const id of ['particle-field', 'grid', 'waveform', 'glow', 'geometric-lines']) {
      expect(resolveVisual(id).renderer).toBe('canvas2d')
    }
    expect(CANVAS_RECIPES).toHaveLength(5)
  })
  it('particle-field positions are deterministic for a fixed seed', () => {
    const recipe = getCanvasRecipe('particle-field')
    const params = recipe.paramsSchema.parse({})
    const run = () => {
      const state = recipe.prepare!(null, { width: 100, height: 100 }, params)
      const rng = createSeededRandom(7)
      const pts: number[] = []
      for (let f = 0; f < 10; f++) pts.push(...recipe.samplePositions!(f, 30, state, params, rng))
      return pts
    }
    expect(run()).toEqual(run())
  })
  it('every recipe exposes a render function', () => {
    for (const r of CANVAS_RECIPES) expect(typeof r.render).toBe('function')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/video-engine/canvas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/video-engine/canvas/types.ts`**

```ts
import type { z } from 'zod'
import type { JsonObject } from '@/video-engine/schema'
import type { SeededRandom } from '@/shared'

export type Size = { width: number; height: number }
export type CanvasState = Record<string, unknown>

export type CanvasRenderArgs<P extends JsonObject = JsonObject> = {
  frame: number
  fps: number
  size: Size
  params: P
  state: CanvasState
  rng: SeededRandom
}

export type CanvasRecipe<P extends JsonObject = JsonObject> = {
  id: string
  version: string
  paramsSchema: z.ZodType<P>
  prepare?: (ctx: CanvasRenderingContext2D | null, size: Size, params: P) => CanvasState
  render: (ctx: CanvasRenderingContext2D, args: CanvasRenderArgs<P>) => void
  /** Headless-friendly sampling so determinism is testable without a canvas. */
  samplePositions?: (frame: number, fps: number, state: CanvasState, params: P, rng: SeededRandom) => number[]
  dispose?: (state: CanvasState) => void
}

export function createCanvasRecipe<P extends Record<string, unknown>>(r: CanvasRecipe<P>): CanvasRecipe {
  return r as CanvasRecipe
}
```

- [ ] **Step 4: Implement `src/video-engine/canvas/recipes/particle-field.ts`**

```ts
import { z } from 'zod'
import { createSeededRandom } from '@/shared'
import { createCanvasRecipe } from '../types'

const schema = z.object({
  count: z.number().int().positive().default(40),
  hue: z.number().default(200),
  speed: z.number().default(1),
})

type Particle = { x: number; y: number; r: number; phase: number }

export const particleField = createCanvasRecipe({
  id: 'particle-field', version: '1.0.0', paramsSchema: schema,
  prepare: (_ctx, size, params) => {
    const rng = createSeededRandom(params.count * 7919 + 13)
    const particles: Particle[] = Array.from({ length: params.count }, () => ({
      x: rng.next(), y: rng.next(), r: rng.float(0.002, 0.008), phase: rng.next() * Math.PI * 2,
    }))
    return { particles, size }
  },
  samplePositions: (frame, fps, state, _params, _rng) => {
    const particles = state.particles as Particle[]
    const t = frame / fps
    return particles.flatMap((p) => [p.x + Math.sin(t + p.phase) * 0.02, p.y + Math.cos(t + p.phase) * 0.02])
  },
  render: (ctx, { frame, fps, size, params, state }) => {
    const particles = state.particles as Particle[]
    const t = (frame / fps) * params.speed
    ctx.clearRect(0, 0, size.width, size.height)
    for (const p of particles) {
      const x = (p.x + Math.sin(t + p.phase) * 0.02) * size.width
      const y = (p.y + Math.cos(t + p.phase) * 0.02) * size.height
      const radius = p.r * size.width
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
      grad.addColorStop(0, `hsla(${params.hue}, 90%, 70%, 0.9)`)
      grad.addColorStop(1, `hsla(${params.hue}, 90%, 60%, 0)`)
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
    }
  },
})
```

- [ ] **Step 5: Implement the other four canvas recipes**

```ts
// src/video-engine/canvas/recipes/grid.ts
import { z } from 'zod'
import { createCanvasRecipe } from '../types'

export const grid = createCanvasRecipe({
  id: 'grid', version: '1.0.0',
  paramsSchema: z.object({ cell: z.number().positive().default(72), hue: z.number().default(210), opacity: z.number().default(0.18) }),
  prepare: () => ({}),
  render: (ctx, { frame, fps, size, params }) => {
    const offset = ((frame / fps) % 1) * params.cell
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.strokeStyle = `hsla(${params.hue}, 80%, 70%, ${params.opacity})`
    ctx.lineWidth = 1
    for (let x = -params.cell; x <= size.width + params.cell; x += params.cell) {
      ctx.beginPath(); ctx.moveTo(x + offset, 0); ctx.lineTo(x + offset, size.height); ctx.stroke()
    }
    for (let y = -params.cell; y <= size.height + params.cell; y += params.cell) {
      ctx.beginPath(); ctx.moveTo(0, y + offset); ctx.lineTo(size.width, y + offset); ctx.stroke()
    }
  },
})
```

```ts
// src/video-engine/canvas/recipes/waveform.ts
import { z } from 'zod'
import { createSeededRandom } from '@/shared'
import { createCanvasRecipe } from '../types'

export const waveform = createCanvasRecipe({
  id: 'waveform', version: '1.0.0',
  paramsSchema: z.object({ bars: z.number().int().positive().default(64), hue: z.number().default(160), amp: z.number().default(0.35) }),
  prepare: (_ctx, _size, params) => {
    const rng = createSeededRandom(params.bars * 31 + 7)
    return { levels: Array.from({ length: params.bars }, () => rng.float(0.2, 1)) }
  },
  render: (ctx, { frame, fps, size, params, state }) => {
    const levels = state.levels as number[]
    const t = frame / fps
    ctx.clearRect(0, 0, size.width, size.height)
    const bw = size.width / params.bars
    for (let i = 0; i < params.bars; i++) {
      const h = levels[i]! * params.amp * size.height * (0.6 + 0.4 * Math.abs(Math.sin(t * 2 + i * 0.3)))
      ctx.fillStyle = `hsla(${params.hue}, 85%, 65%, 0.85)`
      ctx.fillRect(i * bw + bw * 0.2, (size.height - h) / 2, bw * 0.6, h)
    }
  },
})
```

```ts
// src/video-engine/canvas/recipes/glow.ts
import { z } from 'zod'
import { createCanvasRecipe } from '../types'

export const glow = createCanvasRecipe({
  id: 'glow', version: '1.0.0',
  paramsSchema: z.object({ hue: z.number().default(265), intensity: z.number().default(0.55), radius: z.number().default(0.5) }),
  prepare: () => ({}),
  render: (ctx, { frame, fps, size, params }) => {
    const t = frame / fps
    const cx = size.width / 2 + Math.sin(t) * size.width * 0.05
    const cy = size.height / 2 + Math.cos(t * 0.8) * size.height * 0.05
    const r = params.radius * size.width
    ctx.clearRect(0, 0, size.width, size.height)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    grad.addColorStop(0, `hsla(${params.hue}, 90%, 70%, ${params.intensity})`)
    grad.addColorStop(1, `hsla(${params.hue}, 90%, 60%, 0)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size.width, size.height)
  },
})
```

```ts
// src/video-engine/canvas/recipes/geometric-lines.ts
import { z } from 'zod'
import { createSeededRandom } from '@/shared'
import { createCanvasRecipe } from '../types'

export const geometricLines = createCanvasRecipe({
  id: 'geometric-lines', version: '1.0.0',
  paramsSchema: z.object({ lines: z.number().int().positive().default(48), hue: z.number().default(24) }),
  prepare: (_ctx, _size, params) => {
    const rng = createSeededRandom(params.lines * 17 + 3)
    return { seeds: Array.from({ length: params.lines }, () => ({ a: rng.next(), b: rng.next() })) }
  },
  render: (ctx, { frame, fps, size, params, state }) => {
    const seeds = state.seeds as { a: number; b: number }[]
    const t = frame / fps
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.lineWidth = 2
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i]!
      ctx.strokeStyle = `hsla(${params.hue + i * 2}, 85%, 65%, ${0.1 + 0.5 * Math.abs(Math.sin(t + i * 0.2))})`
      ctx.beginPath(); ctx.moveTo(s.a * size.width, s.b * size.height); ctx.lineTo((1 - s.b) * size.width, (1 - s.a) * size.height); ctx.stroke()
    }
  },
})
```

- [ ] **Step 6: Implement `src/video-engine/canvas/canvas-registry.ts`**

```ts
import type { CanvasRecipe } from './types'

/** Separate registry for canvas *implementations* — keeps them off visual-recipe metadata. */
export const canvasRecipeRegistry = new Map<string, CanvasRecipe>()

export function registerCanvasRecipe(recipe: CanvasRecipe): void {
  canvasRecipeRegistry.set(recipe.id, recipe)
}

export function getCanvasRecipe(id: string): CanvasRecipe {
  const r = canvasRecipeRegistry.get(id)
  if (!r) throw new Error(`Unknown canvas recipe "${id}"`)
  return r
}

export function clearCanvasRecipes(): void {
  canvasRecipeRegistry.clear()
}
```

- [ ] **Step 7: Implement `src/video-engine/canvas/Canvas2DBackend.tsx`**

```tsx
import React, { useEffect, useRef } from 'react'
import { useCurrentFrame } from 'remotion'
import { createSeededRandom } from '@/shared'
import type { RendererBackendProps } from '@/video-engine/registry'
import { getCanvasRecipe } from './canvas-registry'
import type { CanvasState } from './types'

/**
 * Renders a canvas2d layer. Drawing is a pure function of `frame` — never
 * wall-clock time — so the same input renders identically. State is per layer
 * instance and disposed on unmount.
 */
export const Canvas2DBackend: React.FC<RendererBackendProps> = ({ layer, absoluteFrame, render }) => {
  const frame = useCurrentFrame()
  const ref = useRef<HTMLCanvasElement>(null)
  const recipe = getCanvasRecipe(layer.recipeId)
  const stateRef = useRef<CanvasState | null>(null)

  if (stateRef.current === null) {
    stateRef.current = recipe.prepare ? recipe.prepare(null, { width: render.width, height: render.height }, layer.params as never) : {}
  }

  useEffect(() => {
    const current = stateRef.current
    return () => {
      if (current && recipe.dispose) recipe.dispose(current)
    }
  }, [recipe])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rng = createSeededRandom((layer.id.length * 131 + absoluteFrame * 17) >>> 0)
    recipe.render(ctx, {
      frame: absoluteFrame, fps: render.fps, size: { width: render.width, height: render.height },
      params: layer.params as never, state: stateRef.current!, rng,
    })
  }, [absoluteFrame, frame, layer.id, layer.params, recipe, render])

  return <canvas ref={ref} width={render.width} height={render.height} style={{ width: '100%', height: '100%' }} />
}
```

- [ ] **Step 8: Implement `src/video-engine/canvas/register.ts` and `index.ts`**

```ts
// src/video-engine/canvas/register.ts
import { registerVisual } from '@/video-engine/registry'
import { clearCanvasRecipes, registerCanvasRecipe } from './canvas-registry'
import { particleField } from './recipes/particle-field'
import { grid } from './recipes/grid'
import { waveform } from './recipes/waveform'
import { glow } from './recipes/glow'
import { geometricLines } from './recipes/geometric-lines'

export const CANVAS_RECIPES = [particleField, grid, waveform, glow, geometricLines]

export function registerCanvasRecipes(): void {
  clearCanvasRecipes()
  for (const recipe of CANVAS_RECIPES) {
    registerCanvasRecipe(recipe)
    registerVisual({
      id: recipe.id, version: recipe.version, renderer: 'canvas2d',
      paramsSchema: recipe.paramsSchema, defaults: {},
    })
  }
}
```

```ts
// src/video-engine/canvas/index.ts
export * from './types'
export { canvasRecipeRegistry, getCanvasRecipe, registerCanvasRecipe, clearCanvasRecipes } from './canvas-registry'
export { CANVAS_RECIPES, registerCanvasRecipes } from './register'
export { Canvas2DBackend } from './Canvas2DBackend'
```

- [ ] **Step 9: Wire the canvas backend into `register-backends.ts`**

Modify `src/video-engine/runtime/register-backends.ts` to:

```ts
import { registerRendererBackend } from '@/video-engine/registry'
import { registerMetadata } from '@/video-engine/registry/register'
import { registerCanvasRecipes, Canvas2DBackend } from '@/video-engine/canvas'
import { DomBackend } from './DomBackend'

export function registerBackends(): void {
  registerMetadata()
  registerCanvasRecipes()
  registerRendererBackend('dom', DomBackend as unknown as (p: unknown) => unknown)
  registerRendererBackend('canvas2d', Canvas2DBackend as unknown as (p: unknown) => unknown)
}
```

- [ ] **Step 10: Run tests, typecheck**

Run: `npx vitest run tests/video-engine && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/video-engine/canvas src/video-engine/runtime/register-backends.ts tests/video-engine/canvas.test.ts
git commit -m "feat: canvas 2d subsystem + five deterministic recipes"
```

---

### Task 10: Three.js subsystem and recipes

**Files:**
- Create: `src/video-engine/three/types.ts`, `recipes/network-graph.ts`, `recipes/particles-3d.ts`, `recipes/wireframe-object.ts`, `recipes/basic-scene.ts`, `recipes/camera.ts`, `recipes/lighting.ts`, `three-registry.ts`, `ThreeBackend.tsx`, `register.ts`, `index.ts`
- Modify: `src/video-engine/runtime/register-backends.ts` (add three backend)
- Test: `tests/video-engine/three.test.ts`

**Interfaces:**
- Consumes: `@remotion/three`, `@/video-engine/registry`, `@/shared`, `zod`.
- Produces:
  - `type SceneDescriptor`, `ThreeBuildArgs<P>`, `ThreeRecipe<P>`, `createThreeRecipe`, `structuralHashOf(descriptor)`
  - `getThreeRecipe(id)`, `threeRecipeRegistry`
  - `THREE_RECIPES`, `registerThreeRecipes()`
  - `ThreeBackend`

> **Remotion rules:** wrap in `<ThreeCanvas width height>`; **never** `useFrame()`; animate only from `useCurrentFrame()`; `<Sequence>` inside must use `layout="none"`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/video-engine/three.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { clearRegistry, clearRendererBackends, resolveVisual } from '@/video-engine/registry'
import { registerThreeRecipes, THREE_RECIPES, getThreeRecipe, structuralHashOf } from '@/video-engine/three'
import { createSeededRandom } from '@/shared'

beforeEach(() => { clearRegistry(); clearRendererBackends(); registerThreeRecipes() })

describe('three recipes', () => {
  it('registers the Phase 0 recipes on the three renderer', () => {
    for (const id of ['network-graph', 'particles-3d', 'wireframe-object', 'basic-scene', 'camera', 'lighting']) {
      expect(resolveVisual(id).renderer).toBe('three')
    }
    expect(THREE_RECIPES.length).toBeGreaterThanOrEqual(5)
  })
  it('structural hash is stable and frame-sensitive', () => {
    const d = {
      recipeId: 'network-graph', recipeVersion: '1.0.0', frame: 12, camera: { position: [0, 0, 6] as [number, number, number] },
      objectTransforms: [{ id: 'n1', position: [1, 2, 3] as [number, number, number] }],
      geometryParams: { nodes: 24 }, materialParams: { color: '#4a9eff' }, lightParams: { intensity: 0.8 }, seed: 12345,
    }
    expect(structuralHashOf(d)).toBe(structuralHashOf({ ...d }))
    expect(structuralHashOf(d)).not.toBe(structuralHashOf({ ...d, frame: 13 }))
  })
  it('network-graph descriptor is deterministic for a fixed seed', () => {
    const recipe = getThreeRecipe('network-graph')
    const build = () => recipe.describe!({ frame: 0, fps: 30, params: recipe.paramsSchema.parse({}), rng: createSeededRandom(5), sizing: { width: 1920, height: 1080 } })
    expect(build()).toEqual(build())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/video-engine/three.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/video-engine/three/types.ts`**

```ts
import type React from 'react'
import type { z } from 'zod'
import type { JsonObject } from '@/video-engine/schema'
import type { SeededRandom } from '@/shared'
import { hashObject } from '@/shared'

export type Size = { width: number; height: number }

/** A serializable description of a Three scene at a frame — the determinism gate. */
export type SceneDescriptor = {
  recipeId: string
  recipeVersion: string
  frame: number
  camera: { position: [number, number, number]; lookAt?: [number, number, number] }
  objectTransforms: { id: string; position: [number, number, number]; rotation?: [number, number, number]; scale?: number }[]
  geometryParams: JsonObject
  materialParams: JsonObject
  lightParams: JsonObject
  seed: number
}

export type ThreeBuildArgs<P extends JsonObject = JsonObject> = {
  frame: number
  fps: number
  params: P
  rng: SeededRandom
  sizing: Size
}

export type ThreeRecipe<P extends JsonObject = JsonObject> = {
  id: string
  version: string
  paramsSchema: z.ZodType<P>
  describe?: (args: ThreeBuildArgs<P>) => SceneDescriptor
  /** React subtree rendered inside <ThreeCanvas>. Animate only via useCurrentFrame(). */
  build: (args: ThreeBuildArgs<P>) => React.ReactNode
  disposeResources?: (args: ThreeBuildArgs<P>) => void
}

export function createThreeRecipe<P extends Record<string, unknown>>(r: ThreeRecipe<P>): ThreeRecipe {
  return r as ThreeRecipe
}

export function structuralHashOf(descriptor: SceneDescriptor): string {
  return hashObject(descriptor)
}
```

- [ ] **Step 4: Implement `src/video-engine/three/recipes/network-graph.ts`**

```tsx
import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { z } from 'zod'
import type { SeededRandom } from '@/shared'
import { createThreeRecipe, type SceneDescriptor } from '../types'

const schema = z.object({
  nodes: z.number().int().positive().default(24),
  radius: z.number().default(2.6),
  color: z.string().default('#4a9eff'),
})
type P = z.infer<typeof schema>

type Node = { id: string; position: [number, number, number] }

function layout(params: P, rng: SeededRandom): Node[] {
  const out: Node[] = []
  for (let i = 0; i < params.nodes; i++) {
    const theta = rng.next() * Math.PI * 2
    const phi = Math.acos(2 * rng.next() - 1)
    const r = params.radius * (0.6 + 0.4 * rng.next())
    out.push({ id: `n${i}`, position: [r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)] })
  }
  return out
}

export const networkGraph = createThreeRecipe({
  id: 'network-graph', version: '1.0.0', paramsSchema: schema,
  describe: ({ frame, params, rng }): SceneDescriptor => ({
    recipeId: 'network-graph', recipeVersion: '1.0.0', frame,
    camera: { position: [0, 0, 6 + frame * 0.01] },
    objectTransforms: layout(params, rng),
    geometryParams: { nodes: params.nodes, radius: params.radius },
    materialParams: { color: params.color }, lightParams: { ambient: 0.4, directional: 0.9 }, seed: 0,
  }),
  build: ({ params, rng }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const nodes = React.useMemo(() => layout(params, rng), [params, rng])
    const rotY = (frame / fps) * 0.4
    return (
      <group rotation={[0, rotY, 0]}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.9} />
        {nodes.map((n) => (
          <mesh key={n.id} position={n.position}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial color={params.color} emissive={params.color} emissiveIntensity={0.35} />
          </mesh>
        ))}
        {nodes.flatMap((a, i) =>
          nodes.slice(i + 1).map((b) => {
            const d = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2])
            if (d > params.radius * 0.9) return null
            return (
              <line key={`${a.id}-${b.id}`}>
                <bufferGeometry
                  attach="geometry"
                  onUpdate={(g: { setFromPoints: (p: unknown[]) => void }) =>
                    g.setFromPoints([
                      { x: a.position[0], y: a.position[1], z: a.position[2] },
                      { x: b.position[0], y: b.position[1], z: b.position[2] },
                    ])
                  }
                />
                <lineBasicMaterial color={params.color} transparent opacity={0.28} />
              </line>
            )
          }),
        )}
      </group>
    )
  },
})
```

- [ ] **Step 5: Implement the other five recipes**

```tsx
// src/video-engine/three/recipes/basic-scene.ts
import React from 'react'
import { useCurrentFrame } from 'remotion'
import { z } from 'zod'
import { createThreeRecipe, type SceneDescriptor } from '../types'

export const basicScene = createThreeRecipe({
  id: 'basic-scene', version: '1.0.0', paramsSchema: z.object({ color: z.string().default('#4a9eff') }),
  describe: ({ frame, params }): SceneDescriptor => ({
    recipeId: 'basic-scene', recipeVersion: '1.0.0', frame, camera: { position: [0, 0, 5] },
    objectTransforms: [{ id: 'box', position: [0, 0, 0] }], geometryParams: { kind: 'box' },
    materialParams: { color: params.color }, lightParams: {}, seed: 0,
  }),
  build: ({ params }) => {
    const frame = useCurrentFrame()
    return (
      <group>
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 3, 3]} intensity={0.9} />
        <mesh rotation={[0, frame * 0.02, 0]}>
          <boxGeometry args={[1.6, 1.6, 1.6]} />
          <meshStandardMaterial color={params.color} />
        </mesh>
      </group>
    )
  },
})
```

```tsx
// src/video-engine/three/recipes/particles-3d.ts
import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { z } from 'zod'
import type { SeededRandom } from '@/shared'
import { createThreeRecipe, type SceneDescriptor } from '../types'

const schema = z.object({ count: z.number().int().positive().default(300), color: z.string().default('#7cc4ff') })
type P = z.infer<typeof schema>

function points(params: P, rng: SeededRandom): [number, number, number][] {
  return Array.from({ length: params.count }, () => [
    (rng.next() - 0.5) * 8, (rng.next() - 0.5) * 8, (rng.next() - 0.5) * 8,
  ])
}

export const particles3d = createThreeRecipe({
  id: 'particles-3d', version: '1.0.0', paramsSchema: schema,
  describe: ({ frame, params, rng }): SceneDescriptor => ({
    recipeId: 'particles-3d', recipeVersion: '1.0.0', frame, camera: { position: [0, 0, 8] },
    objectTransforms: points(params, rng).map((p, i) => ({ id: `p${i}`, position: p })),
    geometryParams: { count: params.count }, materialParams: { color: params.color }, lightParams: {}, seed: 0,
  }),
  build: ({ params, rng }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const pts = React.useMemo(() => points(params, rng), [params, rng])
    return (
      <group rotation={[0, (frame / fps) * 0.2, 0]}>
        <ambientLight intensity={0.6} />
        {pts.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshStandardMaterial color={params.color} />
          </mesh>
        ))}
      </group>
    )
  },
})
```

```tsx
// src/video-engine/three/recipes/wireframe-object.ts
import React from 'react'
import { useCurrentFrame } from 'remotion'
import { z } from 'zod'
import { createThreeRecipe, type SceneDescriptor } from '../types'

export const wireframeObject = createThreeRecipe({
  id: 'wireframe-object', version: '1.0.0',
  paramsSchema: z.object({ color: z.string().default('#ff8a3d'), kind: z.enum(['icosahedron', 'torus', 'box']).default('icosahedron') }),
  describe: ({ frame, params }): SceneDescriptor => ({
    recipeId: 'wireframe-object', recipeVersion: '1.0.0', frame, camera: { position: [0, 0, 5] },
    objectTransforms: [{ id: 'wire', position: [0, 0, 0] }], geometryParams: { kind: params.kind },
    materialParams: { color: params.color }, lightParams: {}, seed: 0,
  }),
  build: ({ params }) => {
    const frame = useCurrentFrame()
    const geometry = params.kind === 'icosahedron'
      ? <icosahedronGeometry args={[1.6, 1]} />
      : params.kind === 'torus'
        ? <torusGeometry args={[1.2, 0.4, 16, 48]} />
        : <boxGeometry args={[2, 2, 2]} />
    return (
      <group>
        <ambientLight intensity={0.6} />
        <mesh rotation={[frame * 0.01, frame * 0.015, 0]}>
          {geometry}
          <meshBasicMaterial color={params.color} wireframe />
        </mesh>
      </group>
    )
  },
})
```

```tsx
// src/video-engine/three/recipes/camera.ts
import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { z } from 'zod'
import { createThreeRecipe, type SceneDescriptor } from '../types'

/**
 * A camera-flythrough motion provided as a visual recipe: the geometry is a
 * simple field and the movement is the camera. (Motion recipes in Task 11
 * transform layers; this recipe bakes the camera move into the scene.)
 */
export const cameraRig = createThreeRecipe({
  id: 'camera', version: '1.0.0', paramsSchema: z.object({ color: z.string().default('#9dd0ff') }),
  describe: ({ frame, params }): SceneDescriptor => ({
    recipeId: 'camera', recipeVersion: '1.0.0', frame, camera: { position: [0, 0, 8 - frame * 0.02] },
    objectTransforms: [{ id: 'ring', position: [0, 0, 0] }], geometryParams: { kind: 'torus' },
    materialParams: { color: params.color }, lightParams: {}, seed: 0,
  }),
  build: ({ params }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const z = Math.max(2, 8 - (frame / fps) * 0.6)
    return (
      <group>
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 4, 4]} intensity={0.9} />
        <group position={[0, 0, z - 8]}>
          <mesh position={[0, 0, z]}>
            <torusGeometry args={[1.4, 0.35, 16, 64]} />
            <meshStandardMaterial color={params.color} />
          </mesh>
        </group>
      </group>
    )
  },
})
```

```tsx
// src/video-engine/three/recipes/lighting.ts
import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { z } from 'zod'
import { createThreeRecipe, type SceneDescriptor } from '../types'

/** Readable backdrop lighting with a slow orbiting key light. */
export const lightingRig = createThreeRecipe({
  id: 'lighting', version: '1.0.0', paramsSchema: z.object({ color: z.string().default('#ffffff') }),
  describe: ({ frame, params }): SceneDescriptor => ({
    recipeId: 'lighting', recipeVersion: '1.0.0', frame, camera: { position: [0, 0, 5] },
    objectTransforms: [{ id: 'sphere', position: [0, 0, 0] }], geometryParams: { kind: 'sphere' },
    materialParams: { color: params.color }, lightParams: { orbit: frame * 0.02 }, seed: 0,
  }),
  build: ({ params }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const angle = (frame / fps) * 0.8
    return (
      <group>
        <ambientLight intensity={0.25} />
        <directionalLight position={[Math.cos(angle) * 5, 4, Math.sin(angle) * 5]} intensity={1.1} />
        <mesh>
          <sphereGeometry args={[1.4, 48, 48]} />
          <meshStandardMaterial color={params.color} roughness={0.3} metalness={0.2} />
        </mesh>
      </group>
    )
  },
})
```

- [ ] **Step 6: Implement `src/video-engine/three/three-registry.ts`**

```ts
import type { ThreeRecipe } from './types'

/** Separate registry for three *implementations* — kept off visual-recipe metadata. */
export const threeRecipeRegistry = new Map<string, ThreeRecipe>()

export function registerThreeRecipeImpl(recipe: ThreeRecipe): void {
  threeRecipeRegistry.set(recipe.id, recipe)
}

export function getThreeRecipe(id: string): ThreeRecipe {
  const r = threeRecipeRegistry.get(id)
  if (!r) throw new Error(`Unknown three recipe "${id}"`)
  return r
}

export function clearThreeRecipes(): void {
  threeRecipeRegistry.clear()
}
```

- [ ] **Step 7: Implement `src/video-engine/three/ThreeBackend.tsx`**

```tsx
import React from 'react'
import { ThreeCanvas } from '@remotion/three'
import { useCurrentFrame } from 'remotion'
import { createSeededRandom } from '@/shared'
import type { RendererBackendProps } from '@/video-engine/registry'
import { getThreeRecipe } from './three-registry'

/**
 * Wraps a three recipe in <ThreeCanvas>. Animation is driven exclusively by
 * useCurrentFrame() (never useFrame) so rendering is frame-deterministic.
 */
export const ThreeBackend: React.FC<RendererBackendProps> = ({ layer, absoluteFrame, render, seed }) => {
  const frame = useCurrentFrame()
  const recipe = getThreeRecipe(layer.recipeId)
  const rng = React.useMemo(() => createSeededRandom((seed + layer.id.length * 131) >>> 0), [seed, layer.id])
  return (
    <ThreeCanvas width={render.width} height={render.height} style={{ width: '100%', height: '100%' }}>
      {recipe.build({ frame: absoluteFrame, fps: render.fps, params: layer.params as never, rng, sizing: { width: render.width, height: render.height } })}
      {void frame}
    </ThreeCanvas>
  )
}
```

- [ ] **Step 8: Implement `src/video-engine/three/register.ts` and `index.ts`**

```ts
// src/video-engine/three/register.ts
import { registerVisual } from '@/video-engine/registry'
import { clearThreeRecipes, registerThreeRecipeImpl } from './three-registry'
import { networkGraph } from './recipes/network-graph'
import { particles3d } from './recipes/particles-3d'
import { wireframeObject } from './recipes/wireframe-object'
import { basicScene } from './recipes/basic-scene'
import { cameraRig } from './recipes/camera'
import { lightingRig } from './recipes/lighting'

export const THREE_RECIPES = [networkGraph, particles3d, wireframeObject, basicScene, cameraRig, lightingRig]

export function registerThreeRecipes(): void {
  clearThreeRecipes()
  for (const recipe of THREE_RECIPES) {
    registerThreeRecipeImpl(recipe)
    registerVisual({ id: recipe.id, version: recipe.version, renderer: 'three', paramsSchema: recipe.paramsSchema, defaults: {} })
  }
}
```

```ts
// src/video-engine/three/index.ts
export * from './types'
export { threeRecipeRegistry, getThreeRecipe, registerThreeRecipeImpl, clearThreeRecipes } from './three-registry'
export { THREE_RECIPES, registerThreeRecipes } from './register'
export { ThreeBackend } from './ThreeBackend'
```

- [ ] **Step 9: Wire the three backend into `register-backends.ts`**

```ts
import { registerRendererBackend } from '@/video-engine/registry'
import { registerMetadata } from '@/video-engine/registry/register'
import { registerCanvasRecipes, Canvas2DBackend } from '@/video-engine/canvas'
import { registerThreeRecipes, ThreeBackend } from '@/video-engine/three'
import { DomBackend } from './DomBackend'

export function registerBackends(): void {
  registerMetadata()
  registerCanvasRecipes()
  registerThreeRecipes()
  registerRendererBackend('dom', DomBackend as unknown as (p: unknown) => unknown)
  registerRendererBackend('canvas2d', Canvas2DBackend as unknown as (p: unknown) => unknown)
  registerRendererBackend('three', ThreeBackend as unknown as (p: unknown) => unknown)
}
```

- [ ] **Step 10: Run tests, bundle check, typecheck**

Run: `npx vitest run tests/video-engine/three.test.ts && npx tsc --noEmit`
Expected: PASS.

Run: `npx remotion bundle remotion/index.ts`
Expected: bundle succeeds with three installed.

- [ ] **Step 11: Commit**

```bash
git add src/video-engine/three src/video-engine/runtime/register-backends.ts tests/video-engine/three.test.ts
git commit -m "feat: three.js subsystem + six deterministic recipes"
```

---

### Task 11: Motion recipes and typography

**Files:**
- Create: `src/video-engine/motion/types.ts`, `recipes/fade.ts`, `recipes/reveal.ts`, `recipes/slide.ts`, `recipes/scale.ts`, `recipes/pulse.ts`, `recipes/parallax.ts`, `recipes/camera-flythrough.ts`, `motion-registry.ts`, `apply.ts`, `register.ts`, `index.ts`
- Create: `src/video-engine/runtime/MotionLayer.tsx`
- Modify: `src/video-engine/runtime/SceneRenderer.tsx` (wrap layers in `MotionLayer`)
- Modify: `src/video-engine/runtime/register-backends.ts` (register motion recipes)
- Test: `tests/video-engine/motion.test.ts`

**Interfaces:**
- Consumes: `@/video-engine/ir`, `@/video-engine/registry`, `@/shared`.
- Produces:
  - `type LayerTransform`, `MotionArgs<P>`, `MotionRecipeImpl<P>`, `createMotionRecipeImpl`
  - `getMotionRecipe(id)`, `motionRecipeRegistry`
  - `MOTION_RECIPES`, `registerMotionRecipes()`
  - `composeTransforms(base: LayerTransform, next: LayerTransform): LayerTransform`
  - `applyMotion(layer: CompiledLayer, absoluteFrame: number, fps: number): LayerTransform`
  - `IDENTITY_TRANSFORM`

> **Note:** a motion recipe returns a `LayerTransform` (data), not JSX. The runtime applies it as a CSS transform, so motion never reaches into a renderer backend. Motion windows are already absolute frames from the compiler, so `applyMotion` takes `absoluteFrame` directly.

> **Where `video-engine/typography/` lives (spec §6.7):** Phase 0 does **not** create a `src/video-engine/typography/` directory. Spec §6.7 defines typography as a pure data mapping — `{ text, animation, style } → CompiledTypography` — and that mapping is *already* split across two existing layers: the DSL→IR half is the compiler (Task 7 assembles `CompiledTypography` from `TypographySpec`), and the IR→pixels half is `src/video-engine/runtime/TypographyLayer.tsx` (Step 5 above). A directory whose entire contents would be one type already in `ir/` and one component already in `runtime/` adds a boundary without adding a decision. When Phase 1 grows real typography recipes (per-recipe text layout, font metrics, multi-line fitting), `typography/` becomes a real registry-backed subsystem and gets its own task then.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/video-engine/motion.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { clearRegistry, clearRendererBackends, resolveMotion } from '@/video-engine/registry'
import { registerMotionRecipes, getMotionRecipe, MOTION_RECIPES, applyMotion, composeTransforms, IDENTITY_TRANSFORM } from '@/video-engine/motion'
import type { CompiledLayer } from '@/video-engine/ir'

beforeEach(() => { clearRegistry(); clearRendererBackends(); registerMotionRecipes() })

const layer = (motion: CompiledLayer['motion']): CompiledLayer => ({
  id: 'l1', layerKind: 'visual', recipeId: 'glow', recipeVersion: '1.0.0', renderer: 'canvas2d', slot: 'main',
  frameWindow: { from: 0, durationInFrames: 60 }, params: {}, motion, zIndex: 0, assetRefs: [],
})

describe('motion recipes', () => {
  it('registers the seven Phase 0 motion recipes on the registry', () => {
    expect(MOTION_RECIPES.map((r) => r.id).sort()).toEqual(
      ['camera-flythrough', 'fade', 'parallax', 'pulse', 'reveal', 'scale', 'slide'],
    )
    for (const r of MOTION_RECIPES) expect(resolveMotion(r.id).id).toBe(r.id)
  })
  it('composeTransforms multiplies opacity and adds offsets', () => {
    const a = { opacity: 0.5, x: 10, y: 0, scale: 2, rotate: 0 }
    const b = { opacity: 0.5, x: 5, y: -3, scale: 0.5, rotate: 45 }
    expect(composeTransforms(a, b)).toEqual({ opacity: 0.25, x: 15, y: -3, scale: 1, rotate: 45 })
  })
  it('applyMotion is a pure function of the frame', () => {
    const l = layer([{ recipeId: 'fade', recipeVersion: '1.0.0', frameWindow: { from: 0, durationInFrames: 30 }, params: {} }])
    expect(applyMotion(l, 0, 30)).toEqual(applyMotion(l, 0, 30))
    expect(applyMotion(l, 0, 30).opacity).toBeCloseTo(0, 5)
    expect(applyMotion(l, 30, 30).opacity).toBeCloseTo(1, 5)
  })
  it('applyMotion with no motion returns the identity transform', () => {
    expect(applyMotion(layer([]), 12, 30)).toEqual(IDENTITY_TRANSFORM)
  })
  it('clamps outside the motion window', () => {
    const l = layer([{ recipeId: 'slide', recipeVersion: '1.0.0', frameWindow: { from: 10, durationInFrames: 20 }, params: { axis: 'x', distance: 0.25 } }])
    expect(applyMotion(l, 0, 30).x).toBe(applyMotion(l, 10, 30).x)
    expect(applyMotion(l, 999, 30).x).toBe(applyMotion(l, 29, 30).x)
  })
  it('fade recipe default params parse', () => {
    expect(getMotionRecipe('fade').paramsSchema.parse({})).toMatchObject({ from: 0, to: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/video-engine/motion.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/video-engine/motion/types.ts`**

```ts
import type { z } from 'zod'
import type { JsonObject } from '@/video-engine/schema'

/** Data-only transform, applied by the runtime as CSS. Never JSX from a recipe. */
export type LayerTransform = {
  opacity: number
  /** Fraction of composition width. */
  x: number
  /** Fraction of composition height. */
  y: number
  scale: number
  /** Degrees. */
  rotate: number
}

export const IDENTITY_TRANSFORM: LayerTransform = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }

export type MotionArgs<P extends JsonObject = JsonObject> = {
  frame: number
  fps: number
  durationInFrames: number
  params: P
}

export type MotionRecipeImpl<P extends JsonObject = JsonObject> = {
  id: string
  version: string
  paramsSchema: z.ZodType<P>
  apply: (args: MotionArgs<P>) => LayerTransform
}

export function createMotionRecipeImpl<P extends Record<string, unknown>>(r: MotionRecipeImpl<P>): MotionRecipeImpl {
  return r as MotionRecipeImpl
}

/** Data-only composition of two transforms; opacity and scale multiply, the rest add. */
export function composeTransforms(base: LayerTransform, next: LayerTransform): LayerTransform {
  return {
    opacity: base.opacity * next.opacity,
    x: base.x + next.x,
    y: base.y + next.y,
    scale: base.scale * next.scale,
    rotate: base.rotate + next.rotate,
  }
}
```

- [ ] **Step 4: Implement the seven motion recipes**

```ts
// src/video-engine/motion/recipes/fade.ts
import { z } from 'zod'
import { interpolate } from 'remotion'
import { createMotionRecipeImpl, IDENTITY_TRANSFORM } from '../types'

export const fade = createMotionRecipeImpl({
  id: 'fade', version: '1.0.0',
  paramsSchema: z.object({ from: z.number().default(0), to: z.number().default(1) }),
  apply: ({ frame, durationInFrames, params }) => ({
    ...IDENTITY_TRANSFORM,
    opacity: interpolate(frame, [0, durationInFrames], [params.from, params.to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  }),
})
```

```ts
// src/video-engine/motion/recipes/slide.ts
import { z } from 'zod'
import { Easing, interpolate } from 'remotion'
import { createMotionRecipeImpl, IDENTITY_TRANSFORM } from '../types'

export const slide = createMotionRecipeImpl({
  id: 'slide', version: '1.0.0',
  paramsSchema: z.object({ axis: z.enum(['x', 'y']).default('y'), distance: z.number().default(0.12), easing: z.enum(['linear', 'out']).default('out') }),
  apply: ({ frame, durationInFrames, params }) => {
    const p = interpolate(frame, [0, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      easing: params.easing === 'out' ? Easing.out(Easing.cubic) : Easing.linear,
    })
    return { ...IDENTITY_TRANSFORM, x: params.axis === 'x' ? p * params.distance : 0, y: params.axis === 'y' ? p * params.distance : 0 }
  },
})
```

```ts
// src/video-engine/motion/recipes/scale.ts
import { z } from 'zod'
import { Easing, interpolate } from 'remotion'
import { createMotionRecipeImpl, IDENTITY_TRANSFORM } from '../types'

export const scale = createMotionRecipeImpl({
  id: 'scale', version: '1.0.0',
  paramsSchema: z.object({ from: z.number().default(0.92), to: z.number().default(1) }),
  apply: ({ frame, durationInFrames, params }) => ({
    ...IDENTITY_TRANSFORM,
    scale: interpolate(frame, [0, durationInFrames], [params.from, params.to], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    }),
  }),
})
```

```ts
// src/video-engine/motion/recipes/reveal.ts
import { z } from 'zod'
import { Easing, interpolate } from 'remotion'
import { createMotionRecipeImpl, IDENTITY_TRANSFORM } from '../types'

/** Fade in while lifting slightly — a masked-reveal feel without a real mask. */
export const reveal = createMotionRecipeImpl({
  id: 'reveal', version: '1.0.0',
  paramsSchema: z.object({ distance: z.number().default(0.04) }),
  apply: ({ frame, durationInFrames, params }) => {
    const p = interpolate(frame, [0, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    })
    return { ...IDENTITY_TRANSFORM, opacity: 1 - p, y: p * params.distance }
  },
})
```

```ts
// src/video-engine/motion/recipes/pulse.ts
import { z } from 'zod'
import { IDENTITY_TRANSFORM, createMotionRecipeImpl } from '../types'

/**
 * Continuous breathing scale. Not windowed by a duration — it is evaluated
 * purely from the absolute frame, so it stays deterministic and loop-safe.
 */
export const pulse = createMotionRecipeImpl({
  id: 'pulse', version: '1.0.0',
  paramsSchema: z.object({ amplitude: z.number().default(0.03), hz: z.number().default(0.5) }),
  apply: ({ frame, fps, params }) => ({
    ...IDENTITY_TRANSFORM,
    scale: 1 + Math.sin((frame / fps) * Math.PI * 2 * params.hz) * params.amplitude,
  }),
})
```

```ts
// src/video-engine/motion/recipes/parallax.ts
import { z } from 'zod'
import { IDENTITY_TRANSFORM, createMotionRecipeImpl } from '../types'

/** Slow continuous drift, evaluated from the absolute frame. */
export const parallax = createMotionRecipeImpl({
  id: 'parallax', version: '1.0.0',
  paramsSchema: z.object({ amplitude: z.number().default(0.02), hz: z.number().default(0.1), phase: z.number().default(0) }),
  apply: ({ frame, fps, params }) => {
    const t = (frame / fps) * Math.PI * 2 * params.hz + params.phase
    return { ...IDENTITY_TRANSFORM, x: Math.sin(t) * params.amplitude, y: Math.cos(t) * params.amplitude * 0.6 }
  },
})
```

```ts
// src/video-engine/motion/recipes/camera-flythrough.ts
import { z } from 'zod'
import { Easing, interpolate } from 'remotion'
import { IDENTITY_TRANSFORM, createMotionRecipeImpl } from '../types'

/**
 * Dolly-in: scales up and drifts slightly while rotating a touch, as if the
 * camera pushed toward the subject. Windowed, so it settles rather than loops.
 */
export const cameraFlythrough = createMotionRecipeImpl({
  id: 'camera-flythrough', version: '1.0.0',
  paramsSchema: z.object({ from: z.number().default(0.86), to: z.number().default(1.06), drift: z.number().default(0.01) }),
  apply: ({ frame, durationInFrames, params }) => {
    const p = interpolate(frame, [0, durationInFrames], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad),
    })
    return {
      ...IDENTITY_TRANSFORM,
      scale: params.from + (params.to - params.from) * p,
      x: (1 - p) * params.drift,
      rotate: (1 - p) * 1.5,
    }
  },
})
```

- [ ] **Step 5: Implement `src/video-engine/motion/motion-registry.ts`**

```ts
import type { MotionRecipeImpl } from './types'

/** Registry for motion *implementations* — the metadata registry stores only id/version. */
export const motionRecipeRegistry = new Map<string, MotionRecipeImpl>()

export function registerMotionRecipeImpl(recipe: MotionRecipeImpl): void {
  motionRecipeRegistry.set(recipe.id, recipe)
}

export function getMotionRecipe(id: string): MotionRecipeImpl {
  const r = motionRecipeRegistry.get(id)
  if (!r) throw new Error(`Unknown motion recipe implementation "${id}"`)
  return r
}

export function clearMotionRecipes(): void {
  motionRecipeRegistry.clear()
}
```

- [ ] **Step 6: Implement `src/video-engine/motion/apply.ts`**

```ts
import type { CompiledLayer } from '@/video-engine/ir'
import { getMotionRecipe } from './motion-registry'
import { composeTransforms, IDENTITY_TRANSFORM, type LayerTransform } from './types'

/**
 * Resolves all motion windows on a layer at an absolute frame. Pure: the same
 * (layer, frame, fps) always yields the same transform. Windows outside their
 * range contribute nothing because each recipe clamps its own interpolation.
 */
export function applyMotion(layer: CompiledLayer, absoluteFrame: number, fps: number): LayerTransform {
  let out: LayerTransform = IDENTITY_TRANSFORM
  for (const motion of layer.motion) {
    const recipe = getMotionRecipe(motion.recipeId)
    const frame = absoluteFrame - motion.frameWindow.from
    out = composeTransforms(out, recipe.apply({
      frame, fps,
      durationInFrames: Math.max(1, motion.frameWindow.durationInFrames - 1),
      params: motion.params as never,
    }))
  }
  return out
}
```

- [ ] **Step 7: Implement `src/video-engine/motion/register.ts` and `index.ts`**

```ts
// src/video-engine/motion/register.ts
import { registerMotion } from '@/video-engine/registry'
import { clearMotionRecipes, registerMotionRecipeImpl } from './motion-registry'
import { fade } from './recipes/fade'
import { reveal } from './recipes/reveal'
import { slide } from './recipes/slide'
import { scale } from './recipes/scale'
import { pulse } from './recipes/pulse'
import { parallax } from './recipes/parallax'
import { cameraFlythrough } from './recipes/camera-flythrough'

export const MOTION_RECIPES = [fade, reveal, slide, scale, pulse, parallax, cameraFlythrough]

export function registerMotionRecipes(): void {
  clearMotionRecipes()
  for (const recipe of MOTION_RECIPES) {
    registerMotionRecipeImpl(recipe)
    registerMotion({ id: recipe.id, version: recipe.version, paramsSchema: recipe.paramsSchema, defaults: {} })
  }
}
```

```ts
// src/video-engine/motion/index.ts
export type { LayerTransform, MotionArgs, MotionRecipeImpl } from './types'
export { IDENTITY_TRANSFORM, composeTransforms, createMotionRecipeImpl } from './types'
export { motionRecipeRegistry, getMotionRecipe, registerMotionRecipeImpl, clearMotionRecipes } from './motion-registry'
export { MOTION_RECIPES, registerMotionRecipes } from './register'
export { applyMotion } from './apply'
```

- [ ] **Step 8: Implement `src/video-engine/runtime/MotionLayer.tsx` and wire it into `SceneRenderer.tsx`**

```tsx
// src/video-engine/runtime/MotionLayer.tsx
import React from 'react'
import type { CompiledLayer, RenderSettings } from '@/video-engine/ir'
import { applyMotion } from '@/video-engine/motion'

/**
 * Applies a layer's motion as a CSS transform around its content. Kept separate
 * from renderer backends so recipes never receive or return transforms.
 */
export const MotionLayer: React.FC<{ layer: CompiledLayer; absoluteFrame: number; render: RenderSettings; children: React.ReactNode }> = ({ layer, absoluteFrame, render, children }) => {
  const t = applyMotion(layer, absoluteFrame, render.fps)
  return (
    <div style={{
      width: '100%', height: '100%',
      opacity: t.opacity,
      transform: `translate(${t.x * 100}%, ${t.y * 100}%) scale(${t.scale}) rotate(${t.rotate}deg)`,
      transformOrigin: 'center center',
    }}>
      {children}
    </div>
  )
}
```

In `src/video-engine/runtime/SceneRenderer.tsx`, replace the layer body inside the `AbsoluteFill` with:

```tsx
          <AbsoluteFill key={layer.id} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, overflow: 'hidden' }}>
            <MotionLayer layer={layer} absoluteFrame={absoluteFrame} render={scene.render}>
              <LayerRenderer layer={layer} absoluteFrame={absoluteFrame} render={scene.render} seed={scene.seed} />
            </MotionLayer>
          </AbsoluteFill>
```

and add the import:

```tsx
import { MotionLayer } from './MotionLayer'
```

- [ ] **Step 9: Register motion recipes in `register-backends.ts`**

```ts
import { clearRegistry, clearRendererBackends, registerRendererBackend } from '@/video-engine/registry'
import { registerMetadata } from '@/video-engine/registry/register'
import { clearCanvasRecipes, registerCanvasRecipes, Canvas2DBackend } from '@/video-engine/canvas'
import { clearThreeRecipes, registerThreeRecipes, ThreeBackend } from '@/video-engine/three'
import { clearMotionRecipes, registerMotionRecipes } from '@/video-engine/motion'
import { DomBackend } from './DomBackend'

/**
 * Wipes every registry and re-registers the full engine. Tests call this in
 * `beforeEach` so one test's registrations never leak into the next.
 */
export function clearRegistered(): void {
  clearRegistry()
  clearRendererBackends()
  clearCanvasRecipes()
  clearThreeRecipes()
  clearMotionRecipes()
}

/** Full registration used by the Remotion entry point, the app, and tests. */
export function registerBackends(): void {
  registerMetadata()
  registerCanvasRecipes()
  registerThreeRecipes()
  registerMotionRecipes()
  registerRendererBackend('dom', DomBackend as unknown as (p: unknown) => unknown)
  registerRendererBackend('canvas2d', Canvas2DBackend as unknown as (p: unknown) => unknown)
  registerRendererBackend('three', ThreeBackend as unknown as (p: unknown) => unknown)
}
```

- [ ] **Step 10: Run tests, bundle check, typecheck**

Run: `npx vitest run tests/video-engine && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/video-engine/motion src/video-engine/runtime tests/video-engine/motion.test.ts
git commit -m "feat: motion recipes + typography layer transform"
```

---

### Task 12: AI contracts and the 30-second fixture project

**Files (layout locked by spec §2 — `src/ai/{story,visual,assets,tts}`):**
- Create: `src/ai/story/contract.ts`, `src/ai/story/fixture.ts`
- Create: `src/ai/visual/contract.ts`, `src/ai/visual/fixture.ts`
- Create: `src/ai/assets/contract.ts`, `src/ai/assets/fixture.ts` — the **Asset Director boundary** (spec §2: the folder is named `assets`, not `asset-director/`)
- Create: `src/ai/tts/contract.ts`, `src/ai/tts/fixture.ts`
- Create: `src/ai/index.ts`
- Create: `src/ai/project.ts` — assembles the fixture DSL, builds the timeline, compiles every scene
- Create: `src/ai/demo-project.dsl.ts` + `src/ai/fixtures/demo-project.dsl.json`
- Test: `tests/ai/contracts.test.ts`, `tests/ai/fixture-project.test.ts`

**Interfaces:**
- Consumes: `@/video-engine/schema`, `@/video-engine/compiler`, `@/timeline/master`, `@/timeline/voice`.
- Produces:
  - `interface StoryDirector { direct(brief: Brief): Promise<StoryPlan> }`
  - `interface VisualDirector { direct(input: VisualDirectorInput): Promise<SceneDSL[]> }`
  - `interface AssetDirector { plan(input: AssetPlanningInput): Promise<AssetPlan> }`
  - `interface TtsAdapter { synthesize(input: TtsInput): Promise<VoiceTimeline> }`  ← spec §8 signature
  - `createFixtureStoryDirector()`, `createFixtureVisualDirector()`, `createFixtureAssetDirector()`, `createFixtureTtsAdapter()`
  - `buildFixtureProject(): { dsl: ProjectDsl; compiledScenes: CompiledScene[]; timeline: MasterTimeline }`

> **Boundary rule (spec §2, "Đặc biệt quan trọng"):** `src/ai/**` may import `@/timeline` (read-only), `@/video-engine/schema`, and `@/shared`. It must NEVER import `@/video-engine/compiler`, `@/video-engine/ir`, `@/video-engine/runtime`, `@/video-engine/compositions`, or any renderer. `src/ai/project.ts` is the **composition root** — it is the one place allowed to call the compiler, and it is not a director.

> **`VisualDirectorInput` (spec §8):** `{ scenePurpose, duration, availableCompositions, availableVisualRecipes, availableMotionRecipes, style, assets, timelineWindow, constraints }` — the id/schema lists only, **never source code of a renderer**. Those lists come from `listAvailable()`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/ai/contracts.test.ts
import { describe, it, expect } from 'vitest'
import { createFixtureStoryDirector, createFixtureVisualDirector, createFixtureTtsAdapter } from '@/ai'

describe('ai contracts + fixture implementations', () => {
  it('fixture story director returns the 4-scene 30s outline', async () => {
    const plan = await createFixtureStoryDirector().direct({ topic: 'DeLyAI2 Phase 0', targetSeconds: 30, language: 'vi' })
    expect(plan.scenes.map((s) => s.durationSeconds)).toEqual([6, 9, 9, 6])
    expect(plan.scenes.map((s) => s.purpose)).toEqual(['hook', 'explain_concept', 'explain_network', 'outro'])
  })
  it('fixture visual director assigns recipes with declared renderers', async () => {
    const plan = await createFixtureVisualDirector().direct({ topic: 'x', language: 'vi', scenes: [], availableCompositions: [], availableVisualRecipes: [], availableMotionRecipes: [], style: {}, assets: [], timelineWindow: { startSeconds: 0, durationSeconds: 30 }, constraints: {} })
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
```

> **Registration note:** `buildFixtureProject` compiles scenes, so the recipes the fixture DSL references must already be registered before it runs. The tests below call `registerBackends()` (from `@/video-engine/runtime`), which is the single full-registration entry point — it registers metadata, canvas recipes, three recipes, motion recipes, and the renderer backends. Do **not** call the individual `register*Recipes()` functions here; `registerBackends()` owns that order.

```ts
// tests/ai/fixture-project.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { buildFixtureProject } from '@/ai/project'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'

beforeEach(() => { clearRegistered(); registerBackends() })

describe('fixture project', () => {
  it('compiles four scenes on a 900-frame timeline', () => {
    const { compiledScenes, timeline } = buildFixtureProject()
    expect(compiledScenes).toHaveLength(4)
    expect(timeline.totalFrames).toBe(900)
    expect(compiledScenes.map((s) => s.timing.startFrame)).toEqual([0, 180, 450, 720])
    expect(compiledScenes.map((s) => s.timing.durationInFrames)).toEqual([180, 270, 270, 180])
  })
  it('scene windows are contiguous with no gaps or overlaps', () => {
    const { compiledScenes, timeline } = buildFixtureProject()
    for (let i = 1; i < compiledScenes.length; i++) {
      const prev = compiledScenes[i - 1]!.timing
      expect(compiledScenes[i]!.timing.startFrame).toBe(prev.startFrame + prev.durationInFrames)
    }
    const last = compiledScenes[compiledScenes.length - 1]!.timing
    expect(last.startFrame + last.durationInFrames).toBe(timeline.totalFrames)
  })
  it('renders a canvas2d layer and a three layer somewhere in the project', () => {
    const { compiledScenes } = buildFixtureProject()
    const renderers = compiledScenes.flatMap((s) => s.layers.map((l) => l.renderer))
    expect(renderers).toContain('canvas2d')
    expect(renderers).toContain('three')
  })
  it('matches the spec §11 renderer-per-scene table exactly', () => {
    const { compiledScenes } = buildFixtureProject()
    // Spec §11: 1 Hero = DOM, 2 Split = DOM + Canvas 2D, 3 Network = Three.js, 4 Outro = DOM.
    // A scene's renderer set is the set of its visual layers' renderers; DOM text
    // (typography) adds no renderer. Scenes 1 and 4 are DOM-only, so they have no
    // visual layers — the test asserts that, so a decorative canvas recipe cannot
    // drift in and silently change the table.
    const perScene = compiledScenes.map((s) => [...new Set(s.layers.map((l) => l.renderer))].sort())
    expect(perScene).toEqual([[], ['canvas2d'], ['three'], []])
    // Every scene still shows text; DOM-only means "no visual layer", not "empty scene".
    expect(compiledScenes.every((s) => s.typography !== null)).toBe(true)
  })
  it('compilation is deterministic: same DSL yields the same compiledHash', () => {
    const a = buildFixtureProject().compiledScenes.map((s) => s.provenance.compiledHash)
    const b = buildFixtureProject().compiledScenes.map((s) => s.provenance.compiledHash)
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ai`
Expected: FAIL.

- [ ] **Step 3: Implement the four contracts (spec §8 signatures)**

```ts
// src/ai/story/contract.ts
import type { ScenePurpose } from '@/video-engine/schema'

export type Brief = { topic: string; targetSeconds: number; language: string }
export type StorySceneOutline = {
  id: string
  purpose: ScenePurpose
  durationSeconds: number
  title: string
  narration: string
}
export type StoryPlan = { title: string; scenes: StorySceneOutline[] }

/** Plans narrative structure only. Never plans visuals, never emits DSL, never measures frames. */
export interface StoryDirector { direct(brief: Brief): Promise<StoryPlan> }
```

```ts
// src/ai/visual/contract.ts
import type { CompositionId, SceneDSL, StyleRef } from '@/video-engine/schema'
import type { StorySceneOutline } from '@/ai/story/contract'

export type AvailableRecipeRef = { id: string; version: string; renderer?: string }

/**
 * The engine hands the director ids and schemas — never renderer source code
 * (spec §8). `available*` come from `listAvailable()`.
 */
export type VisualDirectorInput = {
  topic: string
  language: string
  scenes: StorySceneOutline[]
  availableCompositions: CompositionId[]
  availableVisualRecipes: AvailableRecipeRef[]
  availableMotionRecipes: AvailableRecipeRef[]
  style: StyleRef
  assets: { id: string; kind: string; source: string }[]
  timelineWindow: { startSeconds: number; durationSeconds: number }
  constraints: { maxLayersPerScene?: number; allowedCompositions?: CompositionId[] }
}

/** Chooses composition + recipes + params and returns DSL. Never picks a renderer. */
export interface VisualDirector { direct(input: VisualDirectorInput): Promise<SceneDSL[]> }
```

```ts
// src/ai/assets/contract.ts
export type AssetPlanningInput = { topic: string; language: string; scenes: { id: string; narration: string }[] }
export type AssetPlan = { assets: { id: string; kind: 'image' | 'audio' | 'font' | 'video'; source: string }[] }

/** Resolves assets to ids/sources. Phase 0 returns an empty plan. */
export interface AssetDirector { plan(input: AssetPlanningInput): Promise<AssetPlan> }
```

```ts
// src/ai/tts/contract.ts
import type { VoiceTimeline } from '@/timeline/voice'

export type TtsInput = { text: string; language: string; voice: string; sceneId: string }

/** Produces a voice timeline. Phase 0 has no audio — only fixture timing. */
export interface TtsAdapter { synthesize(input: TtsInput): Promise<VoiceTimeline> }
```

```ts
// src/ai/index.ts
export type { Brief, StoryDirector, StoryPlan, StorySceneOutline } from './story/contract'
export type { AvailableRecipeRef, VisualDirector, VisualDirectorInput } from './visual/contract'
export type { AssetDirector, AssetPlan, AssetPlanningInput } from './assets/contract'
export type { TtsAdapter, TtsInput } from './tts/contract'

export { createFixtureStoryDirector, FIXTURE_STORY } from './story/fixture'
export { createFixtureVisualDirector, FIXTURE_SCENES } from './visual/fixture'
export { createFixtureAssetDirector } from './assets/fixture'
export { createFixtureTtsAdapter } from './tts/fixture'
```

- [ ] **Step 4: Implement the fixture director implementations**

```ts
// src/ai/story/fixture.ts
import type { Brief, StoryDirector, StoryPlan } from './contract'

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
  return { async direct(_brief: Brief) { return structuredClone(FIXTURE_STORY) } }
}
```

```
// src/ai/visual/fixture.ts
import type { SceneDSL } from '@/video-engine/schema'
import type { VisualDirector, VisualDirectorInput } from './contract'

/**
 * The Phase 0 vertical slice, authored once. `FIXTURE_SCENES` is the single
 * source: the director returns it, and demo-project.dsl.ts wraps it in a
 * ProjectDsl. Recipe ids are engine-owned; the director only chooses among ids
 * the engine advertises via `listAvailable()`.
 *
 * Layer/renderer assignment follows spec §11 exactly. Scene 1 and Scene 4 are
 * DOM-only, so their `visual` arrays are empty — a scene with no visual layers
 * is a valid DOM scene, not a missing layer. Do not add a decorative canvas
 * recipe to them: that silently changes their renderer to `DOM + Canvas 2D`
 * and breaks the §11 table.
 */
export const FIXTURE_SCENES: SceneDSL[] = [
  {
    // 1. Hero — typography reveal, DOM only. 6.0s. (spec §11 row 1)
    schemaVersion: '0.1', sceneId: 'scene-hero', purpose: 'hook', duration: 6,
    composition: 'hero',
    visual: [],
    motion: [],
    typography: { text: 'DeLyAI2', animation: 'reveal', slot: 'main', startSeconds: 0.4, durationSeconds: 5 },
    style: { styleId: 'default' }, seed: 20261003,
  },
  {
    // 2. Split explain — dom text + `particle-field`, DOM + Canvas 2D. 9.0s. (spec §11 row 2)
    schemaVersion: '0.1', sceneId: 'scene-split', purpose: 'explain_concept', duration: 9,
    composition: 'split',
    visual: [{ id: 'split-particles', recipe: 'particle-field', slot: 'aside', params: { count: 48, hue: 200, speed: 1 } }],
    motion: [{ recipe: 'slide', target: 'split-particles', params: { axis: 'x', distance: 0.08, easing: 'out' } }],
    typography: { text: 'AI mô tả ý định', animation: 'fade', slot: 'main', startSeconds: 1, durationSeconds: 4 },
    style: { styleId: 'default' }, seed: 20261003,
  },
  {
    // 3. 3D network — `network-graph` + `camera-flythrough`, Three.js. 9.0s. (spec §11 row 3)
    schemaVersion: '0.1', sceneId: 'scene-network', purpose: 'explain_network', duration: 9,
    composition: 'full-screen',
    visual: [{ id: 'network', recipe: 'network-graph', slot: 'main', params: { nodes: 28, radius: 2.6, color: '#4a9eff' } }],
    motion: [{ recipe: 'camera-flythrough', target: 'network', params: { from: 0.9, to: 1.05 } }],
    typography: { text: 'Một master timeline', animation: 'word-by-word', slot: 'main', startSeconds: 0.6, durationSeconds: 4 },
    style: { styleId: 'default' }, seed: 20261003,
  },
  {
    // 4. Typography outro — typography, DOM only. 6.0s. (spec §11 row 4)
    schemaVersion: '0.1', sceneId: 'scene-outro', purpose: 'outro', duration: 6,
    composition: 'centered',
    visual: [],
    motion: [],
    typography: { text: 'Phase 1', animation: 'typewriter', slot: 'main', startSeconds: 0.8, durationSeconds: 3 },
    style: { styleId: 'default' }, seed: 20261003,
  },
]

export function createFixtureVisualDirector(): VisualDirector {
  return { async direct(_input: VisualDirectorInput) { return structuredClone(FIXTURE_SCENES) } }
}
```

```ts
// src/ai/assets/fixture.ts
import type { AssetDirector, AssetPlanningInput } from './contract'

export function createFixtureAssetDirector(): AssetDirector {
  return { async plan(_input: AssetPlanningInput) { return { assets: [] } } }
}
```

```ts
// src/ai/tts/fixture.ts
import type { VoiceTimeline } from '@/timeline/voice'
import type { TtsAdapter, TtsInput } from './contract'

/**
 * ~2.6 words/second, floored at 1s. `timingSource: "fixture"` is the honest
 * label: this is not real audio, and `words` stays empty because estimated
 * timing is never word-exact (spec §5.4).
 */
const WORDS_PER_SECOND = 2.6

export function createFixtureTtsAdapter(): TtsAdapter {
  return {
    async synthesize({ text, sceneId }: TtsInput): Promise<VoiceTimeline> {
      const words = text.trim().split(/\s+/).filter(Boolean).length
      const durationSeconds = Math.max(1, Number((words / WORDS_PER_SECOND).toFixed(3)))
      const endMs = Math.round(durationSeconds * 1000)
      return {
        timingSource: 'fixture',
        totalMs: endMs,
        segments: [{ id: `${sceneId}-voice`, text, startMs: 0, endMs, words: [], timingSource: 'fixture', sceneId }],
      }
    },
  }
}
```

- [ ] **Step 5: Implement `src/ai/demo-project.dsl.ts` — the ProjectDsl wrapper**

```ts
import type { ProjectDsl } from '@/video-engine/schema'
import { FIXTURE_SCENES } from './visual/fixture'

/**
 * The Phase 0 vertical slice as a ProjectDsl. The scenes are NOT re-authored
 * here — they come from the visual director's fixture, so the DSL the engine
 * renders is exactly the DSL the director produced.
 *
 * 6 + 9 + 9 + 6 = 30s @ 30fps = 180 + 270 + 270 + 180 = 900 frames.
 */
export const demoProjectDsl: ProjectDsl = {
  dslVersion: '0.1',
  project: { id: 'delyai2-phase0-demo', title: 'DeLyAI2 — Video Engine Phase 0', language: 'vi' },
  render: { fps: 30, width: 1920, height: 1080 },
  style: { styleId: 'default' },
  seed: 20261003,
  voiceScenePolicy: 'strict',
  music: null,
  scenes: FIXTURE_SCENES,
}
```

> **Slot note:** each scene's `visual[].slot` must be one of the slots its composition declares. Task 6 declares: `hero` `["main"]`, `centered` `["main"]`, `full-screen` `["main"]`, `split` `["main","aside"]`, `grid` `["cell-1".."cell-4"]`, `comparison` `["left","right"]`. The compiler throws `UNKNOWN_SLOT` otherwise, so a mismatch fails loudly rather than rendering blank.

- [ ] **Step 6: Implement `src/ai/project.ts` — the composition root**

```ts
import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'
import { parseProjectDsl, type ProjectDsl } from '@/video-engine/schema'
import { compileScene } from '@/video-engine/compiler'
import { buildMasterTimeline } from '@/timeline/master'
import { demoProjectDsl } from './demo-project.dsl'

export type FixtureProject = { dsl: ProjectDsl; compiledScenes: CompiledScene[]; timeline: MasterTimeline }

/**
 * Composition root for the Phase 0 demo: parse → timeline → compile.
 *
 * This is the ONLY module in `src/ai/**` allowed to import the compiler. It is
 * the composition root, not a director — directors produce DSL and stop there.
 */
export function buildFixtureProject(input: ProjectDsl = demoProjectDsl): FixtureProject {
  const parsed = parseProjectDsl(input)
  const timeline = buildMasterTimeline({
    fps: parsed.render.fps,
    width: parsed.render.width,
    height: parsed.render.height,
    voiceScenePolicy: parsed.voiceScenePolicy,
    voice: null,
    music: null,
    scenes: parsed.scenes.map((s) => ({ sceneId: s.sceneId, duration: s.duration })),
  })
  const compiledScenes = parsed.scenes.map((scene) => compileScene({ dsl: scene, timeline, assets: [] }))
  return { dsl: parsed, compiledScenes, timeline }
}
```

> **Dependency note:** `src/ai/project.ts` is the one file that breaks the `ai → video-engine` rule, deliberately and by spec §2. Add an ESLint override in Task 1's `eslint.config.js` so this exception is explicit rather than accidental:

```js
{
  files: ['src/ai/project.ts'],
  rules: { 'no-restricted-imports': 'off' },
},
```

- [ ] **Step 7: Add the exported fixture DSL JSON**

Write the same object from Step 5 as `src/ai/fixtures/demo-project.dsl.json` (pretty-printed, 2-space indent, no comments, scenes expanded inline rather than referencing `FIXTURE_SCENES`). It exists so the DSL is inspectable outside TypeScript. `demo-project.dsl.ts` remains the single source used by `buildFixtureProject`.

- [ ] **Step 8: Run tests and typecheck**

Run: `npx vitest run tests/ai && npx tsc --noEmit`
Expected: PASS (4 scenes, 900 frames, contiguous windows, deterministic hashes).

- [ ] **Step 9: Commit**

```bash
git add src/ai tests/ai eslint.config.js
git commit -m "feat: ai director contracts + 30s fixture project dsl"
```

---

### Task 13: QA layers

**Files:**
- Create: `src/qa/schema-check.ts`, `timeline-check.ts`, `scene-check.ts`, `geometry-check.ts`, `render-check.ts`, `vision/index.ts`, `vision/fixture.ts`, `index.ts`
- Test: `tests/qa/qa.test.ts`

**Interfaces:**
- Consumes: `@/video-engine/schema`, `@/video-engine/ir`, `@/video-engine/registry`, `@/timeline/diagnostics`, `@/timeline/master`.
- Produces:
  - `checkSchema(value: unknown): Diagnostic[]`
  - `checkTimeline(timeline: MasterTimeline): Diagnostic[]`
  - `checkScenes(scenes: CompiledScene[]): Diagnostic[]`
  - `checkGeometry(scenes: CompiledScene[]): Diagnostic[]`
  - `checkRender(layers: CompiledLayer[]): Diagnostic[]`
  - `interface VisionChecker { check(input: VisionInput): Promise<VisionReport> }`, `createFixtureVisionChecker()`
  - `runAllChecks(input): Diagnostic[]`

> **Boundary:** the vision layer is a **contract only** in Phase 0 — no model is called. `createFixtureVisionChecker` returns `{ available: false, findings: [] }` so downstream code can already be written against the interface.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/qa/qa.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { checkSchema, checkTimeline, checkGeometry, checkRender, createFixtureVisionChecker } from '@/qa'
import { clearRendererBackends, clearRegistry } from '@/video-engine/registry'
import { buildMasterTimeline } from '@/timeline/master'
import { buildFixtureProject } from '@/ai/project'
import { registerBackends } from '@/video-engine/runtime'

beforeEach(() => { clearRegistry(); clearRendererBackends(); registerBackends() })

describe('qa layers', () => {
  it('checkSchema reports an error path for a malformed project', () => {
    const d = checkSchema({ dslVersion: '0.1', scenes: [{ sceneId: 'x' }] })
    expect(d.some((x) => x.severity === 'error' && x.code === 'SCHEMA_INVALID')).toBe(true)
  })
  it('checkTimeline verifies contiguity and totalFrames', () => {
    const t = buildMasterTimeline({ fps: 30, width: 1920, height: 1080, voiceScenePolicy: 'strict', scenes: [{ sceneId: 'a', duration: 6 }, { sceneId: 'b', duration: 9 }] })
    expect(checkTimeline(t)).toEqual([])
    expect(checkTimeline({ ...t, totalFrames: 999 })).toHaveLength(1)
  })
  it('checkRender flags a layer whose renderer has no backend', () => {
    const { compiledScenes } = buildFixtureProject()
    const layers = compiledScenes.flatMap((s) => s.layers)
    expect(checkRender(layers)).toEqual([]) // all backends registered
    clearRendererBackends()
    expect(checkRender(layers).every((d) => d.code === 'RENDERER_BACKEND_MISSING')).toBe(true)
    expect(checkRender(layers).length).toBeGreaterThan(0)
  })
  it('checkGeometry passes for the fixture project (all rects inside frame)', () => {
    const { compiledScenes } = buildFixtureProject()
    expect(checkGeometry(compiledScenes)).toEqual([])
  })
  it('fixture vision checker reports itself unavailable', async () => {
    const r = await createFixtureVisionChecker().check({ scenes: [] })
    expect(r.available).toBe(false)
    expect(r.findings).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/qa`
Expected: FAIL.

- [ ] **Step 3: Implement `src/qa/schema-check.ts`, `timeline-check.ts`**

```ts
// src/qa/schema-check.ts
import { ProjectDSLSchema } from '@/video-engine/schema'
import type { Diagnostic } from '@/timeline/diagnostics'

/** Layer 1 — schema. Pure validation; never repairs or coerces input. */
export function checkSchema(value: unknown): Diagnostic[] {
  const result = ProjectDSLSchema.safeParse(value)
  if (result.success) return []
  return result.error.issues.map((issue) => ({
    severity: 'error' as const,
    code: 'SCHEMA_INVALID',
    message: `${issue.path.join('.') || '<root>'}: ${issue.message}`,
  }))
}
```

```ts
// src/qa/timeline-check.ts
import type { Diagnostic } from '@/timeline/diagnostics'
import type { MasterTimeline } from '@/timeline/master'

/** Layer 2 — timeline. Checks contiguity and that totalFrames matches the sum. */
export function checkTimeline(timeline: MasterTimeline): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  let cursor = 0
  for (const [sceneId, window] of Object.entries(timeline.sceneWindows)) {
    if (window.startFrame !== cursor) {
      diagnostics.push({ severity: 'error', code: 'TIMELINE_GAP', sceneId, message: `Scene "${sceneId}" starts at ${window.startFrame}, expected ${cursor}.` })
    }
    if (!Number.isInteger(window.durationInFrames) || window.durationInFrames <= 0) {
      diagnostics.push({ severity: 'error', code: 'TIMELINE_BAD_DURATION', sceneId, message: `Scene "${sceneId}" has a non-positive or non-integer duration (${window.durationInFrames}).` })
    }
    cursor += window.durationInFrames
  }
  if (cursor !== timeline.totalFrames) {
    diagnostics.push({ severity: 'error', code: 'TIMELINE_TOTAL_MISMATCH', message: `Summed window frames ${cursor} does not equal totalFrames ${timeline.totalFrames}.` })
  }
  return diagnostics
}
```

- [ ] **Step 4: Implement `src/qa/scene-check.ts`, `geometry-check.ts`, `render-check.ts`**

```ts
// src/qa/scene-check.ts
import type { Diagnostic } from '@/timeline/diagnostics'
import type { CompiledLayer, CompiledScene } from '@/video-engine/ir'
import { hasComposition, hasVisual, resolveComposition } from '@/video-engine/registry'

/** Layer 3 — scene. Registry membership, slot membership, and frame windows. */
export function checkScenes(scenes: CompiledScene[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const scene of scenes) {
    if (!hasComposition(scene.composition.id)) {
      diagnostics.push({ severity: 'error', code: 'QA_UNKNOWN_COMPOSITION', sceneId: scene.sceneId, message: `Unknown composition "${scene.composition.id}".` })
      continue
    }
    const declared = new Set(resolveComposition(scene.composition.id).slots.map((s) => s.id))
    for (const layer of scene.layers) {
      if (!hasVisual(layer.recipeId)) {
        diagnostics.push({ severity: 'error', code: 'QA_UNKNOWN_RECIPE', sceneId: scene.sceneId, layerId: layer.id, message: `Layer "${layer.id}" uses unregistered visual recipe "${layer.recipeId}".` })
      }
      if (!declared.has(layer.slot)) {
        diagnostics.push({ severity: 'error', code: 'QA_UNKNOWN_SLOT', sceneId: scene.sceneId, layerId: layer.id, message: `Layer "${layer.id}" targets slot "${layer.slot}", which composition "${scene.composition.id}" does not declare.` })
      }
      const last = layer.frameWindow.from + layer.frameWindow.durationInFrames
      if (layer.frameWindow.from < 0 || last > scene.timing.durationInFrames) {
        diagnostics.push({ severity: 'error', code: 'QA_LAYER_OUT_OF_SCENE', sceneId: scene.sceneId, layerId: layer.id, message: `Layer "${layer.id}" window [${layer.frameWindow.from}, ${last}) exceeds the ${scene.timing.durationInFrames}-frame scene.` })
      }
    }
  }
  return diagnostics
}
```

```ts
// src/qa/geometry-check.ts
import type { Diagnostic } from '@/timeline/diagnostics'
import type { CompiledScene } from '@/video-engine/ir'
import { hasComposition, resolveComposition } from '@/video-engine/registry'

/** Layer 4 — geometry. Every slot rect must be a real, in-frame rectangle. */
export function checkGeometry(scenes: CompiledScene[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const scene of scenes) {
    if (!hasComposition(scene.composition.id)) continue
    const rects = resolveComposition(scene.composition.id).layout({ slots: scene.composition.slots, render: scene.render, style: {} })
    for (const rect of rects) {
      if (!(rect.width > 0) || !(rect.height > 0)) {
        diagnostics.push({ severity: 'error', code: 'QA_SLOT_DEGENERATE', sceneId: scene.sceneId, message: `Slot "${rect.slot}" has a non-positive size (${rect.width}x${rect.height}).` })
      }
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > scene.render.width || rect.y + rect.height > scene.render.height) {
        diagnostics.push({ severity: 'error', code: 'QA_SLOT_OUT_OF_FRAME', sceneId: scene.sceneId, message: `Slot "${rect.slot}" rect [${rect.x}, ${rect.y}, ${rect.width}, ${rect.height}] leaves the ${scene.render.width}x${scene.render.height} frame.` })
      }
    }
  }
  return diagnostics
}
```

```ts
// src/qa/render-check.ts
import type { Diagnostic } from '@/timeline/diagnostics'
import type { CompiledLayer } from '@/video-engine/ir'

/**
 * Layer 5 — render. Every layer's renderer must have a registered backend at
 * render time. This is the check that catches a recipe whose renderer kind was
 * never wired up (metadata-only registration deliberately fails it).
 */
export function checkRender(layers: CompiledLayer[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const layer of layers) {
    if (!hasRendererBackend(layer.renderer)) {
      diagnostics.push({ severity: 'error', code: 'RENDERER_BACKEND_MISSING', layerId: layer.id, message: `No renderer backend registered for "${layer.renderer}" (layer "${layer.id}").` })
    }
  }
  return diagnostics
}
```

> **Note:** this needs a non-throwing probe. Task 6's `renderer-backends.ts` must also export `hasRendererBackend(kind: RendererKind): boolean`, and `src/video-engine/registry/index.ts` must re-export it alongside `getRendererBackend`. Add it in Task 6 next to `registerRendererBackend`:

```ts
export const hasRendererBackend = (kind: RendererKind): boolean => backends.has(kind)
```

Then import it at the top of this file: `import { hasRendererBackend } from '@/video-engine/registry'`.

- [ ] **Step 5: Implement `src/qa/vision/index.ts`, `vision/fixture.ts`, `index.ts`**

```ts
// src/qa/vision/index.ts
import type { CompiledScene } from '@/video-engine/ir'

export type VisionInput = { scenes: CompiledScene[] }
export type VisionFinding = { sceneId: string; atFrame: number; kind: string; detail: string }
export type VisionReport = { available: boolean; findings: VisionFinding[] }

/**
 * Layer 6 — vision. Phase 0 ships the boundary only: no model is called, and
 * `available: false` means callers must not treat an empty report as a pass.
 */
export interface VisionChecker { check(input: VisionInput): Promise<VisionReport> }
```

```ts
// src/qa/vision/fixture.ts
import type { VisionChecker } from './index'

export function createFixtureVisionChecker(): VisionChecker {
  return { async check() { return { available: false, findings: [] } } }
}
```

```ts
// src/qa/index.ts
import type { Diagnostic } from '@/timeline/diagnostics'
import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'
import { checkScenes } from './scene-check'
import { checkTimeline } from './timeline-check'
import { checkGeometry } from './geometry-check'
import { checkRender } from './render-check'

export { checkSchema } from './schema-check'
export { checkTimeline } from './timeline-check'
export { checkScenes } from './scene-check'
export { checkGeometry } from './geometry-check'
export { checkRender } from './render-check'
export type { VisionChecker, VisionFinding, VisionInput, VisionReport } from './vision'
export { createFixtureVisionChecker } from './vision/fixture'

export type QaInput = { scenes: CompiledScene[]; timeline: MasterTimeline; checkRenderBackends?: boolean }

/** Structural QA only — no pixels, no model. Deterministic. */
export function runAllChecks(input: QaInput): Diagnostic[] {
  return [
    ...checkTimeline(input.timeline),
    ...checkScenes(input.scenes),
    ...checkGeometry(input.scenes),
    ...(input.checkRenderBackends === false ? [] : checkRender(input.scenes.flatMap((s) => s.layers))),
  ]
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run tests/qa && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/qa tests/qa
git commit -m "feat: five structural qa layers + vision boundary"
```

---

### Task 14: App shell (Vite SPA + Remotion Player)

**Files:**
- Create: `src/app/main.tsx`, `App.tsx`, `ProjectPlayer.tsx`, `app.css`
- Modify: `index.html` (from Task 1) to load `src/app/main.tsx`
- Test: `tests/app/smoke.test.ts`

**Interfaces:**
- Consumes: `@remotion/player`, `@/ai/project`, `@/video-engine/runtime`, `react-dom/client`.
- Produces: `App`, `ProjectPlayer`, `toPlayerProps`, and a Vite entry that registers backends before mounting.

> **UI rule:** the app shell never computes timeline or geometry. It calls `buildFixtureProject()` once and hands the result to `ProjectVideo`. No business logic in the shell.

- [ ] **Step 1: Write the failing test**

> **Why not render the `Player` here:** `@remotion/player` touches `window` at import time, so `renderToString` under the node environment is not a meaningful check. This test pins the shell's own logic — the player-props derivation — and Task 15 does the real render.

```ts
// tests/app/smoke.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { buildFixtureProject } from '@/ai/project'
import { clearRegistered, registerBackends } from '@/video-engine/runtime'
import { toPlayerProps } from '@/app/player-props'

beforeEach(() => { clearRegistered(); registerBackends() })

describe('app shell', () => {
  it('derives player props from the master timeline, not from constants', () => {
    const { compiledScenes, timeline } = buildFixtureProject()
    const props = toPlayerProps({ compiledScenes, timeline })
    expect(props.durationInFrames).toBe(900)
    expect(props.fps).toBe(30)
    expect(props.compositionWidth).toBe(1920)
    expect(props.compositionHeight).toBe(1080)
    expect(props.inputProps.scenes).toBe(compiledScenes)
    expect(props.inputProps.timeline).toBe(timeline)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/app`
Expected: FAIL.

- [ ] **Step 3: Implement `src/app/player-props.ts` and `src/app/ProjectPlayer.tsx`**

```ts
// src/app/player-props.ts
import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'

export type ProjectPlayerProps = { compiledScenes: CompiledScene[]; timeline: MasterTimeline; autoPlay?: boolean }
export type PlayerPropsShape = {
  inputProps: { scenes: CompiledScene[]; timeline: MasterTimeline }
  durationInFrames: number
  fps: number
  compositionWidth: number
  compositionHeight: number
}

/**
 * Pure derivation of the Player's props. Kept out of the component so the
 * shell's contract is testable without loading @remotion/player.
 */
export function toPlayerProps({ compiledScenes, timeline }: ProjectPlayerProps): PlayerPropsShape {
  return {
    inputProps: { scenes: compiledScenes, timeline },
    durationInFrames: timeline.totalFrames,
    fps: timeline.fps,
    compositionWidth: timeline.width,
    compositionHeight: timeline.height,
  }
}
```

```tsx
// src/app/ProjectPlayer.tsx
import React from 'react'
import { Player } from '@remotion/player'
import { ProjectVideo } from '@/video-engine/runtime'
import { toPlayerProps, type ProjectPlayerProps } from './player-props'

export type { ProjectPlayerProps }

/**
 * Thin wrapper: the shell owns no timing logic. It passes the compiled scenes
 * and the master timeline straight through to the renderer.
 */
export const ProjectPlayer: React.FC<ProjectPlayerProps> = (props) => (
  <Player
    component={ProjectVideo}
    {...toPlayerProps(props)}
    style={{ width: '100%', aspectRatio: `${props.timeline.width} / ${props.timeline.height}` }}
    controls
    autoPlay={props.autoPlay ?? true}
    loop
  />
)
```

- [ ] **Step 4: Implement `src/app/App.tsx`, `main.tsx`, `app.css`**

```tsx
// src/app/App.tsx
import React from 'react'
import { buildFixtureProject } from '@/ai/project'
import { ProjectPlayer } from './ProjectPlayer'

const project = buildFixtureProject()

export const App: React.FC = () => (
  <main style={{ maxWidth: 1080, margin: '0 auto', padding: 24 }}>
    <h1 style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>DeLyAI2 — Video Engine Phase 0</h1>
    <p style={{ fontFamily: 'Inter, system-ui, sans-serif', opacity: 0.7 }}>
      {project.compiledScenes.length} scenes · {project.timeline.totalFrames} frames @ {project.timeline.fps}fps
    </p>
    <ProjectPlayer compiledScenes={project.compiledScenes} timeline={project.timeline} />
  </main>
)
```

```tsx
// src/app/main.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerBackends } from '@/video-engine/runtime'
import { App } from './App'
import './app.css'

// Register recipes and renderer backends before the first render.
registerBackends()

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')
createRoot(container).render(<App />)
```

```css
/* src/app/app.css */
:root { color-scheme: dark; }
body { margin: 0; background: #05070d; color: #f7f9ff; font-family: Inter, system-ui, sans-serif; }
```

- [ ] **Step 5: Point `index.html` at the app entry**

`index.html` must contain `<div id="root"></div>` and `<script type="module" src="/src/app/main.tsx"></script>`.

- [ ] **Step 6: Run tests, typecheck, and a real build**

Run: `npx vitest run tests/app && npx tsc --noEmit && npx vite build`
Expected: PASS and a successful production build in `dist/`.

- [ ] **Step 7: Commit**

```bash
git add src/app index.html tests/app
git commit -m "feat: vite spa shell with remotion player"
```

---

### Task 15: Demo wiring, render script, determinism tests

**Files:**
- Modify: `remotion/DemoComposition.tsx`, `remotion/Root.tsx`
- Create: `remotion/calculate-metadata.ts` (or inline `calculateMetadata` in `Root.tsx`)
- Create: `tests/determinism/determinism.test.ts`
- Modify: `package.json` (add `render:stills` script)
- Test: `tests/demo/composition.test.ts`

**Interfaces:**
- Consumes: `@/ai/project`, `@/video-engine/runtime`, `@/video-engine/compiler`, `@/video-engine/canvas`, `@/video-engine/three`, `@remotion/renderer` (scripts only).
- Produces: real `DeLyDemo` composition whose duration comes from the master timeline; `out/still-*.png` still renders for the manual pixel check.

> **Determinism scope (spec §10):** compiler output is asserted **exactly** (hash equality). Canvas is asserted at the **sampling** level (same frame → same coordinates, no canvas required in Node). Three is asserted at the **structural** level (same descriptor → same hash). Pixel/PNG determinism for canvas and three is a **manual, documented check** (`npm run render:stills`), not a CI assertion — it depends on the GPU/browser and is not guaranteed.

> **`scripts/` (spec §2) — decision: not created.** Spec §2 lists `scripts/` for "render-demo, helpers". Every render command Phase 0 needs is a single `remotion` invocation, so it lives in `package.json` (`render:demo`, `render:stills`) exactly as spec §12's script table specifies. A `scripts/` directory would hold no file. It appears in the first phase whose build needs multi-step orchestration (e.g. render → QA vision pass → assemble). The still-pair determinism check (Step 8) is documented as two commands rather than scripted, because it is a human-judgement comparison, not an assertion.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/demo/composition.test.ts
import { describe, it, expect } from 'vitest'
import { buildFixtureProject } from '@/ai/project'
import { registerMetadata } from '@/video-engine/registry/register'

describe('demo composition source', () => {
  it('exposes 900 frames at 30fps for the fixture project', () => {
    registerMetadata()
    const { timeline } = buildFixtureProject()
    expect(timeline.totalFrames).toBe(900)
    expect(timeline.fps).toBe(30)
    expect(timeline.width).toBe(1920)
    expect(timeline.height).toBe(1080)
  })
})
```

```ts
// tests/determinism/determinism.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { registerMetadata } from '@/video-engine/registry/register'
import { buildFixtureProject } from '@/ai/project'
import { registerCanvasRecipes, getCanvasRecipe } from '@/video-engine/canvas'
import { registerThreeRecipes, getThreeRecipe, structuralHashOf } from '@/video-engine/three'
import { createSeededRandom } from '@/shared'

beforeEach(() => { registerMetadata(); registerCanvasRecipes(); registerThreeRecipes() })

describe('determinism levels', () => {
  it('compiler: identical DSL compiles to identical hashes', () => {
    const a = buildFixtureProject().compiledScenes.map((s) => s.provenance.compiledHash)
    const b = buildFixtureProject().compiledScenes.map((s) => s.provenance.compiledHash)
    expect(a).toEqual(b)
    for (const h of a) expect(h).toHaveLength(64)
  })
  it('canvas: sampled geometry is a pure function of the frame', () => {
    const recipe = getCanvasRecipe('particle-field')
    const params = recipe.paramsSchema.parse({})
    const run = () => {
      const state = recipe.prepare!(null, { width: 1920, height: 1080 }, params)
      const pts: number[] = []
      for (let f = 0; f < 60; f++) pts.push(...recipe.samplePositions!(f, 30, state, params, createSeededRandom(11)))
      return pts
    }
    expect(run()).toEqual(run())
    expect(run().every(Number.isFinite)).toBe(true)
  })
  it('three: descriptors are structurally stable and frame-sensitive', () => {
    const recipe = getThreeRecipe('network-graph')
    const args = (frame: number) => ({ frame, fps: 30, params: recipe.paramsSchema.parse({}), rng: createSeededRandom(1234), sizing: { width: 1920, height: 1080 } })
    expect(structuralHashOf(recipe.describe!(args(0)))).toBe(structuralHashOf(recipe.describe!(args(0))))
    expect(structuralHashOf(recipe.describe!(args(0)))).not.toBe(structuralHashOf(recipe.describe!(args(1))))
  })
  it('no Math.random anywhere in the video engine', async () => {
    const { readdir, readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const root = join(process.cwd(), 'src', 'video-engine')
    const files: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full)
        else if (/\.tsx?$/.test(entry.name)) files.push(full)
      }
    }
    await walk(root)
    const offenders: string[] = []
    for (const file of files) {
      if ((await readFile(file, 'utf-8')).includes('Math.random')) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
```

> **Note:** ESLint also enforces this (`no-restricted-properties` on `Math.random`, Task 1 Step 5). This test is the belt-and-braces version that fails the suite rather than only the linter.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/demo tests/determinism`
Expected: FAIL.

- [ ] **Step 3: Replace `remotion/DemoComposition.tsx` with the real one**

```tsx
import React from 'react'
import { buildFixtureProject } from '@/ai/project'
import { registerBackends, ProjectVideo } from '@/video-engine/runtime'

// Register once at module scope: recipes + backends must exist before render.
registerBackends()

const project = buildFixtureProject()

/** The Phase 0 vertical slice: a 30-second, 900-frame deterministic video. */
export const DemoComposition: React.FC = () => (
  <ProjectVideo scenes={project.compiledScenes} timeline={project.timeline} />
)
```

- [ ] **Step 4: Make `remotion/Root.tsx` derive its metadata from the timeline**

```tsx
import React from 'react'
import { Composition } from 'remotion'
import { buildFixtureProject } from '@/ai/project'
import { DemoComposition } from './DemoComposition'

const { timeline } = buildFixtureProject()

export const RemotionRoot: React.FC = () => (
  <Composition
    id="DeLyDemo"
    component={DemoComposition}
    durationInFrames={timeline.totalFrames}
    fps={timeline.fps}
    width={timeline.width}
    height={timeline.height}
  />
)
```

- [ ] **Step 5: Add the still-render script for the manual pixel check**

In `package.json` scripts add:

```json
"render:stills": "remotion still remotion/index.ts DeLyDemo out/still-450.png --frame=450 && remotion still remotion/index.ts DeLyDemo out/still-451.png --frame=451"
```

`out/` is already gitignored (Task 1), so the PNGs are never committed.

- [ ] **Step 6: Render the demo MP4 and verify it exists**

Run: `npx remotion render remotion/index.ts DeLyDemo out/demo.mp4`
Expected: `out/demo.mp4` is created, ~30 seconds long, 1920x1080.

Run: `npx remotion still remotion/index.ts DeLyDemo out/still-450.png --frame=450`
Expected: the PNG is created and is not a blank frame.

- [ ] **Step 7: Run the full suite, typecheck, and bundle**

Run: `npx vitest run && npx tsc --noEmit && npx remotion bundle remotion/index.ts && npx vite build`
Expected: all PASS.

- [ ] **Step 8: Manual determinism check (documented, not automated)**

Run the still render twice into different files and compare:

```bash
npx remotion still remotion/index.ts DeLyDemo out/still-a.png --frame=450
```

```bash
npx remotion still remotion/index.ts DeLyDemo out/still-b.png --frame=450
```

Compare the two files. Canvas layers should match; if Three.js layers differ, that is the known limitation from spec §16 (Three pixel determinism is not guaranteed) — record the observed result in the Phase 0 report rather than treating it as a failure.

- [ ] **Step 9: Commit**

```bash
git add remotion package.json tests/demo tests/determinism
git commit -m "feat: wire 30s demo composition + determinism tests + render script"
```

---

### Task 16: Documentation

**Files:**
- Create: `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/SCENE_DSL.md`, `docs/TIMELINE.md`, `docs/VIDEO_ENGINE.md`, `docs/DESIGN_SYSTEM.md`, `docs/ROADMAP.md`
- Modify: `package.json` — none.

**Interfaces:**
- Consumes: the spec `docs/superpowers/specs/2026-10-03-delyai2-phase0-design.md` as the source text.
- Produces: no code. Documentation only.

- [ ] **Step 1: Write `AGENTS.md` (root)**

Must state, as binding rules for any agent working in this repo:

```markdown
# AGENTS.md — Binding rules for this repository

These rules are not suggestions. If a change would violate one, stop and raise it.

1. **The Scene DSL is the source of truth.** AI emits DSL, not code. Nothing downstream may accept raw JSX/TSX as scene input.
2. **Never return to raw AI Scene Code.** There is no "AI writes the scene, engine repairs it" path. That architecture is rejected.
3. **No God Context.** Do not introduce a global context that carries project, timeline, scenes, and UI state together.
4. **No God Service.** One module must not own compilation, rendering, and asset resolution at once.
5. **No business logic in the renderer.** `video-engine/runtime/**` renders IR. It does not decide durations, params, or recipes.
6. **Recipes do not depend on the UI.** `src/video-engine/{canvas,three,motion}/recipes/**` must never import from `src/app/**`.
7. **No `Math.random()` in the render path.** Use `createSeededRandom` from `@/shared`. ESLint enforces this.
8. **Do not bypass the Scene Compiler.** DSL → IR always goes through `compileScene`. The runtime must never read the DSL.
9. **Do not bypass the Master Timeline.** Never compute scene start frames or durations anywhere but `@/timeline`. The compiler only binds against it.
10. **Deterministic rendering is a requirement, not a goal.** Same input + same version ⇒ same compiler output (exact) and same canvas geometry (exact). Three.js is structurally deterministic; pixel determinism is not guaranteed.
11. **Every new feature must name its architecture layer.** Before writing code, state which layer it belongs to: schema, timeline, registry, compiler, IR, runtime, recipe, AI contract, QA, or app shell. If it spans layers, split it.

## Layer map

| Layer | Path | May import |
|---|---|---|
| Schema (AI-facing input) | `src/video-engine/schema/**` | `shared`, `zod` |
| Timeline | `src/timeline/**` | `shared` |
| Registry | `src/video-engine/registry/**` | `schema`, `shared` |
| Compiler | `src/video-engine/compiler/**` | `schema`, `registry`, `ir`, `timeline`, `shared` |
| IR (output contract) | `src/video-engine/ir/**` | `schema`, `shared` |
| Recipes | `src/video-engine/{canvas,three,motion}/recipes/**` | `shared`, `zod`, `remotion`, `three` |
| Runtime | `src/video-engine/runtime/**` | `ir`, `registry`, `timeline` |
| AI | `src/ai/**` | `schema`, `shared`, `timeline` (read-only) |
| QA | `src/qa/**` | everything above |
| App shell | `src/app/**` | `ai`, `runtime`, `timeline` |

Forbidden: `ai/**` → `compiler`/`ir`/`runtime`; `runtime/**` → `schema`; `recipes/**` → `app/**`.
```

- [ ] **Step 2: Write `README.md` (root)**

Must include: what this is (a deterministic AI video engine, Phase 0), the pipeline diagram `AI → Scene DSL → Scene Compiler → Compiled IR → Runtime → Remotion + Canvas 2D + Three.js → MP4`, install/build/run commands (`npm install`, `npm run dev`, `npm run studio`, `npm test`, `npm run typecheck`, `npm run build`, `npm run render:demo`), the 30-second demo description (4 scenes / 900 frames), a link to each doc in `docs/`, and a Phase 0 scope note (no auth/credits/billing/chat — see `docs/ROADMAP.md`).

- [ ] **Step 3: Write `docs/ARCHITECTURE.md`**

Must cover: the layer map table from `AGENTS.md`, the dependency rules and why the compiler is the only AI boundary, `schema/` vs `ir/` separation rationale, the registry's role in choosing renderers, why the runtime never reads the DSL, and the composition root (`src/ai/project.ts`) as the single place that calls the compiler.

- [ ] **Step 4: Write `docs/SCENE_DSL.md`**

Must document every field of `SceneDSLSchema` and `ProjectDSLSchema` with type, required/optional, and meaning; the `purpose` enum as **semantic metadata the compiler must never branch on**; `backdropRenderer` as the one explicit renderer override; and a full worked example — the 4-scene demo DSL.

- [ ] **Step 5: Write `docs/TIMELINE.md`**

Must document: canonical units (`Seconds`/`Milliseconds`/`Frames`), the single `secondsToFrames(v, fps) = Math.round(v * fps)` policy, contiguous integer-frame accumulation, why cumulative-seconds rounding is forbidden, `VoiceTimeline`/`MusicTimeline` independence, `TimingSource = exact | estimated | fixture`, and the three `voiceScenePolicy` values with `"strict"` as the Phase 0 default (warn, never mutate).

- [ ] **Step 6: Write `docs/VIDEO_ENGINE.md`**

Must document: the compiled IR shape and its data-only constraint, the non-circular `compiledHash` procedure (two-step: hash without `provenance.compiledHash`, then attach), canonical JSON rules (lexicographic keys, array order preserved, `-0` → `0`, throw on `NaN`/`Infinity`, UTF-8, no whitespace), the recipe registry and renderer backends, Canvas 2D and Three.js integration rules (`ThreeCanvas`, no `useFrame()`, dispose GPU resources), and the three determinism levels.

- [ ] **Step 7: Write `docs/DESIGN_SYSTEM.md`**

Must document: the dark palette used in the runtime (`#05070d` background, `#f7f9ff` foreground), the typography scale (`Inter`, 96px hero), the hue conventions for canvas recipes (200–210 blue, 265 violet, 24 amber, 160 teal), and the rule that style tokens live in the DSL's `style` field, not in recipes.

- [ ] **Step 8: Write `docs/ROADMAP.md`**

Must contain a Phase 0 "done" checklist mirroring the demo acceptance list, a Phase 1 candidate list (real AI directors, real TTS + voice timeline, transitions between scenes, more recipes, vision QA), and an explicit out-of-scope list for Phase 0: auth, credits, marketplace, chat, history, batch, subscription, billing.

- [ ] **Step 9: Verify docs render and the full suite still passes**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (docs change no code).

- [ ] **Step 10: Commit**

```bash
git add README.md AGENTS.md docs
git commit -m "docs: phase 0 documentation set"
```
