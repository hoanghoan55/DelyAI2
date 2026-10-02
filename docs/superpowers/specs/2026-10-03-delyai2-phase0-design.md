# DeLyAI2 — Phase 0 Design Spec

- **Ngày:** 2026-10-03
- **Trạng thái:** Approved (design) — chờ review spec
- **Phạm vi:** Phase 0 foundation của AI Video Generator mới (greenfield, không kế thừa repo cũ)

---

## 1. Mục tiêu & tiêu chí thành công

Xây một **Video Engine mới, sạch, deterministic**, có Scene DSL, Master Timeline, và render được một video 30 giây qua Remotion + Canvas 2D + Three.js.

Kiến trúc bắt buộc:

```
AI / Fixture
     │
     ▼
 Scene DSL  (seconds)
     │  Zod strict
     ▼
 Compiler
     │
     ▼
 Compiled Scene IR  (frames)
     │
     ▼
 Runtime (interpreter)
     │
     ├── DOM ── Canvas 2D ── Three.js
     ▼
 Remotion
     ▼
 MP4
```

**Không** xây kiến trúc `AI → raw JSX/TSX → repair → fallback → Remotion`.

### Trong phạm vi
- Scene DSL v0 (Zod schema, versioned), Compiled Scene IR v0
- Master Timeline v0 (canonical time, voice/music timeline, converters)
- Scene Compiler v0 (validate → resolve → bind → IR)
- Recipe Registry (compositions, visual, motion, typography)
- Video Engine 3 lớp: Remotion/DOM, Canvas 2D, Three.js
- Deterministic seed system + determinism tests
- Một Remotion composition, một Canvas recipe, một Three.js recipe (tối thiểu Phase 0)
- Vertical slice 30s từ Scene DSL fixture (không AI thật)
- QA layers (trừ Vision QA)
- Vite SPA preview bằng `@remotion/player`
- 8 tài liệu

### Ngoài phạm vi (mục 30 của brief)
Auth, Credits, Marketplace, Chat, History, Batch, Subscription, Billing, TTS provider thật, Vision AI.

---

## 2. Repository structure (đã khóa)

```
src/
├── app/                    # Product UI — Vite SPA + @remotion/player
├── domain/
│   ├── projects/           # Project, RenderSettings types
│   ├── assets/             # Asset, AssetRef types
│   ├── jobs/               # Job types
│   └── generation/         # GenerationRun, usage types
├── ai/                     # Producers of DSL / domain outputs
│   ├── story/              # contract.ts + fixture.ts
│   ├── visual/             # contract.ts + fixture.ts
│   ├── assets/             # contract.ts + fixture.ts  (Asset Director boundary)
│   └── tts/                # contract.ts + fixture.ts
├── timeline/               # Canonical temporal model
├── video-engine/
│   ├── schema/             # DSL INPUT contract
│   ├── compiler/           # DSL → IR
│   ├── ir/                 # IR OUTPUT contract
│   ├── runtime/            # IR → renderable layers
│   ├── compositions/       # Visual primitives/layouts
│   ├── canvas/
│   ├── three/
│   ├── motion/
│   ├── typography/
│   ├── effects/
│   ├── audio/
│   └── registry/
├── qa/
└── shared/

remotion/                   # Root.tsx, compositions, entry point
scripts/                    # render-demo, helpers
tests/                      # unit + determinism + golden
docs/                       # tài liệu
```

### Lý do thay đổi so với mục 22 của brief
1. **Tách `video-engine/ir/` và `video-engine/schema/` khỏi `compiler/`.** Brief gộp cả hai vào `compiler/`. IR là *output contract* được runtime tiêu thụ; schema là *input contract* từ AI. Hai thứ thay đổi vì lý do khác nhau, nên tách.
2. **Thêm `video-engine/effects/`, `video-engine/audio/` là thư mục thật** (brief đã liệt kê).
3. **`src/ai/assets/` là Asset Director boundary** (không đổi thành `asset-director/`). Tên `assets` giữ ngắn gọn và nhất quán với các AI domain khác (`story`, `visual`, `tts`). Đây là *implementation boundary của Asset Director*, không phải thư viện asset utilities.

