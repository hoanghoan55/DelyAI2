# DeLyAI2 Phase 1A — Real AI Director + Real TTS (Design)

**Date:** 2026-10-03
**Status:** approved in design review (4/4 sections), pending implementation plan
**Baseline:** `master` @ `9c73ba9` (Phase 0, final review SPEC/QUALITY PASS)
**Outlines the pipeline that proves:** user brief → StoryDirector → TTS → VoiceTimeline →
MasterTimeline → VisualDirector → SceneDSL → Compiler → Remotion → MP4 — with no path back to
raw Scene Code.

---

## 1. Goal & success criteria

**Goal.** Replace the Phase 0 fixtures with real AI (Gemini) and real TTS (self-hosted
TTS Studio), and prove the whole architecture end-to-end on one vertical slice: a complete
narrated MP4 generated from a text brief.

**Success criteria (all must hold):**

1. One CLI invocation from a Vietnamese brief produces `generated/<runId>/video.mp4`:
   real voice audio, word-exact voice timing, **0** `VOICE_OVERRUNS_SCENE` warnings,
   all Phase 0 gates green (`tsc`, `vitest`, `eslint`, `vite build`, `remotion bundle`).
2. When every upstream artifact of a run is valid, `--resume <run-id>` does **not** call
   Gemini/TTS/ASR again — it only executes the missing downstream stages.
3. Re-rendering a completed run's `compiled/` + `voice/` artifacts reproduces the same
   video **without** any AI or TTS call (engine-level reproducibility, §10).
4. Unit tests always run; integration tests skip cleanly when credentials are absent —
   the normal gate never goes red for missing `GEMINI_API_KEY` / TTS access.

## 2. Non-goals (Phase 1A OUT)

- StyleRef token consumption by layout/recipes (Phase 1B — 1A only designs the
  vocabulary: style presets are prompt catalogue entries, DSL field already exists).
- Scene transitions (1C); more recipes (1C); Vision QA / repair loop (1D); benchmark (1E).
- Agent loops, tool calling, multi-agent orchestration — exactly **2 Gemini calls** per run
  (story, visual) plus bounded per-stage retries.
- Voice cloning, voice design, streaming TTS.
- `src/domain/` jobs/queue infrastructure; Auth/Credits/Marketplace/Chat/History/Batch/
  Subscription/Billing (Phase 0 scope rule stays in force).
- Any change to `E:\TTS-ASR-API` beyond adding `word_timestamps` to
  `POST /v1/speech-to-text` (§6.4).
- Music timeline (voice only in 1A).

## 3. Pipeline (order is a hard contract)

```
Brief {topic, targetSeconds, language}
  ↓ ① StoryDirector (Gemini #1)
StoryPlan {title, scenes[{purpose, narration, durationSeconds*}]}   *estimate only
  ↓ ② TTS + ASR — one call per scene → voice/<sceneId>.mp3 + WordTiming[]
  ↓ ③ Retime — duration := audioDuration + RETIME_PADDING   (audio is authority)
  ↓ ④ buildMasterTimeline(scenes + voice) → sceneWindows (exact, strict)
  ↓ ⑤ VisualDirector (Gemini #2) — receives LOCKED sceneWindows + catalogue
  → SceneDSL[]  (Zod strict; bounded retry, DSL → diagnostics → DSL)
  ↓ ⑥ compileScene × N → Compiled IR (+ render-props.json)
  ↓ ⑦ Remotion render (+ VoiceTrack audio) → video.mp4
```

**Locked consequences:**

- **TTS runs before the Visual Director.** Visual Director receives final `sceneWindows`
  and may only design *inside* them; it can never change timing (§9.4).
- **`voiceScenePolicy: 'strict'` is satisfied by construction:** `duration` is derived
  from real audio + padding, so `msToFrames(endMs) ≤ durationInFrames` always holds.
  `extend_to_voice` / `stretch_to_voice` remain unimplemented.
- **`StoryPlan.durationSeconds` is an estimate** that guides narration length only;
  final scene duration is never taken from it.
- **Stage failures are hard failures.** TTS failure ⇒ run fails (no estimated fallback);
  ASR failure ⇒ run fails (no `words: []` silently).

## 4. Gemini integration

Module layout (layer `ai` — may import only `shared`, `schema` (types), `timeline`):

```
src/ai/gemini/
├── client.ts            # infrastructure only: Gemini REST → generic JSON. Knows no StoryPlan/DSL.
├── story-director.ts    # prompt + responseSchema + Zod StoryPlan validation + retry accounting
├── visual-director.ts   # prompt + catalogue injection + responseSchema + Zod/compile validation + retry
├── prompts/
│   ├── story.ts         # template + PROMPT_VERSION (part of sourceHash chain, §7)
│   └── visual.ts
└── retry.ts             # shared bounded-retry helper (3 attempts per stage/run)
```

