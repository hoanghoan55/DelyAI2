# AGENTS.md — Binding rules for this repository

These rules are not suggestions. If a change would violate one, stop and raise it.

1. **The Scene DSL is the source of truth.** AI emits DSL, not code. Nothing downstream may accept raw JSX/TSX as scene input.
2. **Never return to raw AI Scene Code.** There is no "AI writes the scene, engine repairs it" path. That architecture is rejected.
3. **No God Context.** Do not introduce a global context that carries project, timeline, scenes, and UI state together.
4. **No God Service.** One module must not own compilation, rendering, and asset resolution at once.
5. **No business logic in the renderer.** `video-engine/runtime/**` renders IR. It does not decide durations, params, or recipes.
6. **Recipes do not depend on the UI.** `src/video-engine/{canvas,three,motion}/recipes/**` must never import from `src/app/**`.
7. **No `Math.random()` in the render path.** Use `createSeededRandom` from `@/shared`. ESLint enforces this across `src/video-engine/**`, and a determinism test scans every engine file for `Math.random`.
8. **Do not bypass the Scene Compiler.** DSL → IR always goes through `compileScene`. The runtime must never read the DSL.
9. **Do not bypass the Master Timeline.** Never compute scene start frames or durations anywhere but `@/timeline`. The compiler only binds against it.
10. **Deterministic rendering is a requirement, not a goal.** Same input + same engine version ⇒ the same compiler output (exact: `provenance.compiledHash`) and the same canvas geometry and sampled positions. Three.js is structurally deterministic — a `structuralHashOf` over a `SceneDescriptor` — and **pixel determinism is not guaranteed**. There is deliberately no golden-image test in CI.
11. **Every new feature must name its architecture layer.** Before writing code, state which layer it belongs to: schema, timeline, registry, compiler, IR, runtime, recipe, AI contract, QA, or app shell. If it spans layers, split it.

## Layer map

The **"Must never import" column is the binding rule.** The "May import" column is illustrative — it names what the layer uses today, not a closed allowlist. A layer may import its own submodules freely and may add new legitimate dependencies inside the same layer; adding one does not require a refactor of prose. If a change would violate the "Must never import" column, stop.

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

Three constraints are load-bearing and must never be relaxed:

- **`ai/**` must not import the compiler, IR, or runtime** — the only exception is `src/ai/project.ts`, the composition root that deliberately calls `compileScene`. Directors produce DSL and stop there.
- **`runtime/**` must not import `schema`** — the runtime renders IR; it must never read the DSL.
- **`recipes/**` must not import `app/**`** — recipes are engine content, not product UI.