### Dependency rules (bắt buộc)
| Module | Được import | Cấm import |
|---|---|---|
| `video-engine/**` | `video-engine/**`, `timeline`, `shared` | `app`, `domain`, `ai`, `qa` |
| `timeline/**` | `shared` | `video-engine`, `ai`, `app`, `domain` |
| `ai/**` | `timeline` (read-only), `video-engine/schema`, `shared` | `video-engine` nói chung (compiler, ir, runtime, compositions, canvas, three, motion) |
| `app/**` | `domain`, `video-engine/compiler`, `video-engine/ir` | `timeline` internals, `video-engine/compositions`, `canvas`, `three`, `motion`, recipes |
| `qa/**` | `schema`, `ir`, `timeline`, `shared` | `app`, `ai` |

**§ Đặc biệt quan trọng:** `ai → video-engine/schema` là hợp lệ (AI phải biết hợp đồng DSL it produces). `ai → video-engine/compiler | ir | runtime | compositions` là **vi phạm**. AI không được nhảy qua Compiler.

### Ranh giới `compositions/`
Chỉ chứa **renderable visual primitives/layouts**: `hero, centered, full-screen, split, grid, comparison, cards, media-text, data`.
**Không** chứa: project generation, scene planning, timeline decisions, AI decisions.

---

## 3. Scene DSL v0 (INPUT contract)

`src/video-engine/schema/scene-dsl.ts` — Zod, `.strict()` (cấm field lạ).

```ts
type ScenePurpose =
  | "hook" | "explain_network" | "explain_concept" | "demonstrate"
  | "compare" | "data_reveal" | "summary" | "outro"

type SceneDSL = {
  schemaVersion: "0.1"
  sceneId: string

  purpose: ScenePurpose
  duration: number                       // GIÂY

  composition: CompositionId

  backdropRenderer?: "dom" | "canvas2d" | "three"

  visual: VisualLayerSpec[]              // [{ recipe, params }]
  motion: MotionLayerSpec[]              // [{ recipe, params }]
  typography: TypographySpec | null

  audio: AudioCueSpec[]
  events: SceneEventSpec[]               // at: giây, local trong scene

  style: StyleRef
  seed: number
}
```

### Quy tắc cứng
- **Không** field nào chứa JS/JSX/expression/string-eval. DSL không executable.
- Mọi số thời gian trong DSL là **giây**. Frame chỉ xuất hiện sau Compiler.
- **Visual recipe renderer KHÔNG nằm trong DSL.** Renderer của mỗi visual recipe do **registry** resolve (`recipe → registry → recipe.renderer`). DSL nói "tôi muốn `network-3d`", không nói "nhớ dùng Three". Ngoại lệ hợp lệ duy nhất: **`backdropRenderer`** (optional) — có semantic khác với `recipe.renderer` (nó chỉ định renderer cho *backdrop layer* của scene, không phải renderer của một recipe), dùng khi scene cần backdrop đặc biệt.
- **`purpose` là semantic metadata thuần.** Compiler **không được** dùng `purpose` để ngầm suy ra composition/animation (ví dụ cấm `if (purpose === "hook") composition = "hero"`). Thêm purpose mới không được đổi hành vi renderer.

---

## 4. Compiled Scene IR v0 (OUTPUT contract)

`src/video-engine/ir/` — data thuần, JSON-serializable, **không chứa function**.

