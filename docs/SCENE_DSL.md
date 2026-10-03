# Scene DSL v0

The Scene DSL is the **input contract** of the engine: the only thing AI (or a
fixture) is allowed to produce. It is defined by Zod schemas in
`src/video-engine/schema/scene-dsl.ts` and every object is `.strict()` — unknown
fields are rejected, not ignored.

Two schemas matter:

- `SceneDSLSchema` — one scene.
- `ProjectDSLSchema` — a project: render settings plus an ordered, non-empty
  list of scenes.

`parseSceneDsl(value)` and `parseProjectDsl(value)` throw a descriptive error on
invalid input; `safeParse` is used by QA layer 1 to report rather than throw.

## Hard rules

- **No executable content.** No field holds JS, JSX, an expression, or a
  string that will be evaluated. The DSL is data.
- **Seconds only.** Every time value in the DSL is in **seconds**. Frames appear
  only after the compiler.
- **The renderer is not in the DSL.** A visual recipe's renderer is resolved by
  the registry (`recipe → registry → recipe.renderer`). The DSL says "I want
  `network-graph`", not "use Three". The single valid exception is
  `backdropRenderer` (below).
- **`purpose` is semantic metadata only.** The compiler must never branch on it
  — no `if (purpose === "hook") composition = "hero"`. The test
  `never branches on purpose` in `tests/video-engine/compiler.test.ts` pins this.
- All ids (`composition`, `recipe`) are opaque strings here; the compiler
  validates that they exist in the registry.

## `SceneDSLSchema`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `schemaVersion` | `"0.1"` (literal) | required | DSL version. Must equal `SCENE_DSL_VERSION`. |
| `sceneId` | `string` (min 1) | required | Stable scene identity. Must match a key in the timeline's `sceneWindows`. |
| `purpose` | `ScenePurpose` | required | Semantic label (see below). Never branched on by the compiler. |
| `duration` | `number` (positive, finite) | required | Scene length in **seconds**. The compiler checks this against the timeline window. |
| `composition` | `string` (min 1) | required | Composition id from the registry (e.g. `hero`, `split`). |
| `backdropRenderer` | `"dom" \| "canvas2d" \| "three"` | optional | Explicit renderer for the scene's *backdrop layer*. The one place the DSL names a renderer. See below. |
| `visual` | `VisualLayerSpec[]` | default `[]` | Visual content layers. |
| `motion` | `MotionLayerSpec[]` | default `[]` | Motion layers, attached by explicit target. |
| `typography` | `TypographySpec \| null` | default `null` | Text layer, or none. |
| `audio` | `AudioCueSpec[]` | default `[]` | Audio cues (Phase 0: contract only, no audio is played). |
| `events` | `SceneEventSpec[]` | default `[]` | Scene-local events at a time offset. |
| `style` | `StyleRef` | required | Style reference (see below). |
| `seed` | `number` (integer, finite) | required | Seed for any seeded randomness in the scene. |

### `purpose` — the enum

```ts
type ScenePurpose =
  | "hook" | "explain_network" | "explain_concept" | "demonstrate"
  | "compare" | "data_reveal" | "summary" | "outro"
```

`purpose` is **semantic metadata the compiler must never branch on.** It exists
so a future director can be reasoned about and so diagnostics can be labelled;
it must not silently drive composition or animation choice. Adding a new
`purpose` value must not change rendering behavior.

### `backdropRenderer` — the one explicit renderer override

For every visual recipe, the renderer comes from the registry. `backdropRenderer`
is the sole exception: it names the renderer for the scene's *backdrop layer*,
which is a different thing from a recipe's renderer. It has no separate
`params`; it is a scene-level hint.

In Phase 0 the compiler records the hint as scene data only. No "backdrop"
recipe is registered, so inventing a layer for it would reference a recipe that
does not exist (see the comment in `src/video-engine/compiler/compile-scene.ts`).
A later phase can resolve it against the registry.

### `VisualLayerSpec`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | `string` (min 1) | optional | Stable layer id. Motion `target` matches exactly this. Defaults to `` `${sceneId}-visual-${index}` ``. |
| `recipe` | `string` (min 1) | required | Visual recipe id from the registry. |
| `params` | `JsonObject` | default `{}` | Recipe params. Validated and defaulted by the compiler against the recipe's own schema. |
| `slot` | `string` (min 1) | optional | Composition slot to occupy. If omitted, the compiler assigns slots by index. |

### `MotionLayerSpec`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `recipe` | `string` (min 1) | required | Motion recipe id from the registry. |
| `params` | `JsonObject` | default `{}` | Recipe params. |
| `target` | `string` (min 1) | optional | Layer `id` to attach to. Without a target the compiler emits a `MOTION_WITHOUT_TARGET` warning and skips it. Phase 0 allows **one motion per layer**. |

### `TypographySpec`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `text` | `string` | required | The text to render. |
| `animation` | `"none" \| "fade" \| "reveal" \| "typewriter" \| "word-by-word"` | default `"fade"` | How the text appears. |
| `slot` | `string` (min 1) | optional | Slot to occupy. Defaults to the composition's first slot. |
| `startSeconds` | `number` (≥ 0, finite) | optional | Start offset within the scene. Omitted means the whole scene. |
| `durationSeconds` | `number` (positive, finite) | optional | How long the text is shown. Clamped to the scene window. |

