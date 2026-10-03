# Roadmap

## Phase 0 — done

Phase 0 built the deterministic foundation: the Scene DSL, the Master Timeline,
the Scene Compiler, a three-backend video engine, structural QA, a preview
shell, and a 30-second demo. The acceptance list below mirrors the demo
requirements.

- [x] **Scene DSL parses and validates** — Zod `.strict()` schemas, with
  `parseSceneDsl` / `parseProjectDsl` and a QA layer that reports issues.
- [x] **Master Timeline works** — contiguous integer-frame scene windows, voice
  and music timelines, and the one `secondsToFrames` policy.
- [x] **Composition registry** — nine primitives (`hero`, `centered`,
  `full-screen`, `split`, `grid`, `comparison`, `cards`, `media-text`, `data`).
- [x] **Visual recipe registry** — five Canvas 2D and six Three.js recipes
  registered with their renderer kinds.
- [x] **Motion recipes** — seven (`fade`, `reveal`, `slide`, `scale`, `pulse`,
  `parallax`, `camera-flythrough`), each a pure frame-based transform.
- [x] **Canvas renders inside Remotion** — drawn per frame, deterministic, with
  seeded RNG and `dispose`.
- [x] **Three.js renders inside Remotion** — via `<ThreeCanvas>`, no
  `useFrame()`, GPU resources disposed on unmount.
- [x] **Remotion composes every layer** — `ProjectVideo` sequences scenes at
  their master-timeline windows; `DeLyDemo` derives its metadata from the
  timeline.
- [x] **Seed is deterministic** — identical DSL compiles to identical
  `compiledHash`; no `Math.random()` in the engine.
- [x] **MP4 renders successfully** — `npm run render:demo` produces
  `out/demo.mp4` (4 scenes / 900 frames / 30 fps / 1920×1080).
- [x] **Documentation complete** — this doc set plus `AGENTS.md`.

## Phase 1 — candidates

Not commitments; the directions the foundation was built to support.

- **Real AI directors.** Replace the fixture implementations of `StoryDirector`
  and `VisualDirector` with real ones. The contract already exists
  (`src/ai/*/contract.ts`) and `listAvailable()` already exposes ids, versions,
  and renderer kinds — never source code — so a director can choose among real
  recipes.
- **Real TTS and a real voice timeline.** The `TtsAdapter` contract returns a
  `VoiceTimeline`; Phase 0 ships fixture timing with `timingSource: "fixture"`.
  A real adapter would produce `timingSource: "exact"` with word timings, and
  the voice/scene policy could leave `strict`.
- **Transitions between scenes.** Phase 0 sequences scenes back-to-back with no
  cross-scene transition. A transition belongs in the runtime/composition layer,
  driven by master-timeline events.
- **More recipes.** The registry is the extension point; new compositions,
  visual recipes, and motion recipes register without touching the compiler or
  runtime.
- **Vision QA.** Phase 0 ships the `VisionChecker` boundary only, returning
  `available: false`. Phase 1 implements the checker behind that interface and
  wires a bounded repair loop (spec §9: at most one visual repair, then stop).

Work that was planned but is not built in Phase 0, and should be treated as
Phase 1 or later: the `src/domain/` tree (`projects`, `assets`, `jobs`,
`generation`), named style registries, and a resolved `backdropRenderer`.

## Out of scope for Phase 0

Explicitly excluded from the foundation:

- Auth
- Credits
- Marketplace
- Chat
- History
- Batch
- Subscription
- Billing
- A real TTS provider (fixture timing only)
- Vision AI (interface boundary only)