```ts
type CompiledScene = {
  irVersion: "0.1"
  sceneId: string
  seed: number

  render: { fps: number; width: number; height: number }

  timing: {
    startFrame: number            // absolute, master timeline
    durationInFrames: number      // integer
  }

  composition: { id: CompositionId; slots: SlotId[] }

  layers: CompiledLayer[]         // sort theo zIndex

  typography: CompiledTypography | null

  events: { atFrame: number; kind: string; payload: Json }[]
  audio: { atFrame: number; durationInFrames: number; cue: Json }[]

  diagnostics: Diagnostic[]

  provenance: {
    engineVersion: string
    sourceHash: string
    compiledHash: string
  }
}

type CompiledLayer = {
  id: string
  layerKind: "visual" | "effect" | "text" | "media"
  recipeId: string
  recipeVersion: string
  renderer: "dom" | "canvas2d" | "three"     // resolved từ registry
  slot: SlotId
  frameWindow: { from: number; durationInFrames: number }   // LOCAL trong scene
  params: ResolvedParams                                       // default đã áp, đã validate
  motion: { recipeId: string; frameWindow: {...}; params: ResolvedParams }[]
  zIndex: number
  assetRefs: AssetRef[]
  backdrop?: boolean
}
```

### Quy tắc cứng
- **Không có gì executable trong IR.** Runtime là interpreter duy nhất biết biến IR → React/Canvas/Three.
- `ResolvedParams = JsonObject`. Compiler làm toàn bộ `validate → default → normalize`; **runtime không bao giờ resolve default**.
- `frameWindow` là **local trong scene**; `timing` là **absolute master**. Runtime tính `scene.startFrame + layer.localFrame`.
- **Không float frame trong IR.** Mọi frame value là integer.
- `AssetRef = { id: string; version?: string; contentHash?: string }` (asset fingerprint, không chỉ id).

### Provenance / determinism
```
sourceHash   = hash(canonical DSL + schemaVersion + engineVersion + asset fingerprints)

compiledHash = hash(canonical IR WITHOUT provenance.compiledHash)
```

- `sourceHash` chứng minh **input/provenance giống nhau**.
- `compiledHash` chứng minh **compiler sinh cùng output** — đây mới là test determinism thực sự.

**Không circular dependency.** `compiledHash` không được hash chính nó. Quy trình hai bước:

```ts
// 1. tính hash trên IR với provenance đã bỏ compiledHash
const hashInput = {
  ...compiledScene,
  provenance: {
    engineVersion: compiledScene.provenance.engineVersion,
    sourceHash: compiledScene.provenance.sourceHash,
    // compiledHash: EXCLUDED
  },
}
const compiledHash = hash(canonicalJson(hashInput))

// 2. gắn hash vào IR đã hoàn thiện
const finalScene = {
  ...compiledScene,
  provenance: { ...compiledScene.provenance, compiledHash },
}
```

Tương đương: `compiledHash = hash(canonicalCompiledScene({ ...scene, provenance: { engineVersion, sourceHash } }))`, sau đó mới gắn `scene.provenance.compiledHash = compiledHash`.

### Định nghĩa canonical JSON (dùng cho MỌI hash)
`src/shared/canonical-json.ts`:
- **object keys:** sắp xếp **lexicographic**
- **array:** **giữ nguyên thứ tự** (layers, events, audio có semantic — không được sort)
- **integer:** canonical decimal representation (`5`, không `5.0`)
- **floating point:** một representation duy nhất (đã round policy ở tầng timeline; hash dùng `String(n)` với normalize)
- **`-0` → `0`**
- **không cho `NaN` / `Infinity`** (throw)
- **UTF-8 encoding**
- **không whitespace**

- Test: `compile(input)` hai lần → `compiledHash` phải bằng nhau. Hash dùng canonical JSON ở trên.

---

## 5. Canonical Time & Master Timeline

### 5.1 Branded types (`src/timeline/units.ts`)
```ts
type Seconds = number & { __brand: "Seconds" }
type Milliseconds = number & { __brand: "Milliseconds" }
type Frames = number   // integer
```