**Locked rules:**

1. **Zod is the authority.** `responseSchema` only steers Gemini's shape; acceptance is
   `parseProjectDsl` / `parseSceneDsl` / StoryPlan Zod schema on our side. Model output is
   never trusted before validation.
2. **Bounded retry, per stage, per run: max 3 attempts.** Attempt fails on Zod parse error
   **or** compile diagnostics (`UNKNOWN_*`, `INVALID_PARAMS`, …). The retry message carries
   the previous output + diagnostics so the model corrects itself. Diagnostics of every
   attempt are stored in `manifest.json`. Attempt 3 fails ⇒ run fails with full diagnostics.
   Visual never triggers a Story or TTS re-call; Story never triggers a Brief re-ask.
3. **Catalogue injection.** Visual Director receives only metadata from `listAvailable()`:
   `{id, version, renderer?}` for compositions/visual recipes/motion recipes, plus the
   style preset catalogue, `ScenePurpose` enum, typography vocabulary, and seed. **Never**
   source code. Ids it invents fail compile with `UNKNOWN_*` and are corrected via retry.
4. **Config:** `GEMINI_API_KEY` and `GEMINI_MODEL` from environment (`.env`,
   git-ignored). API keys never appear in any committed file (spec, plan, prompts, code,
   tests, fixtures).
5. **Client transport:** plain REST via `fetch` preferred (no SDK dependency); the plan
   confirms the exact model id and JSON-mode/schema parameters against current Gemini
   docs before implementation.
6. **Input surface:** `Brief` stays `{topic, targetSeconds, language}`. The story prompt
   instructs scene count/durations to approximate `targetSeconds`; final duration authority
   is the audio (§3).

## 5. TTS integration (adapter contract)

**Adapter:** `src/ai/tts/remote.ts` implements the existing `TtsAdapter`
(`synthesize(input) → VoiceTimeline`). Pure HTTP adapter: no orchestration, no retime.
One `VoiceSegment` per scene, **scene-relative** (`startMs: 0`, `endMs: audio duration ms`)
— matching Phase 0 `master.ts` consumption exactly.

### 5.1 Call sequence

```
POST {TTS_BASE_URL}/v1/text-to-speech/{voice_id}
  headers: x-api-key: ${TTS_API_KEY}
  body:    { text, language, output_format: "mp3", normalize_text: false,
             voice_settings: { stability: 0.5, similarity_boost: 0.75,
                               style: 0.0, speed: 1.0 } }
  ← audio bytes; header X-Audio-Duration (seconds)
  → save generated/<runId>/voice/<sceneId>.mp3

POST {TTS_BASE_URL}/v1/speech-to-text      (multipart: file=<saved mp3>, language,
                                             word_timestamps: true)
  ← segments[].words: [{word, start, end}] seconds float
  → normalize ONCE: startMs/endMs = Math.round(sec * 1000); pipeline uses ms only
```

### 5.2 Pinned parameters (recorded in artifact metadata, §7.2)

| Parameter | Value |
|---|---|
| `TTS_BASE_URL` | env, default `http://localhost:8080` (production: `https://tts.delyai.site`) |
| `TTS_API_KEY` | env only (`.env`, git-ignored) |
| provider / model | `tts-studio` / `omnivoice` |
| `voiceId` | from brief/config; default first voice of `GET /v1/voices`; recorded |
| output format | `mp3` |
| `voiceSettings` | `stability 0.5, similarityBoost 0.75, style 0, speed 1` |
| `normalizeText` | `false` |
| ASR model | `medium` (`WHISPER_MODEL` default); recorded |
| word timestamps | requested `true`; seconds→integer ms |
| retime padding | `0.5` s (`RETIME_PADDING`, config-overridable; recorded) |

### 5.3 Duration validation (locked)

`X-Audio-Duration` is **not** trusted blindly. The adapter measures the saved MP3
(`ffprobe`, already a Phase 0 dependency) and compares:

- `|headerSeconds − measuredSeconds| > 0.1` ⇒ **hard failure** of the run
  (header is not declared authoritative; measurement method recorded in metadata).
- `endMs = round(measuredSeconds * 1000)`; `duration := measuredSeconds + RETIME_PADDING`.

### 5.4 Reproducibility note

Re-synthesizing the same text is **not** promised byte-identical (GPU/model). The locked
property: rendering a run uses the **saved** `voice/*.mp3`; TTS/ASR are called only when a
stage's artifact is invalid or missing (§7.3).

## 6. Dependencies

### 6.1 DeLyAI2 (this repo)

- No new runtime dependency required for Gemini (REST/`fetch`).
- `dotenv` or `node --env-file=.env` for CLI env loading — exact mechanism chosen in the
  plan after checking the Node version.
