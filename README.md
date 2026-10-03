# DeLyAI2 — Deterministic AI Video Engine

DeLyAI2 is an AI video engine built around one hard constraint: **a video is a
pure function of its declared input.** AI describes intent; a compiler turns
that intent into data; a thin runtime interprets the data into frames. No
generated code, no hidden state, no `Math.random()` in the render path.

This repository is **Phase 0** — the foundation. It ships the Scene DSL, the
Master Timeline, the Scene Compiler, a three-backend video engine
(Remotion/DOM, Canvas 2D, Three.js), structural QA, a Vite preview shell, and a
30-second deterministic demo.

## Pipeline

```
AI / Fixture
     │
     ▼
Scene DSL  (seconds)
     │  Zod strict validation
     ▼
Scene Compiler
     │
     ▼
Compiled Scene IR  (integer frames)
     │
     ▼
Runtime  (interpreter)
     ├── DOM ── Canvas 2D ── Three.js
     ▼
Remotion
     ▼
MP4
```

- **Scene DSL** — a versioned, Zod-strict, non-executable description of intent. AI emits this, nothing lower.
- **Master Timeline** — the single source of truth for time. Owns scene windows, voice/music timelines, and frame conversion.
- **Scene Compiler** — the only DSL → IR boundary. Validates against the registry, resolves recipe renderers and params, binds frame windows. Reads only the timeline's public fields — `sceneWindows[sceneId]` for the scene's window, plus `fps`/`width`/`height` for `render` — and never computes timing itself.
- **Compiled IR** — data-only, JSON-serializable, integer frames. The runtime interprets it and nothing else.
- **Runtime** — a thin interpreter that dispatches each IR layer to its registered renderer backend.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full layer map and dependency rules.

## Requirements

- Node.js (ES2022 target) and **npm**.
- The Remotion family is pinned to `4.0.191`; `zod` is pinned to `3.22.3` for **our own** Scene DSL validation (the `.strict()` behavior of the DSL schema depends on it — it is not a Remotion requirement). Do not bump them independently.

## Install and run

```bash
npm install
```

| Command | What it does |
|---|---|
| `npm install` | Install dependencies. |
| `npm run dev` | Start the Vite SPA preview (the `@remotion/player` shell at `src/app/main.tsx`). |
| `npm run studio` | Open Remotion Studio on `remotion/index.ts` (the `DeLyDemo` composition). |
| `npm run typecheck` | `tsc --noEmit` across the whole repo. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run lint` | ESLint over the repo (enforces the import rules and the `Math.random` ban). |
| `npm run build` | `vite build` only — the SPA bundle. |
| `npm run bundle:remotion` | `remotion bundle remotion/index.ts` — the Remotion render bundle. |
| `npm run render:demo` | Render the 30-second demo to `out/demo.mp4`. |
| `npm run render:stills` | Render two adjacent still frames to `out/still-450.png` and `out/still-451.png`. |

**`npm run build` is only `vite build`.** It is not the whole build pass. A full
build also needs `npx tsc --noEmit` (typecheck) and `npx remotion bundle`
(or `npm run bundle:remotion`). Do not treat a green `npm run build` as proof
the repo compiles and bundles.

`out/`, `dist/`, and `build/` are gitignored and must stay untracked.

## The 30-second demo

`npm run render:demo` renders the Phase 0 vertical slice — **4 scenes /
900 frames / 30 fps / 1920×1080** (30.06 s of container runtime for 30.0 s of
content) — from a fixture Scene DSL, with no real AI and no audio:

| # | Scene | Composition | Layers | Renderer | Duration |
|---|---|---|---|---|---|
| 1 | Hero | `hero` | typography reveal | DOM | 6.0 s |
| 2 | Split explain | `split` | DOM text + `particle-field` | DOM + Canvas 2D | 9.0 s |
| 3 | 3D network | `full-screen` | `network-graph` + `camera-flythrough` | Three.js | 9.0 s |
| 4 | Typography outro | `centered` | typography | DOM | 6.0 s |

The fixture project comes from `src/ai/visual/fixture.ts` (the visual director's
single authored slice); `src/ai/fixtures/demo-project.dsl.json` is a JSON
inspection mirror of the same project, asserted value-identical to the
TypeScript fixture by deep equality in the test suite.

On this machine the rendered stills and the full MP4 reproduced byte-identically
across runs. That is an observation, not a guarantee the repository asserts:
compiler output is deterministic (exact hash) and canvas geometry is
deterministic (exact), but **Three.js pixel determinism is not guaranteed**.

## Documentation

- [`AGENTS.md`](AGENTS.md) — binding rules for any agent working in this repo, and the layer map.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, dependency rules, and why the boundaries are where they are.
- [`docs/SCENE_DSL.md`](docs/SCENE_DSL.md) — every field of the DSL, with a full worked example.
- [`docs/TIMELINE.md`](docs/TIMELINE.md) — canonical units, rounding, and the voice/music timelines.
- [`docs/VIDEO_ENGINE.md`](docs/VIDEO_ENGINE.md) — the compiled IR, hashing, the registry, and the renderer backends.
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — palette, typography, and hue conventions.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what Phase 0 shipped, Phase 1 candidates, and what is out of scope.
- [`docs/superpowers/specs/2026-10-03-delyai2-phase0-design.md`](docs/superpowers/specs/2026-10-03-delyai2-phase0-design.md) — the Phase 0 design spec.

## Phase 0 scope

Phase 0 is the engine foundation. It deliberately excludes the product layer:
**no auth, credits, marketplace, chat, history, batch, subscription, or
billing.** Real AI directors, real TTS, scene transitions, and vision QA are
Phase 1 candidates — see [`docs/ROADMAP.md`](docs/ROADMAP.md).