### 5.2 Rounding policy — MỘT primitive duy nhất (`src/timeline/convert.ts`)
```ts
secondsToFrames(seconds: Seconds, fps: number): Frames  => Math.round(seconds * fps)
framesToSeconds(frames: Frames, fps: number): Seconds   => frames / fps
msToFrames(ms: Milliseconds, fps: number): Frames       => Math.round((ms / 1000) * fps)
framesToMs(frames: Frames, fps: number): Milliseconds   => (frames / fps) * 1000
beatToFrame(beat: number, bpm: number, fps: number): Frames
```
Không module nào tự `Math.floor/ceil/round` khi chuyển đổi thời gian. Test bắt buộc ở 30fps và 29.97fps: cùng seconds + cùng fps → cùng frames.

### 5.3 Scene window accumulation — cộng dồn trong frame
```ts
let cursor = 0
for (const s of scenes) {
  const durationInFrames = secondsToFrames(s.duration, fps)
  window[s.sceneId] = { startFrame: cursor, durationInFrames }
  cursor += durationInFrames          // integer accumulation
}
totalFrames = cursor
```
**Không** tính `startFrame = round(cumulativeSeconds * fps)` — tại 29.97fps sẽ gây gap/overlap một frame. Đảm bảo `Σ durationInFrames === totalFrames`.

### 5.4 Voice Timeline (`src/timeline/voice.ts`)
```ts
type TimingSource = "exact" | "estimated" | "fixture"

type VoiceSegment = {
  id: string
  text: string
  startMs: Milliseconds
  endMs: Milliseconds
  words: WordTiming[]        // rỗng nếu timingSource = "estimated"
  timingSource: TimingSource
  sceneId: string            // mapping TƯỜNG MINH
}

type VoiceTimeline = {
  segments: VoiceSegment[]
  totalMs: Milliseconds
  timingSource: TimingSource
}
```
- **`estimated` KHÔNG BAO GIỜ được coi là `exact`.** QA cảnh báo khi scene dựa vào estimated timing làm mốc cứng.
- Mapping voice→scene qua field `sceneId` tường minh. **Cấm** heuristic `duration * 0.35` hay chia tỉ lệ.

### 5.5 Music Timeline (`src/timeline/music.ts`) — độc lập với voice
```ts
type MusicTimeline = {
  bpm: number
  sections: { id: string; startBeat: number; endBeat: number; energy: number }[]
  events: { atBeat: number; kind: string; payload: Json }[]
}
```

### 5.6 Master Timeline (`src/timeline/master.ts`)
```ts
type MasterTimeline = {
  fps: number
  width: number; height: number
  totalFrames: Frames
  sceneWindows: Record<string, { startFrame: Frames; durationInFrames: Frames }>
  voice: VoiceTimeline | null
  music: MusicTimeline | null
  events: { atFrame: Frames; scope: "global" | string; kind: string; payload: Json }[]
}

buildMasterTimeline(input: {
  fps; width; height
  scenes: { sceneId: string; duration: Seconds }[]
  voice?; music?
  voiceScenePolicy: "strict" | "extend_to_voice" | "stretch_to_voice"
  globalEvents?
}): MasterTimeline
```

**Voice/scene conflict policy tường minh.** Phase 0 dùng `"strict"`: scene window = duration từ DSL; nếu voice dài hơn window → QA **warning**, không tự sửa. Không heuristic ẩn. Master Timeline là **nguồn chân lý duy nhất về thời gian**; Compiler đọc `sceneWindows[sceneId]`, không tự tính lại.

---

## 6. Video Engine

### 6.1 Recipe Registry (`video-engine/registry/`)
```ts
type VisualRecipe<P = JsonObject> = {
  id: string; version: string
  renderer: "dom" | "canvas2d" | "three"
  paramsSchema: ZodType<P>
  defaults: Partial<P>
  plannedDurationHint?: Seconds
}

type MotionRecipe<P = JsonObject> = {
  id: string; version: string
  paramsSchema: ZodType<P>; defaults: Partial<P>
}

type CompositionDef = {
  id: string; version: string
  slots: SlotDef[]                       // { id, role }
  layout: (args: { slots: SlotId[]; render: RenderSize; style: StyleTokens }) => SlotRect[]  // pure
}
```
API: `resolveVisual(id, version?)`, `resolveMotion(...)`, `resolveComposition(...)`, `listAvailable()`.
`listAvailable()` là nguồn cho Phase 1 đưa cho AI (id + params schema, **không** source code).

