# Architecture

DeLyAI2 is a pipeline of small, single-purpose layers. Each layer has an
explicit input contract, an explicit output contract, and a declared set of
things it may never import. The point of the boundaries is not tidiness — it is
that every boundary is a place where determinism and correctness can be checked
without running the layer below it.

## Layers

| Layer | Path | May import (illustrative) | Must never import (binding) |
|---|---|---|---|
| Schema (AI-facing input) | `src/video-engine/schema/**` | `zod`, `shared` | `app`, `domain`, `ai`, `qa`, `timeline`, `compiler`, `ir`, `runtime` |
| Timeline | `src/timeline/**` | `shared` | `video-engine` (any), `ai`, `app`, `domain`, `qa` |
| Registry | `src/video-engine/registry/**` | `zod`, `schema`, `ir`, `compositions`, `shared` | `app`, `domain`, `ai`, `qa`, `timeline` |
| Compositions | `src/video-engine/compositions/**` | `schema`, `registry` (types), `shared` | `app`, `domain`, `ai`, `qa`, `timeline`, `canvas`, `three`, `motion` |
| Compiler | `src/video-engine/compiler/**` | `schema`, `ir`, `registry`, `timeline`, `shared`, `zod` | `app`, `domain`, `ai`, `qa`, `runtime`, `canvas`, `three`, `motion` |
| IR (output contract) | `src/video-engine/ir/**` | `schema` (types), `timeline` (types), `shared` | `app`, `domain`, `ai`, `qa`, `compiler`, `runtime`, `registry` |
| Recipes | `src/video-engine/{canvas,three,motion}/recipes/**` | `shared`, `zod`, `three`, `@remotion/three`, `remotion`, sibling `*/types` | `app`, `domain`, `ai`, `qa` |
| Runtime | `src/video-engine/runtime/**` | `ir`, `registry`, `timeline`, `motion`, `remotion`, `react`, `canvas`, `three` | `schema` **and the DSL**, `compiler`, `app`, `domain`, `ai`, `qa` |
| AI | `src/ai/**` | `video-engine/schema`, `timeline`, `shared` | `video-engine/compiler`, `video-engine/ir`, `video-engine/runtime`, `video-engine/compositions`, `video-engine/{canvas,three,motion}` — **except `src/ai/project.ts`** |
| QA | `src/qa/**` | `video-engine/{schema,ir,registry}`, `timeline/{master,diagnostics}`, `shared` | `app`, `ai`, `compiler`, `runtime`, `canvas`, `three`, `motion` |
| App shell | `src/app/**` | `ai/project`, `video-engine/{ir,runtime}`, `timeline/master`, `@remotion/player`, `react` | `video-engine/compiler`, `video-engine/compositions`, `video-engine/{canvas,three,motion}/recipes`, `domain` |

The **"Must never import" column is normative.** The "May import" column records
what each layer uses today; it is illustrative, not a closed allowlist. Two
constraints carry all the architectural weight: **`ai/**` may not reach past the
schema into the compiler, IR, or runtime** (except the composition root), and
**the runtime may not import the schema** — it renders IR and nothing else.

The `domain/` tree named in the design spec (`projects`, `assets`, `jobs`,
`generation`) was planned but not built in Phase 0; there is no `src/domain/`.
Nothing in the shipped code imports it.

## Why the compiler is the only AI boundary

The one thing AI is allowed to produce is a `SceneDSL`. Everything between that
DSL and a rendered frame is deterministic engine code. This is what makes the
system auditable: an AI director can be wrong, but it cannot produce a scene
the engine does not understand, because the compiler validates every id against
the registry and every param against its recipe schema before a single frame is
emitted.

The alternative — AI emits JSX/TSX and the engine repairs it — is rejected
outright. That architecture moves the failure mode from "compiler rejects an
unknown recipe" to "a generated component throws at render time", and it makes
the output non-reproducible.

```ts
// src/ai/project.ts — the single place in src/ai/** allowed to call the compiler
const compiledScenes = parsed.scenes.map((scene) => compileScene({ dsl: scene, timeline, assets: [] }))
```

Directors (`src/ai/story`, `src/ai/visual`, `src/ai/assets`, `src/ai/tts`)
produce DSL or domain output and stop. They import `@/video-engine/schema` (the
input contract they must satisfy) and `@/timeline` (read-only), never the
compiler or IR. ESLint enforces the ban via `no-restricted-imports` in
`eslint.config.js`.

## Why `schema/` and `ir/` are separate

They are two different contracts that change for two different reasons.

- `video-engine/schema/scene-dsl.ts` is the **input contract**. It is written in
  seconds, is meant to be produced by AI, and changes when the way we *describe*
  intent changes.
- `video-engine/ir/types.ts` is the **output contract**. It is written in
  integer frames, contains only resolved data, and changes when the way the
  *runtime consumes* a scene changes.

`CompiledLayer.renderer` is a good example of the split. The DSL says a recipe
id (`particle-field`); the IR says `renderer: 'canvas2d'`, already resolved from
the registry. The DSL has no idea what a renderer is. Fusing the two contract
files would let an input-side change silently alter the output the runtime
depends on.

## The registry's role

`src/video-engine/registry/` is the mapping from an id in the DSL to the
implementation that fulfils it, and — critically — to the **renderer kind** that
implementation runs on. `resolveVisual(id)` returns a `VisualRecipe` whose
`renderer` field the compiler copies into the IR. The DSL never names a
renderer for a recipe (the one exception, `backdropRenderer`, is scene-level and
not a recipe's renderer).

The registry is deliberately split in two:

- **Metadata** (`registry/register.ts` → `registerMetadata()`) registers
  compositions and visual/motion recipe metadata. Compiler tests use this,
  so they never load Canvas or Three.
- **Implementations** (`runtime/register-backends.ts` → `registerBackends()`)
  additionally registers the canvas/three/motion recipe implementations and the
  three renderer backends. The Remotion entry point and the app use this.

`listAvailable()` exposes recipe ids, versions, and renderer kinds — never
source code — so a Phase 1 AI director can choose among ids the engine actually
has.

## Why the runtime never reads the DSL

The runtime (`video-engine/runtime/**`) is an interpreter. It takes a
`CompiledScene` and a `MasterTimeline` and produces React. Everything it needs —
resolved params, resolved renderer, bound frame windows, the absolute scene
start — is already in the IR. If the runtime could read the DSL, the compiler's
validation would be bypassable and "the IR is the only thing the runtime sees"
would stop being true.

`SceneRenderer` does exactly three things: it lays out composition slots, it
converts each layer's local frame to an absolute frame (`scene.startFrame +
layerLocalFrame`), and it dispatches each layer to its renderer backend via
`LayerRenderer → getRendererBackend(layer.renderer)`. It does not resolve
defaults, does not decide durations, and never imports the schema.

## The composition root

`src/ai/project.ts` is the one module in `src/ai/**` that imports the compiler.
It is not a director — it is the **composition root** for the Phase 0 demo. It
runs the whole pipeline in order:

1. `parseProjectDsl(input)` — validate with Zod.
2. `buildMasterTimeline({...})` — compute scene windows in frames.
3. `compileScene({ dsl, timeline, assets })` for each scene — produce the IR.

`buildFixtureProject()` is used by the Remotion entry point, the Vite app, and
the tests, so all three render exactly the same compiled project. The exception
is stated twice in `eslint.config.js` — once as an `ignores` on the `ai/**`
import ban, and once as an explicit rule scoped to `src/ai/project.ts` — so it
reads as a deliberate boundary, not an accident.
