# Design System

DeLyAI2's visual language is deliberately small in Phase 0: a dark canvas, a
single type family, and a fixed set of accent hues shared across the Canvas 2D
and Three.js recipes. The point is that scenes look like one system regardless
of which renderer draws them.

## Palette

The runtime background and foreground are defined once and reused everywhere:

| Role | Value | Where |
|---|---|---|
| Background | `#05070d` | `runtime/SceneRenderer.tsx`, `runtime/ProjectVideo.tsx`, `app/app.css` (`body`) |
| Foreground | `#f7f9ff` | `runtime/TypographyLayer.tsx`, `app/app.css` (`body`) |

These are the values the demo actually renders against. `ProjectVideo` and
`SceneRenderer` both set `backgroundColor: '#05070d'` on their `AbsoluteFill`,
and the app shell sets it on `body` with `color-scheme: dark`.

## Typography

- **Family:** `Inter, system-ui, sans-serif`. Inter is referenced but not
  bundled; on a machine without it the system sans is used.
- **Hero scale:** `96px` at weight `700`, letter-spacing `-1`, centered, with
  `80px` padding — this is the runtime's typography layer
  (`runtime/TypographyLayer.tsx`), used by the hero and outro scenes.
- **Placeholder scale:** `24px` at `rgba(247,249,255,0.5)` for the DOM
  placeholder backend.

The typography layer animates by `animation` (`none`, `fade`, `reveal`,
`typewriter`, `word-by-word`); `typewriter` reveals progressively by slicing the
text against an interpolated progress value driven by the frame, never by
wall-clock time.

## Hue conventions

Canvas recipes share one accent system. Each recipe has a `hue` param defaulting
to a **semantic slot** rather than an arbitrary number:

| Hue | Color | Meaning | Used by |
|---|---|---|---|
| `200` | Blue | Primary / motion | `particle-field` (default) |
| `210` | Blue | Structure / grid | `grid` (default) |
| `265` | Violet | Emphasis / glow | `glow` (default) |
| `24` | Amber | Warm accent / lines | `geometric-lines` (default) |
| `160` | Teal | Data / audio | `waveform` (default) |

Canvas recipes emit these as `hsla(hue, ~80–90%, ~60–70%, alpha)`, so a recipe
that receives a hue stays inside the system's saturation and lightness range.

The Three.js recipes use hex approximations of the same slots:

| Value | Role | Used by |
|---|---|---|
| `#4a9eff` | Primary blue | `network-graph`, `basic-scene` (defaults) |
| `#7cc4ff` | Light blue | `particles-3d` (default) |
| `#9dd0ff` | Pale blue | `camera` (default) |
| `#ff8a3d` | Amber | `wireframe-object` (default) |
| `#ffffff` | Neutral | `lighting` (default) |

The demo's scene 3 (`network-graph`) overrides the default with `#4a9eff` —
the same primary blue as the canvas slot 200.

## The style rule

**Style tokens live in the DSL's `style` field, not in recipes.** A recipe
receives params and (for compositions) style tokens; it does not hard-code a
palette. This is what makes "same style ≠ same video" achievable: composition
decides structure, visual recipe decides content, motion recipe decides
movement, style decides skin.

In Phase 0 style tokens are part of the **DSL contract**, and the rule above is
enforced by where they live, but the plumbing into layout is **not wired**:

- `ProjectDSLSchema.style` and `SceneDSLSchema.style` are `StyleRef`
  (`{ styleId }` or `{ tokens }`) — validated on input.
- The compiler never reads `dsl.style`, `SceneRenderer` calls the composition
  `layout` with a hardcoded `style: {}`, and no Phase 0 layout reads
  `args.style`.
- The demo uses `{ styleId: 'default' }`; no named style registry exists.

Flowing tokens from the DSL into `layout` is a Phase 1 concern.

Recipes must not import from `src/app/**` (see [`AGENTS.md`](../AGENTS.md)),
which is also what keeps style out of product UI code.

## Shared three-pronged rendering

A scene composes three independent choices:

- **Composition** (`hero`, `split`, `full-screen`, …) — the structure and slot
  geometry. Pure layout; no style, no content.
- **Visual recipe** — the content inside a slot (`particle-field`,
  `network-graph`, …). Decides pixels; receives colors through params.
- **Motion recipe** (`fade`, `slide`, `camera-flythrough`, …) — a data-only
  `LayerTransform` the runtime applies as CSS. Recipes never return JSX for
  motion.

Style is the fourth axis and belongs to the DSL, not to any of the three.