**Đăng ký: factory + `registry/register.ts`.** Recipe tạo qua factory (`createThreeRecipe({...})`), eager-register qua một entry point tường minh. Compiler/registry chỉ thấy interface + metadata; test metadata registry không cần load Three/Canvas.

### 6.2 Runtime (`video-engine/runtime/`) — interpreter mỏng
Component `SceneRenderer({ scene, masterTimeline })`. Chỉ làm: (a) tách IR thành layer, (b) dispatch theo `layer.renderer`, (c) bọc `Sequence`/`AbsoluteFill` theo composition slots. Không tính layout động, không resolve default, không đọc DSL.

### 6.3 Composition primitives (Phase 0: 9)
`hero, centered, full-screen, split, grid, comparison, cards, media-text, data`.
Composition chỉ quyết định **cấu trúc**; visual recipe = nội dung; motion recipe = chuyển động; style = skin. Mục tiêu: `same style != same video`.

### 6.4 Canvas 2D subsystem (`video-engine/canvas/`)
```ts
type CanvasRecipe<P = JsonObject> = {
  id: string; version: string
  paramsSchema: ZodType<P>; defaults: Partial<P>
  prepare?: (ctx, size, params) => CanvasState
  render: (ctx, args: { frame; fps; size; params; state; rng: SeededRandom }) => void
  dispose?: (state: CanvasState) => void
}
```
Remotion integration: component dùng `<canvas>` ref + `useCurrentFrame()`, **redraw mỗi frame từ `frame`** (không animation loop theo wall-clock).
Phase 0 recipes: `particle-field, grid, waveform, glow, geometric-lines`.
Yêu cầu: deterministic, seeded RNG truyền vào, có `dispose`, không `Math.random()` trong render path, chạy được trong Remotion render.

### 6.5 Three.js subsystem (`video-engine/three/`)
Dùng `@remotion/three` `ThreeCanvas` (**bắt buộc `width`/`height`**). **Cấm `useFrame()`**; animation chỉ từ `useCurrentFrame()`. `<Sequence>` bên trong `ThreeCanvas` phải `layout="none"`.
```ts
type ThreeRecipe<P = JsonObject> = {
  id: string; version: string
  paramsSchema: ZodType<P>; defaults: Partial<P>
  build: (args: { frame; fps; params; rng; sizing }) => React.ReactNode   // subtree trong ThreeCanvas
  disposeResources?: (args) => void
}
```
Phase 0 recipes: `basic-scene, camera, lighting, particles-3d, wireframe-object, network-graph`.
Kiểm soát GPU: R3F dispose geometry/material/texture khi unmount; recipe tạo resource ngoài declarative tree phải khai `disposeResources`. Không leak khi render nhiều scene.

### 6.6 Motion recipes (`video-engine/motion/`)
`fade, reveal, slide, scale, pulse, parallax, camera-flythrough`. Mỗi recipe pure: `(frame, frameWindow, params, rng) => MotionTransform`. Frame-based, không wall-clock. Cùng input → cùng animation.

### 6.7 Typography (`video-engine/typography/`)
`{ text, animation: fade|reveal|typewriter|word-by-word, style }` → `CompiledTypography`.

### 6.8 Effects & Audio
`effects/`: overlay/post effects (Phase 0 tối thiểu). `audio/`: bind audio cues vào frame từ timeline; Phase 0 **contract only**, Remotion `<Audio>` không phát file (fixture timing).

---

## 7. Style System
`Style` = domain riêng: `colors, typography, spacing, radius, shadows, motionLanguage, transitionLanguage, density, rendererPreferences`. Recipe nhận style tokens/params, không hard-code style trong component.