### `AudioCueSpec`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `at` | `number` (≥ 0, finite) | required | Cue time, in seconds, from scene start. |
| `cue` | `string` (min 1) | required | Cue id. |
| `params` | `JsonObject` | default `{}` | Cue params, carried into the IR audio entry. |

### `SceneEventSpec`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `at` | `number` (≥ 0, finite) | required | Event time, in seconds, local to the scene. |
| `kind` | `string` (min 1) | required | Event kind. |
| `payload` | `JsonObject` | default `{}` | Event payload. |

### `StyleRef`

One of:

- `{ styleId: string }` — reference a named style, or
- `{ tokens: JsonObject }` — inline style tokens.

Style is a separate domain from recipe params; recipes receive style tokens,
they do not hard-code style (see [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)).

> **Output vs input note.** Because Zod `.default(...)` fills absent fields, the
> parsed output type (`SceneDSL`) has `visual`, `motion`, `audio`, `events`,
> `typography`, and `params` as *required* (with defaults applied). Hand-authored
> fixtures list them explicitly for that reason — e.g. `audio: [], events: []`.

## `ProjectDSLSchema`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `dslVersion` | `"0.1"` (literal) | required | Project DSL version. |
| `project` | `{ id, title, language }` | required | Project metadata. `language` is min length 2. |
| `render` | `{ fps, width, height }` | required | `fps` positive finite; `width`/`height` positive integers. |
| `style` | `StyleRef` | default `{ styleId: "default" }` | Project-level style. |
| `seed` | `number` (integer, finite) | required | Project seed. |
| `voiceScenePolicy` | `"strict" \| "extend_to_voice" \| "stretch_to_voice"` | default `"strict"` | How voice/scene conflicts are handled (see [`TIMELINE.md`](TIMELINE.md)). Mirrored from the timeline without importing it. |
| `music` | `{ bpm: number; style?: string } \| null` | default `null` | Music spec. `bpm` is positive finite. |
| `scenes` | `SceneDSL[]` (min 1) | required | Ordered scenes. Order is semantic: it is the timeline order. |

## Worked example — the 4-scene demo DSL

This is the exact Phase 0 fixture project (`src/ai/visual/fixture.ts`, mirrored
in `src/ai/fixtures/demo-project.dsl.json`). It renders to 4 scenes / 900 frames
at 30 fps / 1920×1080.

```json
{
  "dslVersion": "0.1",
  "project": {
    "id": "delyai2-phase0-demo",
    "title": "DeLyAI2 — Video Engine Phase 0",
    "language": "vi"
  },
  "render": { "fps": 30, "width": 1920, "height": 1080 },
  "style": { "styleId": "default" },
  "seed": 20261003,
  "voiceScenePolicy": "strict",
  "music": null,
  "scenes": [
    {
      "schemaVersion": "0.1",
      "sceneId": "scene-hero",
      "purpose": "hook",
      "duration": 6,
      "composition": "hero",
      "visual": [],
      "motion": [],
      "typography": {
        "text": "DeLyAI2",
        "animation": "reveal",
        "slot": "main",
        "startSeconds": 0.4,
        "durationSeconds": 5
      },
      "audio": [],
      "events": [],
      "style": { "styleId": "default" },
      "seed": 20261003
    },
    {
      "schemaVersion": "0.1",
      "sceneId": "scene-split",
      "purpose": "explain_concept",
      "duration": 9,
      "composition": "split",
      "visual": [
        {
          "id": "split-particles",
          "recipe": "particle-field",
          "params": { "count": 48, "hue": 200, "speed": 1 },
          "slot": "aside"
        }
      ],
      "motion": [
        {
          "recipe": "slide",
          "target": "split-particles",
          "params": { "axis": "x", "distance": 0.08, "easing": "out" }
        }
      ],
      "typography": {
        "text": "AI mô tả ý định",
        "animation": "fade",
        "slot": "main",
        "startSeconds": 1,
        "durationSeconds": 4
      },
      "audio": [],
      "events": [],
      "style": { "styleId": "default" },
      "seed": 20261003
    },
    {
      "schemaVersion": "0.1",
      "sceneId": "scene-network",
      "purpose": "explain_network",
      "duration": 9,
      "composition": "full-screen",
      "visual": [
        {
          "id": "network",
          "recipe": "network-graph",
          "params": { "nodes": 28, "radius": 2.6, "color": "#4a9eff" },
          "slot": "main"
        }
      ],
      "motion": [
        {
          "recipe": "camera-flythrough",
          "target": "network",
          "params": { "from": 0.9, "to": 1.05 }
        }
      ],
      "typography": {
        "text": "Một master timeline",
        "animation": "word-by-word",
        "slot": "main",
        "startSeconds": 0.6,
        "durationSeconds": 4
      },
      "audio": [],
      "events": [],
      "style": { "styleId": "default" },
      "seed": 20261003
    },
    {
      "schemaVersion": "0.1",
      "sceneId": "scene-outro",
      "purpose": "outro",
      "duration": 6,
      "composition": "centered",
      "visual": [],
      "motion": [],
      "typography": {
        "text": "Phase 1",
        "animation": "typewriter",
        "slot": "main",
        "startSeconds": 0.8,
        "durationSeconds": 3
      },
      "audio": [],
      "events": [],
      "style": { "styleId": "default" },
      "seed": 20261003
    }
  ]
}
```

A scene with an empty `visual` array is a valid DOM-only scene (scenes 1 and 4
here), not a missing layer. Do not add a decorative canvas recipe to them — that
would change their renderer and break the demo's renderer table.