- `ffprobe` used for §5.3 validation (already present).

### 6.2 `E:\TTS-ASR-API` (second repo, separate task)

Add one optional request parameter — **nothing else changes:**

```
POST /v1/speech-to-text
  + word_timestamps: bool = false        # faster-whisper word_timestamps support
  → segments[].words: [{ word, start, end }]   (seconds, float) when true
```

Client behavior if the deployed server predates this field: response without `words`
while `word_timestamps: true` was requested ⇒ **hard failure** (no silent `words: []`).
This change is committed in the TTS-ASR-API repo's own history.

## 7. Artifacts, manifest, resume

### 7.1 Layout

```
generated/<runId>/              # git-ignored
├── manifest.json               # run state + stage status + tts/asr/retime config + attempt diagnostics
├── brief.json                  # input
├── story.json
├── voice/
│   ├── scene-001.mp3
│   └── …
├── voicetimeline.json
├── master-timeline.json
├── project.dsl.json
├── compiled/
│   ├── scene-001.json
│   └── …
├── render-props.json           # input for remotion --props (compiled + timeline + voice + audio paths)
└── video.mp4
```

`generated/` is git-ignored; no audio, video, or run artifact is ever committed.

### 7.2 Per-artifact header (every JSON artifact)

```json
{ "schemaVersion": "…", "runId": "…", "createdAt": "…", "sourceHash": "…" }
```

### 7.3 sourceHash chain (stale-resume protection)

```
briefHash → story → voice → master-timeline → dsl → compiled → video
```