---

## 8. AI Architecture
```ts
interface StoryDirector  { direct(brief: Brief): Promise<StoryPlan> }
interface VisualDirector { direct(input: VisualDirectorInput): Promise<SceneDSL[]> }
interface AssetDirector  { plan(input: AssetPlanningInput): Promise<AssetPlan> }
interface TtsAdapter     { synthesize(input: TtsInput): Promise<VoiceTimeline> }
```
`VisualDirectorInput` = `{ scenePurpose, duration, availableCompositions, availableVisualRecipes, availableMotionRecipes, style, assets, timelineWindow, constraints }` — **không có source code renderer**.
Phase 0: mỗi module có `contract.ts` + `fixture.ts` trả output cố định (chính là fixture demo 30s). Chứng minh output AI khớp Zod schema DSL, không gọi network. AI không quyết định renderer implementation.

---

## 9. QA layers
| Layer | Input | Phase 0 |
|---|---|---|
| Schema QA | DSL | ✅ Zod strict |
| Timeline QA | MasterTimeline | ✅ gap/overlap, voice-vs-scene (strict), rounding |
| Scene QA | CompiledScene | ✅ slot ↔ layer bind, frameWindow ⊆ scene |
| Geometry QA | SlotRect[] | ✅ slot trong biên, overlap sai, min area |
| Render QA | IR | ✅ recipe/renderer/composition resolve được, params hợp lệ |
| Vision QA | ảnh render | ❌ boundary only (interface) |

**Loop có trần:** `Generate → Deterministic QA → targeted repair → Render → Vision QA → max 1 visual repair → final review → STOP`. Deterministic error xử lý bằng deterministic path. Không infinite repair loop.

---

## 10. Deterministic strategy

`SeededRandom` (mulberry32) ở `src/shared/rng.ts`. **Cấm `Math.random()` trong `video-engine/**`** — enforce bằng ESLint `no-restricted-properties` / `no-restricted-globals`. `engineVersion` hằng số ở `video-engine/version.ts`.

### Determinism levels (contract)

1. **Compiler determinism — exact**
   `compile(input)` hai lần → `compiledHash` **phải** khớp.

2. **Canvas determinism — pixel-level**
   các frame chọn sẵn → **PNG hash** phải khớp trong cùng render environment.

3. **Three.js determinism — structural**
   các frame chọn sẵn → **structural scene hash** phải khớp.
   Pixel equality **không** phải hard gate ở Phase 0 vì WebGL / Chromium / GPU rasterization có thể khác nhau.

**Mọi deterministic test dùng cùng bộ input:**
`DSL + seed + asset fingerprints + engineVersion + fps + width + height`.

Three.js ở Phase 0 dùng: **structural hash + render smoke test + manual visual inspection** — structural hash **không** được gọi là "visual determinism".

**Structural scene hash** (Three) gồm: `{ recipeId, recipeVersion, frame, camera, objectTransforms, geometryParams, materialParams, lightParams, seed }`.

---

## 11. Vertical slice 30s
FPS 30, 1920×1080 → ~900 frames. Fixture Scene DSL, voice timeline fixture (`timingSource: "fixture"`, `sceneId` tường minh, không phát audio).

| Scene | Composition | Layers | Renderer | ~duration |
|---|---|---|---|---|
| 1 Hero | `hero` | typography reveal | DOM | 6.0s |
| 2 Split explain | `split` | dom text + `particle-field` | DOM + Canvas 2D | 9.0s |
| 3 3D network | `full-screen` | `network-graph` + `camera-flythrough` | Three.js | 9.0s |
| 4 Typography outro | `centered` | typography | DOM | 6.0s |

Demo phải chứng minh (mục 26): DSL parse + validate, timeline hoạt động, composition registry, visual recipe registry, motion recipe, Canvas trong Remotion render, Three.js trong Remotion render, Remotion compose mọi layer, seed deterministic, MP4 render thành công.

---

