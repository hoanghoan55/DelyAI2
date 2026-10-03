# Video Engine

This document covers the compiled IR, how it is hashed, the recipe registry and
renderer backends, and the Canvas 2D and Three.js subsystems.

## Compiled Scene IR v0

Defined in `src/video-engine/ir/types.ts`. The IR is the **output contract** —
what the compiler produces and the only thing the runtime consumes.

```ts
type CompiledScene = {
  irVersion: "0.1"
  sceneId: string
  seed: number
  render: { fps: number; width: number; height: number }
  timing: { startFrame: number; durationInFrames: number }   // absolute, master timeline
  composition: { id: string; slots: string[] }
  layers: CompiledLayer[]                                    // sorted by zIndex
  typography: CompiledTypography | null
  events: { atFrame: number; kind: string; payload: JsonObject }[]
  audio: { atFrame: number; durationInFrames: number; cue: JsonObject }[]
  diagnostics: Diagnostic[]
  provenance: { engineVersion: string; sourceHash: string; compiledHash: string }
}
```

```ts
type CompiledLayer = {
  id: string
  layerKind: "visual" | "effect" | "text" | "media"
  recipeId: string
  recipeVersion: string
  renderer: "dom" | "canvas2d" | "three"     // resolved from the registry
  slot: string
  frameWindow: { from: number; durationInFrames: number }   // LOCAL to the scene
  params: JsonObject                          // defaults applied, validated
  motion: CompiledMotion[]
  zIndex: number
  assetRefs: AssetRef[]
  backdrop?: boolean
}
```

### Data-only

**Nothing in the IR is executable.** There are no functions, class instances, or
`Object3D` values — only JSON. `canonicalize(ir)` is called in the test suite and
must not throw, and `JSON.parse(JSON.stringify(ir))` must round-trip unchanged.
The runtime is the only interpreter.

### Integers only

**Every frame value in the IR is an integer.** `secondsToFrames` rounds, and the
compiler asserts the result with `assertFrames` so a non-finite seconds value
(NaN/Infinity) fails with a `NON_FINITE_FRAME` diagnostic instead of silently
poisoning the hash. The runtime re-asserts on the way in (`frame-math.ts`) and
throws rather than rounding or clamping a fractional frame — a non-integer frame
is a contract violation, not something to repair.

### Local vs absolute frames

- `timing` is **absolute** on the master timeline.
- A layer's `frameWindow` is **local to its scene**.
- The runtime computes the absolute frame as `scene.startFrame + layerLocalFrame`.

### `ResolvedParams`

`params` is a plain `JsonObject`. The compiler does the entire
`validate → default → normalize` pass (`resolveParams` in `compiler/params.ts`);
**the runtime never resolves a default.** `applyMotion` hands `motion.params` to
the recipe verbatim for exactly this reason.

## Provenance and `compiledHash`

Two hashes, with different jobs (`compiler/params.ts`, `ir/hash.ts`):

```
sourceHash   = hash(canonical DSL + schemaVersion + asset fingerprints)
compiledHash = hash(canonical IR, with provenance.compiledHash EXCLUDED)
```

- `sourceHash` proves the **input** was the same.
- `compiledHash` proves the **compiler produced the same output** — this is the
  real determinism test.

`engineVersion` enters `compiledHash`, not `sourceHash`: it is part of the
provenance that `computeCompiledHash` hashes (`ir/hash.ts`), while
`computeSourceHash` hashes only `{ schemaVersion, dsl, assetFingerprints }`.

### Non-circular, two-step

`compiledHash` must not hash itself. `computeCompiledHash` handles this by
hashing a copy of the scene whose provenance carries only `engineVersion` and
`sourceHash`:

```ts
export function computeCompiledHash(scene: CompiledScene): string {
  return hashObject({
    ...scene,
    provenance: { engineVersion: ENGINE_VERSION, sourceHash: scene.provenance.sourceHash },
  })
}
```

`compileScene` then attaches it:

```ts
const compiledHash = computeCompiledHash(base)
return { ...base, provenance: { ...base.provenance, compiledHash } }
```

`tests/video-engine/ir.test.ts` pins that `computeCompiledHash` ignores the
existing `compiledHash` (no circularity) and that it changes with IR content.

## Canonical JSON

Defined in `src/shared/canonical-json.ts`. Every hash in the system goes through
it, so key order can never change a result. The rules:

- **Object keys** are sorted lexicographically.
- **Arrays keep their order** — `layers`, `events`, and `audio` are semantic, so
  they are never sorted. A test pins that swapping two layers changes the hash.
- **Numbers**: integers in canonical decimal form (`5`, not `5.0`); floats in
  one canonical form via `String(n)`.
- **`-0` becomes `0`.**
- **`NaN` and `Infinity` throw** (`canonicalize: non-finite number is not allowed`).
- **UTF-8 encoding.**
- **No whitespace.**

Hashing is done by `hashObject(value) = sha256Hex(canonicalize(value))`. The
SHA-256 implementation in `src/shared/hash.ts` is dependency-free so it runs in
Node and in Remotion's Chromium render bundle, where `node:crypto` is absent.

## Recipe registry

`src/video-engine/registry/`. A visual recipe carries its own renderer kind; the
DSL does not name one.

```ts
type VisualRecipe = {
  id: string
  version: string
  renderer: "dom" | "canvas2d" | "three"   // the registry, not the DSL, decides this
  paramsSchema: ZodType
  defaults: Partial<P>
  plannedDurationHint?: number
}
```

Resolution API: `resolveVisual(id)`, `resolveMotion(id)`, `resolveComposition(id)`,
plus non-throwing `hasVisual/hasMotion/hasComposition`, and `listAvailable()`
(ids and versions for all three kinds; a `renderer` field on visual recipes only
— never source code).