Each artifact's `sourceHash = hash(canonicalJSON(direct upstream sourceHash + stage
inputs))`, where stage inputs include the **prompt version** (story/visual), TTS/ASR config
block (voice), retime padding (timeline), and engine version (compiled — consistent with
Phase 0 `compiledHash`). If any upstream hash changes, every downstream recomputed hash
differs ⇒ those artifacts are invalid and their stages re-run.

### 7.4 Stage completion = valid artifact, not file-exists

A stage counts as done only if its artifact **parses and validates semantically**:

| Artifact | Validation |
|---|---|
| `story.json` | StoryPlan Zod schema + `sourceHash` chain match |
| `voicetimeline.json` | VoiceTimeline schema + every referenced `voice/*.mp3` exists + chain match |
| `master-timeline.json` | timeline validation (Σ `durationInFrames === totalFrames`, no diagnostics) + chain match |
| `project.dsl.json` | `parseProjectDsl` strict + chain match |
| `compiled/*.json` | IR validation + chain match |
| `video.mp4` | file exists and non-empty |

`--resume <run-id>` (or implicit resume when the runId already exists) executes only the
first invalid/missing stage onward. Token-saving is an explicit test target (§9.2).

### 7.5 Manifest

`manifest.json` holds: runId, createdAt, briefHash, engine version, the §5.2 config block
(`tts`, `asr`, `retime` exactly as approved), and per-stage status with **each attempt's
diagnostics** (for debug/reproduce).

## 8. Orchestrator & entries

**One shared orchestrator (option A):** `src/ai/generate.ts` — the pipeline owner.

- Sits beside `project.ts`; the **only** module allowed to import the compiler remains
  `project.ts`. `generate.ts` composes stages and calls a generalized
  `buildProject(dsl, voice)` in `project.ts` (parse → timeline → compile).
  AGENTS.md's sanctioned exception is **not** widened.
- Stage order and resume logic per §3/§7.4; artifact I/O; progress reporting callback
  (used by both CLI and dev endpoint).

**CLI:**

```
npm run generate:1a -- --brief "…" [--target 30] [--lang vi]
                     [--run-id <id>] [--voice <voiceId>]
```

Prints per-stage progress; on success prints path to `video.mp4`.

**App shell (dev-only):** browser `POST /api/generate {brief…}` → Vite dev-server
middleware runs `generateProject()` **in Node** (browser never runs the pipeline — no
filesystem, no GPU TTS). Browser polls status, then plays the result with a plain
`<video src="/generated/<runId>/video.mp4">` served by the same middleware. The Phase 0
fixture Player preview stays unchanged. The endpoint is registered only in dev mode and
is out of any production story for 1A.

**Render entry:** `DeLyDemo` composition becomes props-driven (fixture project stays its
default props). CLI renders with
`npx remotion render remotion/index.ts DeLyDemo <out> --props generated/<runId>/render-props.json`.
`render-props.json` carries compiled scenes, timeline, voice, and
`audioSrcBySceneId` as **repo-relative artifact paths**; the render-side adapter resolves
them to absolute paths for `<Audio>`.

## 9. Engine changes & testing

### 9.1 Runtime VoiceTrack (only engine change)

- `ProjectVideo` accepts new optional props `voice` and `audioSrcBySceneId`
  (plain data from composition props; types come from `@/timeline` — allowed for runtime).
- New `VoiceTrack`: for each segment →
  `<Sequence from={sceneWindows[sceneId].startFrame}> <Audio src={absPath}/> </Sequence>`
  (trim/offset per scene-relative `endMs`).
- Runtime consumes `sceneWindows` + `audioSrcBySceneId` + `voice` only — **no retime,
  no duration resolution, no audio fallback** (no business logic in the renderer).
- DSL/IR remain path-free portable JSON; audio paths exist only in props/artifacts.

### 9.2 Unit tests (always run; network mocked)

- Retry: 3 attempts per stage, stage-local, attempt diagnostics recorded; failure of
  Visual after 3 ⇒ run error; **Story/TTS call counts unchanged** across a Visual retry.
- **Resume token-saving** (explicit target):
  `run #1: Story=1, TTS=2 scenes, Visual fails` → `resume: Story=0, TTS=0, Visual retries`.
- Retime math; word seconds→ms normalization; `X-Audio-Duration` mismatch (>100 ms ⇒ fail).
- sourceHash chain: mutating upstream invalidates exactly the downstream set.
- Resume = semantic validation (corrupt-but-existing file is *not* "done").

### 9.3 Integration tests (env-gated — skip without credentials)

Short brief, ~10 s / 2 scenes; assert:

- MP4: h264 + aac; duration ≈ Σ scene durations.
- 0 `VOICE_OVERRUNS_SCENE` (and 0 `VOICE_UNKNOWN_SCENE`, 0 `VOICE_ESTIMATED_TIMING`).
- **rendered scene count == master timeline scene count**;
  **audio segment count == voice timeline segment count**; every `sceneId` maps exactly once.
- `--resume` on the completed run issues **zero** Gemini/TTS/ASR HTTP calls (asserted via
  a counting transport wrapper).

### 9.4 Visual Director timing lock

Visual output is validated not only by Zod but by the compiler against the **locked**
timeline (`DURATION_MISMATCH` etc.). There is no code path by which visual output can
alter `sceneWindows`.

### 9.5 Gate

Same as Phase 0: `tsc --noEmit`, `vitest run`, `eslint .`, `vite build`,
`remotion bundle`, `remotion versions` — all exit 0. Integration suite may be absent from
the default gate if credentials are missing (clean skip, never red).

## 10. Reproducibility contract (two tiers)

```
AI generation          (non-deterministic — Gemini, TTS)
    ↓ artifacts        (story, audio, voicetimeline, master-timeline, dsl, compiled, config)
Deterministic compiler (Phase 0 contract: same DSL ⇒ same compiledHash)
Deterministic engine   (seeded, no Math.random, call-stream/structural ladder)
    ↓ render
video.mp4
```

**Locked statement:** *given a run whose upstream artifacts are valid, `--resume <run-id>`
does not call Gemini/TTS/ASR; it only performs the missing downstream stages — and a
completed run re-renders purely from its artifacts.* This is engine/render-contract
reproducibility, **not** a claim that re-running AI generation reproduces the same DSL.

## 11. Layer compliance

| Module | Layer | May import |
|---|---|---|
| `src/ai/gemini/**` | ai | `shared`, `schema` (types), `timeline` (types) |
| `src/ai/tts/remote.ts` | ai | `shared`, `timeline` (VoiceTimeline type) |
| `src/ai/generate.ts` | ai | sibling ai modules, `project.ts`, `timeline` |
| `src/ai/project.ts` | ai | compiler, IR, timeline (unchanged — sole exception) |
| runtime `VoiceTrack` | runtime | `ir`, `registry`, `timeline`, `remotion`, `react` |
| vite dev middleware | build config | node APIs; registers only in dev |

No new forbidden edge; AGENTS.md and `eslint.config.js` stay as-is (the compiler-caller
exception remains exactly `src/ai/project.ts`).

## 12. Risks & trade-offs

- **TTS server availability:** 1A assumes the local/production TTS Studio is up with the
  `word_timestamps` build; runs fail hard otherwise (accepted — no silent degradation).
- **Story lengths vs target duration:** audio sets final duration, so total runtime can
  drift from `brief.targetSeconds`; the story prompt minimizes drift, and the artifact
  records what happened. Accepted for 1A.
- **Player in-app preview** of *generated* runs is an HTML5 `<video>` of the produced MP4,
  not a Remotion Player re-render — chosen deliberately to keep artifacts off the browser.
- **Whisper word timestamps** are alignment estimates labeled `timingSource: 'exact'` at
  segment level; word-level precision is as good as the ASR model (recorded, revisitable).