## 12. Tech stack & công cụ
- TypeScript, React, Vite (SPA), Remotion, `@remotion/player`, `@remotion/three`, Three.js (via R3F), Canvas 2D, Zod, Vitest, ESLint.
- **Zod pin `3.22.3`** (yêu cầu của Remotion `schema` prop).
- **Package manager: npm.**
- Dependency tối thiểu; không thêm dependency lớn nếu không cần.

### Scripts
| Lệnh | Việc |
|---|---|
| `npm run dev` | Vite SPA preview |
| `npm run studio` | Remotion Studio |
| `npm run typecheck` | `tsc --noEmit` toàn repo |
| `npm test` | Vitest |
| `npm run build` | Vite build |
| `npm run bundle:remotion` | `npx remotion bundle` |
| `npm run render:demo` | Render `out/demo.mp4` |

**"Build pass" = Vite build + tsc --noEmit + remotion bundle.**

---

## 13. Documentation
- Root: `README.md`, `AGENTS.md`
- `docs/`: `ARCHITECTURE.md`, `SCENE_DSL.md`, `TIMELINE.md`, `VIDEO_ENGINE.md`, `DESIGN_SYSTEM.md`, `ROADMAP.md`

`AGENTS.md` ghi rõ: Scene DSL là source of truth; không quay lại raw AI Scene Code; không God Context; không God Service; không business logic trong renderer; recipe không phụ thuộc UI; không `Math.random()` trong render path; không bypass Scene Compiler; không bypass Master Timeline; deterministic rendering là requirement; mọi feature mới phải xác định đúng architecture layer.

`ARCHITECTURE.md` ghi lý do tách `schema/` vs `ir/`, và ghi chú `src/ai/assets/` = Asset Director boundary.

---

## 14. Commit plan (1 task = 1 commit)
1. `chore: scaffold repo` — package.json, tsconfig, vite, vitest, eslint, gitignore
2. `feat: shared` — rng (SeededRandom), math, ids, canonical json
3. `feat: timeline units + conversions` + tests
4. `feat: scene DSL schema (Zod)` + tests
5. `feat: IR types + engine version`
6. `feat: registry + composition primitives`
7. `feat: compiler` + tests + golden snapshot
8. `feat: runtime interpreter + Remotion root`
9. `feat: canvas 2D subsystem + recipes`
10. `feat: three subsystem + recipes`
11. `feat: motion + typography recipes`
12. `feat: ai contracts + fixture impls`
13. `feat: qa layers`
14. `feat: app shell (Vite SPA + Player)`
15. `feat: 30s demo project + render script`
16. `docs: 8 tài liệu`

Mỗi commit: typecheck + tests + build khi phù hợp. Không commit secrets / MP4 / temp files.

---

## 15. Definition of Done (mục 29)
- [ ] `npm install` pass
- [ ] typecheck pass
- [ ] tests pass
- [ ] build pass (vite + tsc + remotion bundle)
- [ ] Remotion render pass
- [ ] Canvas render pass
- [ ] Three.js render pass
- [ ] deterministic test pass (`compiledHash` + frame-hash)
- [ ] 30s MP4 render thành công
- [ ] Scene DSL v0 có schema
- [ ] Timeline v0 có tests
- [ ] Compiler v0 có tests
- [ ] documentation hoàn chỉnh
- [ ] AGENTS.md hoàn chỉnh

---

## 16. Known risks / limitations (dự kiến)
- Remotion + Three.js trong headless Chromium có thể cần cấu hình GPU/`--disable-gpu` tùy môi trường Windows.
- **Three.js pixel determinism không được đảm bảo** — cùng scene graph có thể rasterize khác nhau chút giữa WebGL/Chromium/GPU. Do đó Three chỉ gate bằng **structural hash + smoke test + manual visual inspection** (xem §10), không phải pixel hash.
- Zod pin `3.22.3` có thể xung đột với version khác trong hệ sinh thái; cần kiểm soát.