Registration is split into two entry points:

- `registerMetadata()` (`registry/register.ts`) registers compositions only.
- `registerBackends()` (`runtime/register-backends.ts`) calls `registerMetadata()`
  and additionally registers the canvas/three/motion recipe implementations and
  the three renderer backends. The Remotion entry point and the app call this;
  `clearRegistered()` resets everything between tests. (Tests call
  `registerBackends()` or targeted `register*()` helpers directly — no test
  calls `registerMetadata()`.)

**Renderer backends** are a separate small registry
(`registry/renderer-backends.ts`): `registerRendererBackend(kind, backend)`,
`getRendererBackend(kind)`, and non-throwing `hasRendererBackend(kind)`. The
runtime's `LayerRenderer` does one lookup — `getRendererBackend(layer.renderer)`
— and mounts the result. That lookup is the entire coupling between the runtime
and Canvas/Three.

**Composition primitives** (`video-engine/compositions/`) are nine definitions,
each with declared slots and a pure `layout(args) => SlotRect[]`:
`hero`, `centered`, `full-screen`, `split`, `grid`, `comparison`, `cards`,
`media-text`, `data`. `hero`, `data`, and `full-screen` share the full-frame
layout; `comparison` shares split; `cards` shares grid.

## Canvas 2D subsystem

`src/video-engine/canvas/`. A `CanvasRecipe` is:

```ts
type CanvasRecipe<P> = {
  id: string; version: string
  paramsSchema: ZodType
  prepare?: (ctx, size, params) => CanvasState
  render: (ctx, args: { frame; fps; size; params; state; rng: SeededRandom }) => void
  samplePositions?: (frame, fps, state, params, rng) => number[]   // headless determinism probe
  dispose?: (state: CanvasState) => void
}
```

Integration rules (`Canvas2DBackend.tsx`):

- Drawing is a **pure function of `frame`**, via `useCurrentFrame()` — never a
  wall-clock animation loop. `render(frame)` can be called for any frame in any
  order and produces the same 2D draw call stream (pinned by
  `tests/video-engine/canvas.test.ts` using a headless recording context).
- `prepare` runs once per layer instance; `dispose` runs on unmount.
- The seeded RNG is constructed from the layer id and absolute frame and passed
  into `render` — recipes never call `Math.random()`.
- `samplePositions` is an inspection API for headless determinism checks; the
  render path emits pixels through `render(...)`, not through this helper.

Phase 0 recipes (`canvas/register.ts`): `particle-field`, `grid`, `waveform`,
`glow`, `geometric-lines`.

## Three.js subsystem

`src/video-engine/three/`. A `ThreeRecipe` is:

```ts
type ThreeRecipe<P> = {
  id: string; version: string
  paramsSchema: ZodType
  describe?: (args: ThreeBuildArgs<P>) => SceneDescriptor   // the determinism gate
  build: (args: ThreeBuildArgs<P>) => React.ReactNode       // subtree inside <ThreeCanvas>
  disposeResources?: (args: ThreeBuildArgs<P>) => void
}
```

Integration rules (`ThreeBackend.tsx`):

- Wrapped in `@remotion/three`'s `<ThreeCanvas>`, which **requires `width` and
  `height`** (passed from the render size).
- **`useFrame()` is forbidden.** It is a wall-clock R3F loop that would break
  Remotion's frame-by-frame determinism. Animation reads the frame value passed
  down the tree; recipes call `useCurrentFrame()` from inside their subtree.
- **GPU resource control**: R3F disposes declarative geometries, materials, and
  textures when their nodes unmount. A recipe that allocates resources outside
  the declarative tree declares `disposeResources`, which the backend calls
  exactly once on unmount (never per frame).

Phase 0 recipes (`three/register.ts`): `network-graph`, `particles-3d`,
`wireframe-object`, `basic-scene`, `camera`, `lighting`. (`camera` bakes a
camera move into the scene as a visual recipe; motion recipes separately
transform layers.)

## Determinism levels

The engine claims three distinct levels, each checked at its real level rather
than overstated (`tests/determinism/determinism.test.ts`):

1. **Compiler — exact.** `compile(input)` twice produces identical
   `provenance.compiledHash` (a 64-character SHA-256 hex digest). This is the
   primary determinism gate.
2. **Canvas — geometry / call-stream exact.** Canvas drawing is a pure function
   of the frame: the same frame draws the same 2D call stream regardless of
   draw order, so the geometry and sampled positions reproduce exactly. The
   suite drives every recipe headlessly through a recording context (call
   stream, not rasterized pixels); there is **no golden-image test in CI**.
3. **Three.js — structural.** Determinism is a `structuralHashOf(descriptor)`
   over a `SceneDescriptor` (recipe id/version, frame, camera, object
   transforms, geometry/material/light params, seed) — a data-only value that
   round-trips through JSON. `structuralHashOf` is order-stable across object
   key insertion orders and frame-sensitive.

**Three.js pixel determinism is not guaranteed.** WebGL / Chromium / GPU
rasterization can differ across environments, so structural hash + a smoke test
+ manual inspection are the gate. A structural hash must never be called
"visual determinism".

On this machine, the demo's rendered stills and full MP4 reproduced
byte-identically across runs. That is an observation of this environment, not a
guarantee the repository asserts.

**Every deterministic test uses the same input set:** DSL + seed + asset
fingerprints + engine version + fps + width + height.

`ENGINE_VERSION` is `'0.1.0'` and `IR_VERSION` is `'0.1'`
(`src/video-engine/version.ts`).
