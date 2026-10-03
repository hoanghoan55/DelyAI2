# Timeline

The timeline (`src/timeline/**`) is the **single source of truth for time** in
the engine. No other module computes scene start frames or durations. The
compiler reads `timeline.sceneWindows[sceneId]`; it never re-derives timing from
the DSL's seconds.

## Canonical units

Defined in `src/timeline/units.ts` as branded types, so a plain `number` cannot
be silently passed where a `Seconds` or `Frames` is expected:

```ts
type Seconds = number & { __brand: "Seconds" }
type Milliseconds = number & { __brand: "Milliseconds" }
type Frames = number & { __brand: "Frames" }   // integer
```

Helpers `seconds(n)`, `milliseconds(n)`, and `frames(n)` construct branded
values from plain numbers.

**The DSL is in seconds. The IR is in frames.** Milliseconds appear only in the
voice timeline (audio timing is measured in ms by external tools). Conversion
happens in exactly one place.

## The one rounding policy

`src/timeline/convert.ts` is the **only** module allowed to convert between time
units. No module may call `Math.round` / `Math.floor` / `Math.ceil` on a time
value itself.

```ts
secondsToFrames(seconds, fps) => Math.round(seconds * fps)
framesToSeconds(frames, fps)  => frames / fps
msToFrames(ms, fps)           => Math.round((ms / 1000) * fps)
framesToMs(frames, fps)       => (frames / fps) * 1000
beatToFrame(beat, bpm, fps)   => Math.round((beat / bpm) * 60 * fps)
```

Tests pin these at both 30 fps and 29.97 fps: the same seconds and fps always
produce the same frames.

## Scene window accumulation — add in frames, never in seconds

`buildMasterTimeline` lays out scenes by adding **integer frames**:

```ts
let cursor = 0
for (const scene of input.scenes) {
  const durationInFrames = secondsToFrames(scene.duration, fps)
  sceneWindows[scene.sceneId] = { startFrame: cursor, durationInFrames }
  cursor += durationInFrames            // integer accumulation
}
const totalFrames = cursor
```

**Cumulative-seconds rounding is forbidden.** Computing
`startFrame = round(cumulativeSeconds * fps)` at a fractional fps such as
29.97 produces gaps or one-frame overlaps between scenes. Accumulating integer
frame durations guarantees `Σ durationInFrames === totalFrames` exactly, which
is what `checkTimeline` (QA layer 2) asserts.

One scene's `duration` in the DSL must round to its window's `durationInFrames`;
the compiler fails with `DURATION_MISMATCH` otherwise.

## `TimingSource`

```ts
type TimingSource = "exact" | "estimated" | "fixture"
```

Used by voice segments and voice timelines. **`estimated` is never treated as
`exact`.** A voice segment with `timingSource: "estimated"` has an empty `words`
array (estimated timing is never word-exact), and `buildMasterTimeline` emits a
`VOICE_ESTIMATED_TIMING` warning when a scene leans on estimated timing. The
Phase 0 fixture adapter reports `"fixture"` — honest about the fact that no real
audio exists.

## Voice timeline

`src/timeline/voice.ts`. A `VoiceSegment` maps to a scene by **explicit
`sceneId`** — heuristics such as `duration * 0.35` or proportional splitting are
forbidden.

```ts
type VoiceSegment = {
  id: string
  text: string
  startMs: number
  endMs: number
  words: WordTiming[]      // empty when timingSource = "estimated"
  timingSource: TimingSource
  sceneId: string          // explicit mapping, never inferred
}

type VoiceTimeline = {
  segments: VoiceSegment[]
  totalMs: number
  timingSource: TimingSource
}
```

`buildMasterTimeline` validates every segment's `sceneId`:
`VOICE_UNKNOWN_SCENE` (error) if the scene does not exist,
`VOICE_ESTIMATED_TIMING` (warning) for estimated timing.

## Music timeline

`src/timeline/music.ts` is **independent of voice** — it is measured in beats,
not milliseconds, and never reads the voice timeline.

```ts
type MusicTimeline = {
  bpm: number
  sections: { id: string; startBeat: number; endBeat: number; energy: number }[]
  events: { atBeat: number; kind: string; payload: JsonObject }[]
}
```

Music events are converted to global master events with `beatToFrame(atBeat,
bpm, fps)` when the master timeline is built.

## Master timeline

`src/timeline/master.ts`.

```ts
type MasterTimeline = {
  fps: number
  width: number
  height: number
  totalFrames: number
  sceneWindows: Record<string, { startFrame: number; durationInFrames: number }>
  voice: VoiceTimeline | null
  music: MusicTimeline | null
  events: { atFrame: number; scope: "global" | string; kind: string; payload: JsonObject }[]
  diagnostics: Diagnostic[]
}

buildMasterTimeline(input: {
  fps; width; height
  scenes: { sceneId: string; duration: number }[]   // duration in seconds
  voice?; music?
  voiceScenePolicy: "strict" | "extend_to_voice" | "stretch_to_voice"
  globalEvents?
}): MasterTimeline
```

## `voiceScenePolicy`

Explicit policy for voice/scene conflicts. Three values exist so the boundary is
not hidden behind a heuristic:

- **`strict`** — the scene window is authoritative. If a voice segment ends
  after its scene window, the master timeline emits a `VOICE_OVERRUNS_SCENE`
  **warning**; it never mutates the window. **This is the Phase 0 default**
  (`ProjectDSLSchema.voiceScenePolicy` defaults to `"strict"`).
- `extend_to_voice` and `stretch_to_voice` — accepted as enum values and
  reserved for later phases. In Phase 0 the master timeline only implements the
  `strict` behavior; passing the other values allocates no automatic correction.

The design principle behind `strict`: report the conflict, never silently absorb
it. A deterministic engine that quietly stretches a scene to fit voice timing is
no longer deterministic in the way its hashes claim.
