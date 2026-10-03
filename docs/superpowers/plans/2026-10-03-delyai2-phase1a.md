# DeLyAI2 Phase 1A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the full architecture end-to-end — one text brief produces `generated/<runId>/video.mp4` with real Gemini direction, real TTS + ASR word timing, real audio in the MP4, resume without upstream API calls, and every Phase 0 gate green.

**Architecture:** Two logical Gemini stages (StoryDirector, VisualDirector; ≤3 attempts each, stage-local DSL→diagnostics→DSL retry) sit between the brief and a locked Master Timeline. TTS + ASR runs *before* the Visual Director: measured audio duration is the timeline authority (`duration := measuredSeconds + 0.5s padding`), so `sceneWindows` are locked before any visual design happens. Every stage writes a JSON artifact carrying `{schemaVersion, runId, createdAt, sourceHash}` into a `briefHash → story → voice → master-timeline → dsl → compiled → render-props → video` hash chain; resume skips a stage only when its artifact passes semantic validation *and* the chain. The render stage copies `voice/*.mp3` into `public/` and spawns `npx remotion render … --props render-props.json` (Remotion intentionally rejects absolute filesystem paths — `public/` + `staticFile()` is the only mechanism).

**Tech Stack:** TypeScript 5.6, Node 22.15 (no dotenv — `node --env-file-if-exists` / `process.loadEnvFile` / Vite `loadEnv`), Remotion 4.0.191 (pinned family), Zod 3.22.3, Vitest 2.1.4, ESLint 9, Gemini REST via `fetch` (no SDK), self-hosted TTS Studio (`E:\TTS-ASR-API`), ffprobe, `tsx` (devDep — the only new package). Package manager: **npm**.

**Spec:** `docs/superpowers/specs/2026-10-03-delyai2-phase1a-design.md` (approved 2026-10-03; this plan argues from it — conflicts resolve against it).

## Global Constraints

Every task's requirements implicitly include this section.

- **Pipeline order is a hard contract (spec §3):** Brief → ① StoryDirector → ② TTS+ASR (one call per scene) → ③ retime → ④ buildMasterTimeline → ⑤ VisualDirector (locked windows) → ⑥ compileScene×N + render-props → ⑦ render. TTS runs before the Visual Director. `StoryPlan.durationSeconds` is an estimate only; final scene duration comes from audio + padding.
- **Two logical Gemini stages, ≤3 attempts each, stage-local (spec §2, §4).** Attempt fails on Zod parse error or compile diagnostics; retry message carries previous output + diagnostics; attempt 3 fails ⇒ run fails with full diagnostics recorded in the manifest. Visual never re-calls Story/TTS; Story never re-asks the Brief.
- **Zod is the authority; `responseSchema` steers only.** Model output is never trusted before `parseProjectDsl` / `parseSceneDsl` / StoryPlan Zod validation.
- **TTS pinned params (spec §5.2):** `TTS_BASE_URL` env default `http://localhost:8080`; `model_id: "omnivoice"`; `voice_settings {stability 0.5, similarity_boost 0.75, style 0.0, speed 1.0}`; `output_format: "mp3"`; `normalize_text: false`; default voice = first entry of `GET /v1/voices`; ASR model recorded as `WHISPER_MODEL` env default `medium`; `word_timestamps: true`; retime padding `0.5` s.
- **Duration validation (spec §5.3):** `|X-Audio-Duration − ffprobeMeasured| > 0.1` ⇒ hard failure of the run; `endMs = Math.round(measuredSeconds * 1000)` once; TTS or ASR failure is a hard failure — **no estimated fallback, no silent `words: []`**.
- **sourceHash chain (spec §7.3):** `briefHash → story → voice → master-timeline → dsl → compiled → render-props → video`. Video staleness = manifest `render.sourceHash === render-props.json` `sourceHash` — **`video.mp4` bytes are never hashed**.
- **Stage completion = semantic validation + chain match, not file-exists (spec §7.4).** A corrupt-but-existing file is *not* done. Resume of a fully valid run issues **0** Gemini/TTS/ASR HTTP calls.
- **`timingSource` enum stays `'exact' | 'estimated' | 'fixture'` unchanged** (segment/audio duration authority). Word provenance is the separate field `wordTimingSource?: 'whisper'` on `VoiceSegment`; fixture/estimated segments have empty `words` and omit the field.
- **Secrets:** `GEMINI_API_KEY`, `TTS_API_KEY` and any key live in `.env` only (git-ignored). API keys never appear in any committed file — spec, plan, prompts, code, tests, fixtures, examples. `.env.example` may name keys but its values stay empty. `generated/`, `public/generated/` are git-ignored; no audio, video, or run artifact is ever committed.
- **Layer rules (AGENTS.md, binding):** only `src/ai/project.ts` may import the compiler — everything else reaches it through `buildProject` / `diagnoseScenes`; `generate.ts` composes stages and never imports compiler/IR/runtime; runtime renders IR with no retime/duration/fallback logic; recipes never import `app/**`; no `Math.random()` in `src/video-engine/**`; `registerBackends()` is called only by entries outside `src/ai/**` (CLI script, Vite middleware, tests, Remotion entry).
- **Remotion mechanics:** absolute filesystem audio paths are intentionally unsupported — copy `generated/<runId>/voice/` → `public/generated/<runId>/voice/` before spawning render; the render-side resolver is `staticFile()`; composition metadata is props-driven via `calculateMetadata`; `Audio` comes from `'remotion'` (not `@remotion/media`).
- **Env loading:** CLI = `node --env-file-if-exists=.env`; Vitest = `tests/setup-env.ts` calling `process.loadEnvFile`; Vite = `loadEnv(mode, cwd, '')`. No `dotenv` dependency.
- **Gemini transport:** REST `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`, header `x-goog-api-key`, body `generationConfig: {responseMimeType: "application/json", responseSchema}`; default model `gemini-3.8-flash` (overridable via `GEMINI_MODEL`); **no** temperature/top_p/top_k (Gemini 3 rejects them).
- **runId must match `/^[\w-]+$/`** — it is interpolated into filesystem paths and the render spawn command.
- **Integration tests skip clean (never red) when `GEMINI_API_KEY` / `TTS_API_KEY` are absent.** Unit tests always run without credentials.
- **"Build pass" = `tsc --noEmit` + `vitest run` + `eslint .` + `vite build` + `remotion bundle remotion/index.ts` + `remotion versions`** — all exit 0.
- **1 task = 1 commit;** each commit runs typecheck + unit tests first. Commit messages: `Task N — <deliverable>` + the `Co-Authored-By: Claude Code <noreply@anthropic.com>` footer.

## Review Focus

Input classes / failure modes the spec implies but that no single happy-path test covers. Each gets a dedicated test in the task that owns the code (called out inline).

1. **Audio silently missing from the MP4** — a run can "succeed" while `public/generated/` was never populated or `VoiceTrack` never mounted. Owner: Task 11 (copy-before-exec unit test) + Task 14 (integration asserts an `aac` stream exists with duration > 0).
2. **Corrupt-but-existing artifact treated as "done"** — a truncated `story.json` or zero-byte `voicetimeline.json` must fail semantic validation and re-run the stage (spec §7.4), never resume past it. Owner: Task 8 (corrupt-file validators) + Task 9 (resume call-count with a poisoned artifact).
3. **Visual retry leaking upstream calls** — after Visual fails 3 attempts, Story/TTS call counts must be unchanged (spec §9.2). Owner: Task 9 (counting adapters across a failing visual stage).
4. **Strict-overrun at retime rounding edges** — `pad = 0`, odd `endMs` values, and 29.97 fps must still yield `msToFrames(endMs) ≤ durationInFrames` with zero `VOICE_OVERRUNS_SCENE` (spec §3 construction claim). Owner: Task 6 (retime edge test at fps 30 *and* 29.97).
5. **API-key leakage into the repo** — `.env` must be git-ignored, no tracked file may contain `.env`/`generated/` paths, and every test/fixture uses fake keys (`'test-key'`), never the real value. Owner: Task 2 (`tests/security/env-ignored.test.ts`); reviewers of Tasks 3–13 re-check prompts/fixtures.
6. **Stale video surviving an upstream change** — a non-empty `video.mp4` whose manifest `render.sourceHash` ≠ current `render-props.json` `sourceHash` must re-render (spec §9.2). Owner: Task 8 (validator) + Task 11 (injected-render resume test).

## File map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `E:\TTS-ASR-API\app\routers\v1_asr.py`, `app/services/asr.py` | `word_timestamps` Form pass-through (spec §6.2) |
| Create | `E:\TTS-ASR-API\.gitignore` + git init | Baseline history so the change lands in its own repo |
| Modify | `.gitignore`, `vitest.config.ts`, `package.json` | Ignore `.env`/`generated/`; `tsx` devDep; setupFiles |
| Create | `.env.example`, `tests/setup-env.ts`, `tests/security/env-ignored.test.ts` | Env plumbing + secret-leak guard |
| Create | `src/ai/tts/remote.ts` | Pure HTTP TTS+ASR adapter (ffprobe validation) |
| Modify | `src/timeline/voice.ts` | `wordTimingSource?: 'whisper'` |
| Create | `src/ai/gemini/client.ts`, `src/ai/gemini/retry.ts` | Gemini REST → generic JSON; bounded retry (3) |
| Create | `src/ai/story/schema.ts`, `src/ai/gemini/prompts/story.ts`, `src/ai/gemini/story-director.ts` | StoryDirector |
| Create | `src/ai/retime.ts` | `duration := endMs/1000 + padding` |
| Modify | `src/ai/project.ts` | `buildProject({dsl, voice})` + `diagnoseScenes` (sole compiler caller) |
| Create | `src/ai/visual/style-presets.ts`, `src/ai/gemini/prompts/visual.ts`, `src/ai/gemini/visual-director.ts` | VisualDirector (locked windows + injected diagnose) |
| Modify | `src/ai/visual/contract.ts` | `sceneWindows`, `fps`, `onAttempt` |
| Create | `src/ai/artifacts.ts` | Headers, hash chain, manifest, all stage validators |
| Create | `src/ai/generate.ts` | Orchestrator: stages, resume, progress, call counts |
| Create | `src/ai/render.ts` | public/ copy → spawn Remotion → verify → manifest.render |
| Create | `src/video-engine/runtime/VoiceTrack.tsx` | `<Sequence><Audio/></Sequence>` per segment |
| Modify | `src/video-engine/runtime/ProjectVideo.tsx`, `runtime/index.ts` | `voice`, `audioSrcBySceneId`, `resolveAudioSrc` passthrough |
| Modify | `remotion/Root.tsx`, `remotion/DemoComposition.tsx` | defaultProps + `calculateMetadata`; `staticFile` resolver |
| Create | `scripts/generate-1a.ts`, `src/ai/cli-args.ts` | CLI entry (registers backends) + arg parsing |
| Modify | `vite.config.ts` | Dev-only `/api/generate` middleware via `ssrLoadModule` |
| Create | `src/app/GeneratePanel.tsx` | Dev-only browser trigger + `<video>` result |
| Create | `tests/integration/generate-e2e.test.ts` | Env-gated end-to-end + resume-zero-calls |

## Task Index

| # | Task | Deliverable | Proving test |
|---|---|---|---|
| 1 | TTS-ASR-API `word_timestamps` contract (+ git init ruling) | ASR endpoint accepts and returns word timings | Manual curl (repo has no test harness); client contract proven in Task 3, live shape in Task 14 |
| 2 | Env/tooling foundation | `.env` flow, `tsx`, gitignore, security test | `tests/security/env-ignored.test.ts` |
| 3 | TTS remote adapter + `wordTimingSource` | `createRemoteTtsAdapter` with ffprobe hard-fails | `tests/ai/tts-remote.test.ts` |
| 4 | Gemini client + bounded retry | `geminiGenerateJson`, `withBoundedRetry` | `tests/ai/gemini-client.test.ts`, `tests/ai/retry.test.ts` |
| 5 | StoryDirector | Zod schema + prompt + retrying director | `tests/ai/story-director.test.ts` |
| 6 | Retime + project plumbing | `retimeScenes`, `buildProject`, `diagnoseScenes` | `tests/ai/retime.test.ts`, `tests/ai/project.test.ts` |
| 7 | VisualDirector | Locked-windows prompt + injected diagnose retry | `tests/ai/visual-director.test.ts` |
| 8 | Artifacts / hash chain / validators | `artifacts.ts` chain + manifest + resume validators | `tests/ai/artifacts.test.ts` |
| 9 | Orchestrator | `generateProject` through render-props + resume | `tests/ai/generate.test.ts` |
| 10 | Runtime VoiceTrack + props-driven composition | Audio in the composition tree | `tests/runtime/voice-track.test.ts`, updated `tests/demo/composition.test.ts` |
| 11 | Render stage | public copy → spawn → ffprobe → manifest.render | `tests/ai/render.test.ts` + generate stale test |
| 12 | CLI | `npm run generate:1a` | `tests/ai/cli-args.test.ts` + manual smoke |
| 13 | Dev endpoint + panel | `POST /api/generate` middleware + GeneratePanel | tsc/build green + manual curl flow |
| 14 | Integration + gates | Env-gated e2e + full gate battery | `tests/integration/generate-e2e.test.ts` |

---

### Task 1: TTS-ASR-API — `word_timestamps` contract

**Scope ruling (surface at handoff):** `E:\TTS-ASR-API` is **not a git repository**, yet spec §6.2 says the change "is committed in the TTS-ASR-API repo's own history." This task therefore (a) adds the parameter and (b) initializes git with a baseline commit *before* the feature commit. A secret scan was run during planning: the TTS API key appears **only** in `E:\TTS-ASR-API\.env` — so `.gitignore` must exclude `.env` before the first `git add`. Spec §2 forbids any other change to that repo.

**Files:**
- Modify: `E:\TTS-ASR-API\app\routers\v1_asr.py`
- Modify: `E:\TTS-ASR-API\app\services\asr.py`
- Create: `E:\TTS-ASR-API\.gitignore`
- Test: none automated (no test harness exists; adding pytest would violate the §6.2 scope lock) — proving runs are the manual curl below plus the client-side tests in Task 3 and the live integration in Task 14.

**Interfaces:**
- Produces: `POST /v1/speech-to-text` accepts `word_timestamps: bool = Form(False)`; when `true`, each entry of `segments` carries `words: [{ word, start, end }]` (seconds, float — openai-whisper's `word_timestamps` output shape; the spec's "faster-whisper" wording describes the same contract, the deployed server uses openai-whisper, verified in `app/services/asr.py`).

- [ ] **Step 1: Add the service parameter**

In `app/services/asr.py`, change the signature and options block:

```python
def transcribe_bytes(
    audio_bytes: bytes,
    language: Optional[str] = None,
    task: str = "transcribe",
    word_timestamps: bool = False,
) -> dict:
    ...
        options = {"task": task, "verbose": False, "word_timestamps": word_timestamps}
        if language:
            options["language"] = language
```

The return dict is unchanged: `result.get("segments", [])` already carries `words` when whisper ran with `word_timestamps=True`.

- [ ] **Step 2: Add the route parameter**

In `app/routers/v1_asr.py`:

```python
@router.post("")
async def speech_to_text(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    task: str = Form("transcribe", pattern=r"^(transcribe|translate)$"),
    word_timestamps: bool = Form(False),
):
    """Speech-to-text with Whisper (ElevenLabs /v1/speech-to-text style)."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")
    try:
        return asr_service.transcribe_bytes(
            audio_bytes, language=language, task=task, word_timestamps=word_timestamps
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 3: Create `.gitignore` (must precede any `git add`)**

```gitignore
.env
venv/
__pycache__/
*.pyc
logs/
*.log
server_out.log
server_err.log
```

- [ ] **Step 4: Verify no secret is tracked**

Run:
```bash
cd "E:/TTS-ASR-API"
KEY="$(grep -m1 '^TTS_API_KEY=' .env | cut -d= -f2- | tr -d '\r')"
[ -n "$KEY" ] || { echo "STOP: TTS_API_KEY not readable from .env"; exit 1; }
grep -rlnF --exclude-dir=venv --exclude-dir=__pycache__ --exclude-dir=.git --exclude=.env "$KEY" . && echo "FAIL: secret found outside .env" || echo "CLEAN"
```
Expected: exactly `CLEAN`. The scan derives the key from `.env` at runtime — the literal never appears in this plan or any committed file — and excludes `.env` itself (any other file containing the key is a leak). Output other than `CLEAN` — **stop and ask** (security-sensitive).

- [ ] **Step 5: git init + baseline commit, then feature commit**

```bash
cd "E:/TTS-ASR-API"
git init
git add -A
git status --porcelain | grep -E "^A.*\.env$" && echo "FAIL: .env staged" || echo "OK: .env not staged"
git commit -m "Baseline: TTS-ASR-API as received before word_timestamps

Co-Authored-By: Claude Code <noreply@anthropic.com>"
git add app/routers/v1_asr.py app/services/asr.py
git commit -m "feat(asr): word_timestamps parameter for speech-to-text

POST /v1/speech-to-text accepts word_timestamps: bool = false and passes it
to whisper; when true, segments[].words carries {word, start, end} seconds.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```
Expected: baseline commit does not contain `.env`; feature commit touches exactly two files.

- [ ] **Step 6: Manual contract verification (restart the server first)**

The running server predates the change — restart it (`start_api.ps1`). Then:

```bash
curl -s -X POST http://localhost:8080/v1/speech-to-text \
  -H "x-api-key: $(grep TTS_API_KEY E:/TTS-ASR-API/.env | cut -d= -f2)" \
  -F "file=@E:/TTS-ASR-API/speech_ref.wav" -F "language=vi" -F "task=transcribe" -F "word_timestamps=true"
```
Expected JSON: `segments[]` each containing a non-empty `words: [{word, start, end}]`.
Re-run without `word_timestamps`: expected `segments[]` **without** `words` (default stays `false` — backward compatible).

- [ ] **Step 7: Commit**

One DelyAI2-side commit is **not** needed (no file in `E:\DelyAI2` changed). Record in the ledger: `Task 1 — TTS-ASR-API word_timestamps committed (E:\TTS-ASR-API, 2 commits)`.

---

### Task 2: Env/tooling foundation

**Files:**
- Modify: `.gitignore`
- Modify: `package.json` (devDep `tsx` only)
- Modify: `vitest.config.ts` (setupFiles)
- Create: `.env.example`
- Create: `tests/setup-env.ts`
- Test: `tests/security/env-ignored.test.ts`

**Interfaces:**
- Consumes: Node 22.15 `process.loadEnvFile`, git.
- Produces: process env available in every unit/integration test; `tsx` importable for Task 12; `.env` guaranteed ignored.

- [ ] **Step 1: Write the failing security test**

```ts
// tests/security/env-ignored.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const repoRoot = process.cwd()

describe('secret and artifact hygiene', () => {
  it('.gitignore covers .env, generated/, public/generated/', () => {
    const ig = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8')
    for (const entry of ['.env', 'generated/', 'public/generated/']) {
      expect(ig).toContain(entry)
    }
  })

  it('git agrees the sensitive paths are ignored', () => {
    for (const p of ['.env', 'generated/run-x/video.mp4', 'public/generated/run-x/voice/scene-001.mp3']) {
      const out = execFileSync('git', ['check-ignore', '-q', p], { cwd: repoRoot })
      expect(out).toBeUndefined() // check-ignore exits 0 only when ignored
    }
  })

  it('no .env or generated artifact is tracked', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    expect(tracked).not.toMatch(/(^|\/)\.env$/m)
    expect(tracked).not.toMatch(/^generated\//m)
    expect(tracked).not.toMatch(/^public\/generated\//m)
  })

  it('.env.example names keys but carries no values', () => {
    const example = fs.readFileSync(path.join(repoRoot, '.env.example'), 'utf8')
    for (const line of example.split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))) {
      expect(line.split('=').slice(1).join('=')).toBe('')
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/security/env-ignored.test.ts`
Expected: FAIL — `.env` not yet in `.gitignore`, `.env.example` missing.

- [ ] **Step 3: Implement**

`.gitignore` — append:

```gitignore
.env
generated/
public/generated/
.superpowers/
```

`.env.example` (values stay empty — keys are named, never valued):

```env
GEMINI_API_KEY=
GEMINI_MODEL=
TTS_API_KEY=
TTS_BASE_URL=http://localhost:8080
TTS_VOICE=
```

`tests/setup-env.ts`:

```ts
// Loads .env for tests when present; absent file must never fail the suite.
try {
  process.loadEnvFile(process.cwd() + '/.env')
} catch {
  // no .env in this environment — credentials-gated tests will skip
}
```

`vitest.config.ts` — add to `test`:

```ts
setupFiles: ['tests/setup-env.ts'],
```

Install the one new dependency:

```bash
npm install --save-dev tsx
```

- [ ] **Step 4: Run test + gates**

Run: `npx vitest run tests/security/env-ignored.test.ts && npx tsc --noEmit && npx eslint .`
Expected: PASS, exit 0. (`tsx` appears in `devDependencies` with the exact version npm resolved.)

- [ ] **Step 5: Commit**

```bash
git add .gitignore .env.example vitest.config.ts tests/setup-env.ts tests/security/env-ignored.test.ts package.json package-lock.json
git commit -m "Task 2 — env/tooling foundation: .env flow, tsx, secret-leak guard

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: TTS remote adapter + `wordTimingSource`

**Files:**
- Modify: `src/timeline/voice.ts`
- Create: `src/ai/tts/remote.ts`
- Test: `tests/ai/tts-remote.test.ts`

**Interfaces:**
- Consumes: `TtsAdapter`/`TtsInput` (`src/ai/tts/contract.ts`), `VoiceTimeline`/`VoiceSegment`/`TimingSource` (`src/timeline/voice.ts`), Task 1's ASR contract, shared `sha256Hex` not needed here.
- Produces:
  ```ts
  // src/timeline/voice.ts — VoiceSegment gains ONE optional field (spec §9.1):
  wordTimingSource?: 'whisper'
  // src/ai/tts/remote.ts
  export type RemoteTtsOptions = {
    baseUrl: string          // e.g. http://localhost:8080
    apiKey: string           // from env; never logged, never in files
    voiceId: string          // resolved by the orchestrator (Task 9)
    outDir: string           // absolute path to generated/<runId>/voice
    fetchImpl?: typeof fetch // injection seam for tests
    measureDuration?: (filePath: string) => Promise<number> // default: ffprobe
    wordTimestamps?: boolean // default true (spec §5.1)
  }
  export function createRemoteTtsAdapter(options: RemoteTtsOptions): TtsAdapter
  ```
  `synthesize` returns one scene-relative segment: `{startMs: 0, endMs: round(measured*1000), timingSource: 'exact', wordTimingSource: 'whisper', words: [...], sceneId}`; timeline `timingSource: 'exact'`, `totalMs: endMs`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/ai/tts-remote.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRemoteTtsAdapter } from '@/ai/tts/remote'
import { buildFixtureProject } from '@/ai/project'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'

let outDir: string
beforeEach(() => {
  clearRegistered(); registerBackends()
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delyai-tts-'))
})
afterEach(() => fs.rmSync(outDir, { recursive: true, force: true }))

const MP3_BYTES = Buffer.from('ID3fake-mp3-bytes')
const ASR_OK = {
  text: 'xin chào',
  language: 'vi',
  duration: 1.0,
  segments: [{ start: 0, end: 1.0, words: [{ word: 'xin', start: 0.0, end: 0.4 }, { word: 'chào', start: 0.4, end: 0.95 }] }],
}

function makeFetch(routes: { tts?: () => Response; asr?: () => Response }) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/v1/text-to-speech/')) return routes.tts?.() ?? new Response(MP3_BYTES, { headers: { 'X-Audio-Duration': '1.00' } })
    if (url.includes('/v1/speech-to-text')) return routes.asr?.() ?? Response.json(ASR_OK)
    throw new Error(`unexpected fetch ${url}`)
  })
}

const base = { baseUrl: 'http://tts.test', apiKey: 'test-key', voiceId: 'v1' } as const

describe('createRemoteTtsAdapter', () => {
  it('synthesizes, validates duration, and normalizes words to ms with provenance', async () => {
    const fetchImpl = makeFetch({})
    const measure = vi.fn(async () => 1.0) // ffprobe: 1.00s, |1.00 − 1.00| ≤ 0.1
    const adapter = createRemoteTtsAdapter({ ...base, outDir, fetchImpl, measureDuration: measure })

    const timeline = await adapter.synthesize({ text: 'xin chào', language: 'vi', voice: 'v1', sceneId: 'scene-001' })

    expect(fs.existsSync(path.join(outDir, 'scene-001.mp3'))).toBe(true)
    expect(timeline.timingSource).toBe('exact')
    const seg = timeline.segments[0]!
    expect(seg).toMatchObject({
      id: 'scene-001-voice', sceneId: 'scene-001', startMs: 0, endMs: 1000,
      timingSource: 'exact', wordTimingSource: 'whisper',
      words: [{ word: 'xin', startMs: 0, endMs: 400 }, { word: 'chào', startMs: 400, endMs: 950 }],
    })
    // pinned TTS request body (spec §5.2)
    const ttsCall = fetchImpl.mock.calls[0]!
    const body = JSON.parse(String(ttsCall[1]!.body))
    expect(body).toMatchObject({
      text: 'xin chào', language: 'vi', model_id: 'omnivoice', output_format: 'mp3',
      normalize_text: false, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, speed: 1.0 },
    })
    expect((ttsCall[1]!.headers as Record<string, string>)['x-api-key']).toBe('test-key')
    // ASR asks for words (multipart field)
    const asrCall = fetchImpl.mock.calls[1]!
    const form = asrCall[1]!.body as FormData
    expect(form.get('word_timestamps')).toBe('true')
    expect(form.get('language')).toBe('vi')
  })

  it('hard-fails when |X-Audio-Duration − measured| > 0.1 (spec §5.3)', async () => {
    const fetchImpl = makeFetch({ tts: () => new Response(MP3_BYTES, { headers: { 'X-Audio-Duration': '2.50' } }) })
    const adapter = createRemoteTtsAdapter({ ...base, outDir, fetchImpl, measureDuration: async () => 1.0 })
    await expect(adapter.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' }))
      .rejects.toThrow(/TTS_DURATION_MISMATCH/)
  })

  it('accepts a header/measure delta ≤ 0.1', async () => {
    const fetchImpl = makeFetch({ tts: () => new Response(MP3_BYTES, { headers: { 'X-Audio-Duration': '1.05' } }) })
    const adapter = createRemoteTtsAdapter({ ...base, outDir, fetchImpl, measureDuration: async () => 1.10 })
    const tl = await adapter.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' })
    expect(tl.segments[0]!.endMs).toBe(1100) // measured wins, once, rounded once
  })

  it('hard-fails when word_timestamps=true but words are absent (spec §6.2)', async () => {
    const asr = { ...ASR_OK, segments: [{ start: 0, end: 1.0 }] } // no words key
    const fetchImpl = makeFetch({ asr: () => Response.json(asr) })
    const adapter = createRemoteTtsAdapter({ ...base, outDir, fetchImpl, measureDuration: async () => 1.0 })
    await expect(adapter.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' }))
      .rejects.toThrow(/ASR_MISSING_WORDS/)
  })

  it('hard-fails on empty words array too', async () => {
    const asr = { ...ASR_OK, segments: [{ start: 0, end: 1.0, words: [] }] }
    const fetchImpl = makeFetch({ asr: () => Response.json(asr) })
    const adapter = createRemoteTtsAdapter({ ...base, outDir, fetchImpl, measureDuration: async () => 1.0 })
    await expect(adapter.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' }))
      .rejects.toThrow(/ASR_MISSING_WORDS/)
  })

  it('hard-fails on non-2xx TTS and non-2xx ASR (no fallback)', async () => {
    const failTts = makeFetch({ tts: () => new Response('boom', { status: 500 }) })
    const a1 = createRemoteTtsAdapter({ ...base, outDir, fetchImpl: failTts, measureDuration: async () => 1 })
    await expect(a1.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' })).rejects.toThrow(/TTS_HTTP_/)

    const failAsr = makeFetch({ asr: () => new Response('bad', { status: 400 }) })
    const a2 = createRemoteTtsAdapter({ ...base, outDir, fetchImpl: failAsr, measureDuration: async () => 1 })
    await expect(a2.synthesize({ text: 'x', language: 'vi', voice: 'v1', sceneId: 's1' })).rejects.toThrow(/ASR_HTTP_/)
  })

  it('default measureDuration uses real ffprobe on a synthesized WAV', async () => {
    // 1.0s, 8kHz, mono, 16-bit PCM — generated at runtime, never committed
    const sr = 8000, data = Buffer.alloc(sr * 2)
    const wav = Buffer.concat([
      Buffer.from('RIFF'), Buffer.from(new Uint32Array([36 + data.length]).buffer, 'little'),
      Buffer.from('WAVEfmt '), Buffer.from(new Uint32Array([16]).buffer, 'little'),
      Buffer.from(new Uint16Array([1, 1, sr, sr * 2, 2, 16]).buffer, 'little'),
      Buffer.from('data'), Buffer.from(new Uint32Array([data.length]).buffer, 'little'), data,
    ])
    const file = path.join(outDir, 'tone.wav')
    fs.writeFileSync(file, wav)
    const { measureAudioDuration } = await import('@/ai/tts/remote')
    await expect(measureAudioDuration(file)).resolves.toBeCloseTo(1.0, 1)
  })
})

describe('fixture tts omits word provenance', () => {
  it('fixture segments carry empty words and NO wordTimingSource key', async () => {
    const { createFixtureTtsAdapter } = await import('@/ai/tts/fixture')
    const tl = await createFixtureTtsAdapter().synthesize({ text: 'một hai ba', language: 'vi', voice: 'f', sceneId: 's1' })
    const seg = tl.segments[0]!
    expect(seg.words).toEqual([])
    expect('wordTimingSource' in seg).toBe(false)
    expect(seg.timingSource).toBe('fixture')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ai/tts-remote.test.ts`
Expected: FAIL — `measureAudioDuration`/`createRemoteTtsAdapter` not exported; `wordTimingSource` not on type (type errors surface under `tsc`, runtime under vitest).

- [ ] **Step 3: Implement the timeline field**

`src/timeline/voice.ts` — extend `VoiceSegment`:

```ts
export type VoiceSegment = {
  id: string
  text: string
  startMs: number
  endMs: number
  /** Empty when timingSource is "estimated" — estimated timing is never exact. */
  words: WordTiming[]
  timingSource: TimingSource
  /** Explicit mapping to a scene — never inferred from a duration ratio. */
  sceneId: string
  /** Provenance for `words` only: Whisper timestamps are ASR-derived estimates.
   *  Absent when `words` is empty (fixture/estimated) — the two semantics never share a label. */
  wordTimingSource?: 'whisper'
}
```

- [ ] **Step 4: Implement `src/ai/tts/remote.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { VoiceTimeline, WordTiming } from '@/timeline/voice'
import type { TtsAdapter } from './contract'

const execFileAsync = promisify(execFile)

export type RemoteTtsOptions = {
  baseUrl: string
  apiKey: string
  voiceId: string
  outDir: string
  fetchImpl?: typeof fetch
  measureDuration?: (filePath: string) => Promise<number>
  wordTimestamps?: boolean
}

/** ffprobe duration of the saved file — the timeline authority (spec §5.3). */
export async function measureAudioDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath,
  ])
  const parsed = JSON.parse(stdout) as { format?: { duration?: string } }
  const seconds = Number(parsed.format?.duration)
  if (!Number.isFinite(seconds)) throw new Error(`FFPROBE_NO_DURATION: ${filePath}`)
  return seconds
}

type AsrWord = { word: string; start: number; end: number }
type AsrSegment = { words?: AsrWord[] }

export function createRemoteTtsAdapter(options: RemoteTtsOptions): TtsAdapter {
  const fetchImpl = options.fetchImpl ?? fetch
  const measure = options.measureDuration ?? measureAudioDuration
  const wantWords = options.wordTimestamps ?? true

  return {
    async synthesize(input) {
      // 1) TTS — pinned body (spec §5.2), header X-Audio-Duration
      const ttsUrl = `${options.baseUrl}/v1/text-to-speech/${options.voiceId}`
      const ttsRes = await fetchImpl(ttsUrl, {
        method: 'POST',
        headers: { 'x-api-key': options.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          text: input.text,
          language: input.language,
          model_id: 'omnivoice',
          output_format: 'mp3',
          normalize_text: false,
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, speed: 1.0 },
        }),
      })
      if (!ttsRes.ok) throw new Error(`TTS_HTTP_${ttsRes.status}: ${ttsUrl}`)
      const headerSeconds = Number(ttsRes.headers.get('x-audio-duration'))
      if (!Number.isFinite(headerSeconds)) throw new Error('TTS_HEADER_MISSING: X-Audio-Duration absent')
      const bytes = Buffer.from(await ttsRes.arrayBuffer())

      // 2) save, then measure — header never trusted alone (spec §5.3)
      fs.mkdirSync(options.outDir, { recursive: true })
      const mp3Path = path.join(options.outDir, `${input.sceneId}.mp3`)
      fs.writeFileSync(mp3Path, bytes)
      const measured = await measure(mp3Path)
      if (Math.abs(headerSeconds - measured) > 0.1) {
        throw new Error(`TTS_DURATION_MISMATCH: header=${headerSeconds.toFixed(3)}s measured=${measured.toFixed(3)}s file=${mp3Path}`)
      }
      const endMs = Math.round(measured * 1000)

      // 3) ASR with word timestamps — absence is a hard failure (spec §6.2)
      const asrUrl = `${options.baseUrl}/v1/speech-to-text`
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' }), `${input.sceneId}.mp3`)
      form.append('language', input.language)
      form.append('task', 'transcribe')
      if (wantWords) form.append('word_timestamps', 'true')
      const asrRes = await fetchImpl(asrUrl, { method: 'POST', headers: { 'x-api-key': options.apiKey }, body: form })
      if (!asrRes.ok) throw new Error(`ASR_HTTP_${asrRes.status}: ${asrUrl}`)
      const asr = (await asrRes.json()) as { segments?: AsrSegment[] }
      const segments = asr.segments ?? []
      const words: WordTiming[] = []
      if (wantWords) {
        if (segments.length === 0) throw new Error('ASR_MISSING_WORDS: no segments returned')
        for (const seg of segments) {
          if (!seg.words || seg.words.length === 0) throw new Error('ASR_MISSING_WORDS: segment lacks words')
          for (const w of seg.words) {
            words.push({ word: w.word.trim(), startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000) })
          }
        }
      }

      return {
        timingSource: 'exact',
        totalMs: endMs,
        segments: [{
          id: `${input.sceneId}-voice`,
          text: input.text,
          startMs: 0,
          endMs,
          words,
          timingSource: 'exact',
          sceneId: input.sceneId,
          ...(words.length > 0 ? { wordTimingSource: 'whisper' as const } : {}),
        }],
      }
    },
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/ai/tts-remote.test.ts && npx tsc --noEmit && npx eslint .`
Expected: PASS / exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/timeline/voice.ts src/ai/tts/remote.ts tests/ai/tts-remote.test.ts
git commit -m "Task 3 — remote TTS+ASR adapter with ffprobe validation and wordTimingSource

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Gemini client + bounded retry

**Files:**
- Create: `src/ai/gemini/client.ts`
- Create: `src/ai/gemini/retry.ts`
- Test: `tests/ai/gemini-client.test.ts`, `tests/ai/retry.test.ts`

**Interfaces:**
- Consumes: global `fetch`, env `GEMINI_API_KEY`/`GEMINI_MODEL`, `Diagnostic` from `@/timeline/diagnostics`.
- Produces:
  ```ts
  // src/ai/gemini/client.ts
  export type GeminiJsonRequest = { prompt: string; responseSchema: Record<string, unknown>; model?: string }
  export type GeminiEnv = { apiKey?: string; model?: string; fetchImpl?: typeof fetch }
  export async function geminiGenerateJson(request: GeminiJsonRequest, env?: GeminiEnv): Promise<unknown>
  // src/ai/gemini/retry.ts
  export type AttemptRecord = { attempt: number; ok: boolean; at: string; diagnostics?: Diagnostic[]; error?: string }
  export class RetryableValidationError extends Error {
    constructor(message: string, readonly diagnostics: Diagnostic[], readonly output?: unknown)
  }
  export class StageRetryExhausted extends Error {
    constructor(readonly stage: string, readonly attempts: AttemptRecord[])
  }
  export type RetryResult<T> = { value: T; attempts: AttemptRecord[] }
  export async function withBoundedRetry<T>(
    runAttempt: (attempt: number, previous: { output: unknown; diagnostics: Diagnostic[] } | null) => Promise<T>,
    options?: { maxAttempts?: number; stage?: string },
  ): Promise<RetryResult<T>>
  ```
  `maxAttempts` defaults to **3** (spec §4 rule 2). Every failure (validation *or* transport) is retried; exhaustion throws `StageRetryExhausted` carrying all attempt records so the orchestrator can write them to the manifest.

- [ ] **Step 1: Write the failing client tests**

```ts
// tests/ai/gemini-client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { geminiGenerateJson } from '@/ai/gemini/client'

const SCHEMA = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false }

describe('geminiGenerateJson', () => {
  it('POSTs v1beta generateContent with x-goog-api-key and JSON schema, parses candidate text', async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      candidates: [{ content: { parts: [{ text: '{"title":"ok"}' }] } }],
    }))
    const out = await geminiGenerateJson(
      { prompt: 'hello', responseSchema: SCHEMA, model: 'gemini-3.8-flash' },
      { apiKey: 'test-key', fetchImpl },
    )
    expect(out).toEqual({ title: 'ok' })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key')
    const body = JSON.parse(String(init!.body))
    expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', responseSchema: SCHEMA })
    expect(JSON.stringify(body)).not.toContain('temperature') // Gemini 3: no sampling knobs
    expect(JSON.stringify(body)).toContain('hello')
  })

  it('defaults model to gemini-3.8-flash and reads GEMINI_MODEL override', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }))
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { apiKey: 'k', fetchImpl })
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('/gemini-3.8-flash:generateContent')
    await geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { apiKey: 'k', model: 'gemini-custom', fetchImpl })
    expect(String(fetchImpl.mock.calls[1]![0])).toContain('/gemini-custom:generateContent')
  })

  it('throws when GEMINI_API_KEY is absent', async () => {
    const prev = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY
    await expect(geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { fetchImpl: vi.fn() }))
      .rejects.toThrow(/GEMINI_API_KEY/)
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev
  })

  it('throws on non-2xx, on empty candidates, and on unparseable text', async () => {
    const key = { apiKey: 'k' }
    const r1 = vi.fn(async () => new Response('quota', { status: 429 }))
    await expect(geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { ...key, fetchImpl: r1 }))
      .rejects.toThrow(/GEMINI_HTTP_429/)
    const r2 = vi.fn(async () => Response.json({ candidates: [] }))
    await expect(geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { ...key, fetchImpl: r2 }))
      .rejects.toThrow(/GEMINI_NO_CANDIDATE/)
    const r3 = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }))
    await expect(geminiGenerateJson({ prompt: 'p', responseSchema: SCHEMA }, { ...key, fetchImpl: r3 }))
      .rejects.toThrow(/GEMINI_BAD_JSON/)
  })
})
```

- [ ] **Step 2: Write the failing retry tests**

```ts
// tests/ai/retry.test.ts
import { describe, it, expect, vi } from 'vitest'
import { withBoundedRetry, RetryableValidationError, StageRetryExhausted } from '@/ai/gemini/retry'

const diag = (m: string) => ({ severity: 'error' as const, code: 'TEST', message: m })

describe('withBoundedRetry', () => {
  it('retries validation failures up to 3 attempts, passing previous output + diagnostics forward', async () => {
    const runAttempt = vi.fn(async (attempt: number, prev: unknown) => {
      if (attempt === 1) throw new RetryableValidationError('bad v1', [diag('first')], { raw: 'v1' })
      if (attempt === 2) throw new RetryableValidationError('bad v2', [diag('second')], { raw: 'v2' })
      expect(prev).toEqual({ output: { raw: 'v2' }, diagnostics: [diag('second')] })
      return 'ok'
    })
    const result = await withBoundedRetry(runAttempt, { stage: 'visual' })
    expect(result.value).toBe('ok')
    expect(result.attempts).toHaveLength(3)
    expect(result.attempts[0]).toMatchObject({ attempt: 1, ok: false })
    expect(result.attempts[0]!.diagnostics).toEqual([diag('first')])
    expect(result.attempts[2]).toMatchObject({ attempt: 3, ok: true })
  })

  it('first-try success records exactly one attempt', async () => {
    const result = await withBoundedRetry(async () => 'fast')
    expect(result.value).toBe('fast')
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0]!.ok).toBe(true)
  })

  it('exhaustion throws StageRetryExhausted carrying every attempt record', async () => {
    const runAttempt = vi.fn(async (attempt: number) => {
      throw new RetryableValidationError(`bad ${attempt}`, [diag(`d${attempt}`)])
    })
    await expect(withBoundedRetry(runAttempt, { stage: 'story' }))
      .rejects.toMatchObject({ name: 'StageRetryExhausted', stage: 'story' })
    try {
      await withBoundedRetry(runAttempt, { stage: 'story' })
    } catch (e) {
      const err = e as StageRetryExhausted
      expect(err.attempts).toHaveLength(3)
      expect(err.attempts.every((a) => a.ok === false)).toBe(true)
      expect(err.attempts[2]!.diagnostics).toEqual([diag('d3')])
    }
  })

  it('transport (non-validation) errors also retry, then exhaust', async () => {
    const runAttempt = vi.fn(async () => { throw new Error('socket hang up') })
    await expect(withBoundedRetry(runAttempt)).rejects.toBeInstanceOf(StageRetryExhausted)
    expect(runAttempt).toHaveBeenCalledTimes(3)
  })

  it('maxAttempts is configurable', async () => {
    const runAttempt = vi.fn(async () => { throw new RetryableValidationError('x', []) })
    await expect(withBoundedRetry(runAttempt, { maxAttempts: 2 })).rejects.toBeInstanceOf(StageRetryExhausted)
    expect(runAttempt).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/ai/gemini-client.test.ts tests/ai/retry.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 4: Implement `src/ai/gemini/client.ts`**

```ts
export type GeminiJsonRequest = { prompt: string; responseSchema: Record<string, unknown>; model?: string }
export type GeminiEnv = { apiKey?: string; model?: string; fetchImpl?: typeof fetch }

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-3.8-flash' // plan-time confirmed; GEMINI_MODEL overrides

export async function geminiGenerateJson(request: GeminiJsonRequest, env: GeminiEnv = {}): Promise<unknown> {
  const apiKey = env.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set (put it in .env — never in code)')
  const model = (env.model ?? process.env.GEMINI_MODEL) || DEFAULT_MODEL
  const fetchImpl = env.fetchImpl ?? fetch

  const res = await fetchImpl(`${API_ROOT}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: request.responseSchema },
    }),
  })
  if (!res.ok) throw new Error(`GEMINI_HTTP_${res.status}: ${(await res.text()).slice(0, 300)}`)

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('GEMINI_NO_CANDIDATE: no text part in candidates[0]')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`GEMINI_BAD_JSON: ${text.slice(0, 200)}`)
  }
}
```

- [ ] **Step 5: Implement `src/ai/gemini/retry.ts`**

```ts
import type { Diagnostic } from '@/timeline/diagnostics'

export type AttemptRecord = { attempt: number; ok: boolean; at: string; diagnostics?: Diagnostic[]; error?: string }

/** A validation failure whose previous output + diagnostics go back to the model (spec §4 rule 2). */
export class RetryableValidationError extends Error {
  constructor(message: string, readonly diagnostics: Diagnostic[], readonly output?: unknown) {
    super(message); this.name = 'RetryableValidationError'
  }
}

export class StageRetryExhausted extends Error {
  constructor(readonly stage: string, readonly attempts: AttemptRecord[]) {
    super(`${stage}: all ${attempts.length} attempts failed — ${attempts.map((a) => a.error ?? 'invalid').join('; ')}`)
    this.name = 'StageRetryExhausted'
  }
}

export type RetryResult<T> = { value: T; attempts: AttemptRecord[] }
export type PreviousAttempt = { output: unknown; diagnostics: Diagnostic[] } | null

export async function withBoundedRetry<T>(
  runAttempt: (attempt: number, previous: PreviousAttempt) => Promise<T>,
  options: { maxAttempts?: number; stage?: string } = {},
): Promise<RetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? 3 // spec §4: 3 per stage per run
  const stage = options.stage ?? 'stage'
  const attempts: AttemptRecord[] = []
  let previous: PreviousAttempt = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await runAttempt(attempt, previous)
      attempts.push({ attempt, ok: true, at: new Date().toISOString() })
      return { value, attempts }
    } catch (err) {
      const isValidation = err instanceof RetryableValidationError
      attempts.push({
        attempt,
        ok: false,
        at: new Date().toISOString(),
        diagnostics: isValidation ? err.diagnostics : undefined,
        error: err instanceof Error ? err.message : String(err),
      })
      previous = isValidation ? { output: err.output ?? null, diagnostics: err.diagnostics } : previous
    }
  }
  throw new StageRetryExhausted(stage, attempts)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/ai/gemini-client.test.ts tests/ai/retry.test.ts && npx tsc --noEmit && npx eslint .`
Expected: PASS / exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/ai/gemini/client.ts src/ai/gemini/retry.ts tests/ai/gemini-client.test.ts tests/ai/retry.test.ts
git commit -m "Task 4 — Gemini REST client and bounded 3-attempt retry helper

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: StoryDirector (Gemini #1)

**Files:**
- Create: `src/ai/story/schema.ts`
- Create: `src/ai/gemini/prompts/story.ts`
- Create: `src/ai/gemini/story-director.ts`
- Modify: `src/ai/story/contract.ts` (optional `onAttempt` param)
- Modify: `src/ai/index.ts` (export the factory)
- Test: `tests/ai/story-director.test.ts`

**Interfaces:**
- Consumes: `geminiGenerateJson` (Task 4), `withBoundedRetry`/`RetryableValidationError` (Task 4), `ScenePurposeSchema` from `@/video-engine/schema` (allowed: schema layer), `Brief`/`StoryPlan`/`StoryDirector` (contract).
- Produces:
  ```ts
  // src/ai/story/schema.ts
  export const StorySceneOutlineSchema: z.ZodType<StorySceneOutline> // .strict()
  export const StoryPlanSchema: z.ZodType<StoryPlan>                // .strict() + unique scene ids
  // src/ai/gemini/prompts/story.ts
  export const STORY_PROMPT_VERSION = 'story-prompt-1'  // part of the voice-independent story sourceHash input
  export function buildStoryPrompt(brief: Brief): string
  export const STORY_RESPONSE_SCHEMA: Record<string, unknown>
  // src/ai/gemini/story-director.ts
  export function createGeminiStoryDirector(deps?: { fetchImpl?: typeof fetch; apiKey?: string; model?: string }): StoryDirector
  // contract.ts — backward-compatible widening; fixtures keep compiling:
  //   direct(brief: Brief, onAttempt?: (record: AttemptRecord) => void): Promise<StoryPlan>
  ```
  Attempt diagnostics use code `STORY_INVALID` (Zod issues joined, one Diagnostic per issue line).

- [ ] **Step 1: Write the failing test**

```ts
// tests/ai/story-director.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createGeminiStoryDirector } from '@/ai/gemini/story-director'
import { STORY_PROMPT_VERSION, STORY_RESPONSE_SCHEMA } from '@/ai/gemini/prompts/story'

const BRIEF = { topic: 'Ba renderer trong một video engine', targetSeconds: 10, language: 'vi' }
const GOOD_PLAN = {
  title: 'Demo',
  scenes: [
    { id: 'scene-001', purpose: 'hook', durationSeconds: 5, title: 'Mở đầu', narration: 'Giới thiệu.' },
    { id: 'scene-002', purpose: 'outro', durationSeconds: 5, title: 'Kết', narration: 'Kết thúc.' },
  ],
}

function geminiReturning(payloads: unknown[]) {
  let i = 0
  return vi.fn(async () => Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payloads[Math.min(i++, payloads.length - 1)]) }] } }],
  }))
}

describe('createGeminiStoryDirector', () => {
  it('validates Gemini output with Zod and returns a StoryPlan; one attempt', async () => {
    const fetchImpl = geminiReturning([GOOD_PLAN])
    const director = createGeminiStoryDirector({ apiKey: 'test-key', fetchImpl })
    const attempts: unknown[] = []
    const plan = await director.direct(BRIEF, (r) => attempts.push(r))
    expect(plan).toEqual(GOOD_PLAN)
    expect(attempts).toEqual([expect.objectContaining({ attempt: 1, ok: true })])
  })

  it('retries on Zod failure and sends previous output + diagnostics back', async () => {
    const BAD = { title: 'x', scenes: [] } // min(1) violated → Zod error
    const fetchImpl = geminiReturning([BAD, GOOD_PLAN])
    const director = createGeminiStoryDirector({ apiKey: 'test-key', fetchImpl })
    const plan = await director.direct(BRIEF)
    expect(plan).toEqual(GOOD_PLAN)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const secondBody = String(fetchImpl.mock.calls[1]![1]!.body)
    expect(secondBody).toContain('STORY_INVALID')           // diagnostics carried back
    expect(secondBody).toContain('"scenes":[]')             // previous output carried back
  })

  it('fails the stage after 3 attempts with every attempt recorded', async () => {
    const fetchImpl = geminiReturning([{ title: '', scenes: [] }])
    const director = createGeminiStoryDirector({ apiKey: 'test-key', fetchImpl })
    await expect(director.direct(BRIEF)).rejects.toMatchObject({ name: 'StageRetryExhausted', stage: 'story' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('duplicate scene ids are a Zod failure (unique-id refine)', async () => {
    const dup = { ...GOOD_PLAN, scenes: [GOOD_PLAN.scenes[0], { ...GOOD_PLAN.scenes[0] }] }
    const fetchImpl = geminiReturning([dup, GOOD_PLAN])
    const director = createGeminiStoryDirector({ apiKey: 'test-key', fetchImpl })
    await director.direct(BRIEF)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('prompt embeds brief + prompt version; responseSchema enumerates every purpose (§4 rule 3)', async () => {
    const fetchImpl = geminiReturning([GOOD_PLAN])
    const director = createGeminiStoryDirector({ apiKey: 'test-key', fetchImpl })
    await director.direct(BRIEF)
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body))
    const prompt: string = body.contents[0].parts[0].text
    expect(prompt).toContain(STORY_PROMPT_VERSION)
    expect(prompt).toContain(BRIEF.topic)
    expect(prompt).toContain(String(BRIEF.targetSeconds))
    expect(prompt).toContain(BRIEF.language)
    const purposes = (STORY_RESPONSE_SCHEMA.properties as { scenes: { items: { properties: { purpose: { enum: string[] } } } } })
      .scenes.items.properties.purpose.enum
    for (const p of ['hook', 'explain_network', 'explain_concept', 'demonstrate', 'compare', 'data_reveal', 'summary', 'outro']) {
      expect(purposes).toContain(p)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai/story-director.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Widen the contract**

`src/ai/story/contract.ts`:

```ts
import type { ScenePurpose } from '@/video-engine/schema'
import type { AttemptRecord } from '@/ai/gemini/retry'

export type Brief = { topic: string; targetSeconds: number; language: string }
export type StorySceneOutline = {
  id: string
  purpose: ScenePurpose
  durationSeconds: number
  title: string
  narration: string
}
export type StoryPlan = { title: string; scenes: StorySceneOutline[] }

/** Plans narrative structure only. Never plans visuals, never emits DSL, never measures frames.
 *  `onAttempt` streams retry records to the orchestrator's manifest (spec §7.5). */
export interface StoryDirector {
  direct(brief: Brief, onAttempt?: (record: AttemptRecord) => void): Promise<StoryPlan>
}
```

(`src/ai/story/fixture.ts`'s `async direct()` implements the interface — a function with fewer parameters is assignable, so the fixture needs no change.)

- [ ] **Step 4: Implement `src/ai/story/schema.ts`**

```ts
import { z } from 'zod'
import { ScenePurposeSchema } from '@/video-engine/schema'

export const StorySceneOutlineSchema = z
  .object({
    id: z.string().min(1),
    purpose: ScenePurposeSchema,
    durationSeconds: z.number().positive().finite(),
    title: z.string().min(1),
    narration: z.string().min(1),
  })
  .strict()

export const StoryPlanSchema = z
  .object({ title: z.string().min(1), scenes: z.array(StorySceneOutlineSchema).min(1) })
  .strict()
  .superRefine((plan, ctx) => {
    const seen = new Set<string>()
    plan.scenes.forEach((scene, i) => {
      if (seen.has(scene.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes', i, 'id'], message: `duplicate scene id "${scene.id}"` })
      }
      seen.add(scene.id)
    })
  })
```

- [ ] **Step 5: Implement `src/ai/gemini/prompts/story.ts`**

```ts
import type { Brief } from '@/ai/story/contract'

export const STORY_PROMPT_VERSION = 'story-prompt-1'

export const STORY_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          purpose: { type: 'string', enum: ['hook', 'explain_network', 'explain_concept', 'demonstrate', 'compare', 'data_reveal', 'summary', 'outro'] },
          durationSeconds: { type: 'number' },
          title: { type: 'string' },
          narration: { type: 'string' },
        },
        required: ['id', 'purpose', 'durationSeconds', 'title', 'narration'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'scenes'],
  additionalProperties: false,
}

export function buildStoryPrompt(brief: Brief): string {
  return [
    `PROMPT_VERSION: ${STORY_PROMPT_VERSION}`,
    'You are the StoryDirector of a video generation pipeline. You plan narrative structure ONLY — no visuals, no layout, no code.',
    `Topic: ${brief.topic}`,
    `Target total duration: ~${brief.targetSeconds} seconds`,
    `Language for ALL narration and titles: ${brief.language}`,
    'Rules:',
    `- Produce 2–8 scenes. Scene durations are ESTIMATES that guide narration length; their sum should approximate ${brief.targetSeconds}s.`,
    '- Each scene id is unique, format "scene-001" (three digits).',
    '- purpose must be exactly one of: hook, explain_network, explain_concept, demonstrate, compare, data_reveal, summary, outro.',
    '- narration is 1–2 spoken sentences a TTS voice will read aloud in the brief language.',
    '- durationSeconds is a positive finite number of seconds.',
    'Return JSON matching the response schema. Nothing else.',
  ].join('\n')
}
```

- [ ] **Step 6: Implement `src/ai/gemini/story-director.ts`**

```ts
import type { Brief, StoryDirector, StoryPlan } from '@/ai/story/contract'
import { StoryPlanSchema } from '@/ai/story/schema'
import { geminiGenerateJson } from './client'
import { withBoundedRetry, RetryableValidationError, type AttemptRecord } from './retry'
import { buildStoryPrompt, STORY_RESPONSE_SCHEMA } from './prompts/story'
import type { Diagnostic } from '@/timeline/diagnostics'

export function createGeminiStoryDirector(deps: { fetchImpl?: typeof fetch; apiKey?: string; model?: string } = {}): StoryDirector {
  return {
    async direct(brief: Brief, onAttempt?: (record: AttemptRecord) => void): Promise<StoryPlan> {
      const result = await withBoundedRetry<StoryPlan>(
        async () => {
          const raw = await geminiGenerateJson(
            { prompt: buildStoryPrompt(brief), responseSchema: STORY_RESPONSE_SCHEMA, model: deps.model },
            { apiKey: deps.apiKey, fetchImpl: deps.fetchImpl },
          )
          const parsed = StoryPlanSchema.safeParse(raw)
          if (!parsed.success) {
            const diagnostics: Diagnostic[] = parsed.error.issues.map((issue) => ({
              severity: 'error' as const,
              code: 'STORY_INVALID',
              message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
            }))
            throw new RetryableValidationError('StoryPlan failed Zod validation', diagnostics, raw)
          }
          return parsed.data
        },
        { stage: 'story' },
      )
      for (const record of result.attempts) onAttempt?.(record)
      return result.value
    },
  }
}
```

Also export the factory from `src/ai/index.ts`:

```ts
export { createGeminiStoryDirector } from './gemini/story-director'
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/ai/story-director.test.ts && npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS (whole suite stays green — fixture contract widening compiles) / exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/ai/story/schema.ts src/ai/story/contract.ts src/ai/gemini/prompts/story.ts src/ai/gemini/story-director.ts src/ai/index.ts tests/ai/story-director.test.ts
git commit -m "Task 5 — StoryDirector: Zod story schema, versioned prompt, bounded retry

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Retime + project.ts plumbing (`buildProject`, `diagnoseScenes`)

**Files:**
- Create: `src/ai/retime.ts`
- Modify: `src/ai/project.ts`
- Test: `tests/ai/retime.test.ts`, `tests/ai/project.test.ts`

**Interfaces:**
- Consumes: `StorySceneOutline`/`StoryPlan` (contract), `VoiceTimeline` (`@/timeline/voice`), `buildMasterTimeline` (`@/timeline/master`), `compileScene` + `CompilerError` (project.ts only — the sanctioned exception), `parseProjectDsl` (`@/video-engine/schema`).
- Produces:
  ```ts
  // src/ai/retime.ts
  export const RETIME_PADDING_SECONDS = 0.5
  export class RetimeError extends Error { constructor(readonly code: 'RETIME_MISSING_SEGMENT' | 'RETIME_UNKNOWN_SCENE', message: string) }
  export function retimeScenes(scenes: StorySceneOutline[], voice: VoiceTimeline, paddingSeconds?: number): StorySceneOutline[]
  // src/ai/project.ts (added beside the existing buildFixtureProject)
  export function buildProject(input: { dsl: ProjectDsl; voice?: VoiceTimeline | null }): FixtureProject
  export function diagnoseScenes(scenes: SceneDsl[], timeline: MasterTimeline): Diagnostic[]
  ```
  `retimeScenes` sets `durationSeconds = segment.endMs / 1000 + paddingSeconds` (audio authority; `endMs` is the once-rounded measured ms). Every scene must have exactly one segment and vice versa — mismatch throws (hard failure, spec §3). `buildFixtureProject` becomes a thin delegate to `buildProject({ dsl, voice: null })` so Phase 0 behavior is unchanged. `diagnoseScenes` compiles each scene inside try/catch and flattens `CompilerError.diagnostics`; clean scenes contribute nothing.

- [ ] **Step 1: Write the failing retime tests**

```ts
// tests/ai/retime.test.ts
import { describe, it, expect } from 'vitest'
import { retimeScenes, RETIME_PADDING_SECONDS, RetimeError } from '@/ai/retime'
import { buildMasterTimeline } from '@/timeline/master'
import type { VoiceTimeline } from '@/timeline/voice'
import type { StorySceneOutline } from '@/ai/story/contract'

const scenes: StorySceneOutline[] = [
  { id: 'scene-001', purpose: 'hook', durationSeconds: 99, title: 't1', narration: 'n1' },
  { id: 'scene-002', purpose: 'outro', durationSeconds: 99, title: 't2', narration: 'n2' },
]
const voice = (end1: number, end2: number): VoiceTimeline => ({
  timingSource: 'exact',
  totalMs: end1 + end2,
  segments: [
    { id: 'a', text: 'n1', startMs: 0, endMs: end1, words: [], timingSource: 'exact', sceneId: 'scene-001' },
    { id: 'b', text: 'n2', startMs: 0, endMs: end2, words: [], timingSource: 'exact', sceneId: 'scene-002' },
  ],
})

describe('retimeScenes', () => {
  it('duration := endMs/1000 + RETIME_PADDING (0.5), everything else preserved', () => {
    const out = retimeScenes(scenes, voice(3200, 1500))
    expect(RETIME_PADDING_SECONDS).toBe(0.5)
    expect(out[0]).toEqual({ ...scenes[0], durationSeconds: 3.7 })
    expect(out[1]).toEqual({ ...scenes[1], durationSeconds: 2.0 })
    expect(out.map((s) => s.narration)).toEqual(['n1', 'n2']) // order untouched
  })

  it('padding is overridable', () => {
    const out = retimeScenes(scenes, voice(1000, 1000), 0)
    expect(out[0]!.durationSeconds).toBe(1.0)
  })

  it('throws RETIME_MISSING_SEGMENT when a scene has no voice segment', () => {
    const partial = { ...voice(1000, 1000) }
    partial.segments = partial.segments.slice(0, 1)
    expect(() => retimeScenes(scenes, partial)).toThrow(RetimeError)
    try { retimeScenes(scenes, partial) } catch (e) { expect((e as RetimeError).code).toBe('RETIME_MISSING_SEGMENT') }
  })

  it('throws RETIME_UNKNOWN_SCENE when a segment names no scene', () => {
    const stray = voice(1000, 1000)
    stray.segments[1]!.sceneId = 'scene-999'
    try { retimeScenes(scenes, stray); throw new Error('should have thrown') }
    catch (e) { expect((e as RetimeError).code).toBe('RETIME_UNKNOWN_SCENE') }
  })
})

describe('strict construction at rounding edges (Review Focus 4)', () => {
  const edgeCases = [
    { fps: 30, endMs: 1001, pad: 0 },
    { fps: 30, endMs: 999, pad: 0 },
    { fps: 29.97, endMs: 1001, pad: 0 },
    { fps: 29.97, endMs: 733, pad: 0 },
    { fps: 29.97, endMs: 1234, pad: 0.5 },
    { fps: 30, endMs: 1234, pad: 0.5 },
  ]
  for (const { fps, endMs, pad } of edgeCases) {
    it(`no VOICE_OVERRUNS_SCENE at fps=${fps} endMs=${endMs} pad=${pad}`, () => {
      const v = voice(endMs, endMs)
      const retimed = retimeScenes(scenes, v, pad)
      const timeline = buildMasterTimeline({
        fps, width: 1920, height: 1080,
        scenes: retimed.map((s) => ({ sceneId: s.id, duration: s.durationSeconds })),
        voice: v, music: null, voiceScenePolicy: 'strict',
      })
      expect(timeline.diagnostics.filter((d) => d.code === 'VOICE_OVERRUNS_SCENE')).toEqual([])
      expect(timeline.totalFrames).toBe(
        timeline.sceneWindows['scene-001']!.durationInFrames + timeline.sceneWindows['scene-002']!.durationInFrames,
      )
    })
  }
})
```

- [ ] **Step 2: Write the failing project.ts tests**

```ts
// tests/ai/project.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { buildProject, buildFixtureProject, diagnoseScenes } from '@/ai/project'
import { demoProjectDsl } from '@/ai/demo-project.dsl'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import { buildMasterTimeline } from '@/timeline/master'
import type { VoiceTimeline } from '@/timeline/voice'
import type { SceneDsl } from '@/video-engine/schema'

beforeEach(() => { clearRegistered(); registerBackends() })

describe('buildProject', () => {
  it('parse → timeline(with voice) → compile; timeline.voice is the voice passed in', () => {
    const voice: VoiceTimeline = {
      timingSource: 'exact',
      totalMs: 500,
      segments: [{ id: 'v1', text: 'x', startMs: 0, endMs: 500, words: [], timingSource: 'exact', sceneId: 'scene-hero' }],
    }
    const project = buildProject({ dsl: demoProjectDsl, voice })
    expect(project.timeline.voice).toBe(voice)
    expect(project.compiledScenes).toHaveLength(demoProjectDsl.scenes.length)
    expect(project.dsl).toEqual(demoProjectDsl)
    expect(project.timeline.totalFrames).toBe(900)
  })

  it('buildFixtureProject delegates: voice null, same shape as before', () => {
    const fixture = buildFixtureProject()
    expect(fixture.timeline.voice).toBeNull()
    expect(fixture.compiledScenes.map((s) => s.sceneId)).toEqual(['scene-hero', 'scene-split', 'scene-network', 'scene-outro'])
  })
})

describe('diagnoseScenes', () => {
  it('returns no diagnostics for a project that compiles clean', () => {
    const project = buildFixtureProject()
    expect(diagnoseScenes(project.dsl.scenes, project.timeline)).toEqual([])
  })

  it('captures CompilerError diagnostics naming the unknown composition', () => {
    const project = buildFixtureProject()
    const broken: SceneDsl = { ...project.dsl.scenes[0]!, composition: { id: 'does-not-exist', params: {} } as never }
    const diagnostics = diagnoseScenes([broken, ...project.dsl.scenes.slice(1)], project.timeline)
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics.some((d) => d.message.includes('does-not-exist'))).toBe(true)
    expect(diagnostics.every((d) => d.severity === 'error')).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/ai/retime.test.ts tests/ai/project.test.ts`
Expected: FAIL — `retimeScenes`/`buildProject`/`diagnoseScenes` do not exist.

- [ ] **Step 4: Implement `src/ai/retime.ts`**

```ts
import type { StorySceneOutline } from './story/contract'
import type { VoiceTimeline } from '@/timeline/voice'

export const RETIME_PADDING_SECONDS = 0.5 // spec §5.2

export class RetimeError extends Error {
  constructor(readonly code: 'RETIME_MISSING_SEGMENT' | 'RETIME_UNKNOWN_SCENE', message: string) {
    super(`${code}: ${message}`); this.name = 'RetimeError'
  }
}

/** Audio is the authority (spec §3): final scene duration comes from measured audio + padding,
 *  never from StoryPlan.durationSeconds (estimate only). */
export function retimeScenes(
  scenes: StorySceneOutline[],
  voice: VoiceTimeline,
  paddingSeconds: number = RETIME_PADDING_SECONDS,
): StorySceneOutline[] {
  const segmentByScene = new Map(voice.segments.map((s) => [s.sceneId, s]))
  const sceneIds = new Set(scenes.map((s) => s.id))

  for (const segment of voice.segments) {
    if (!sceneIds.has(segment.sceneId)) {
      throw new RetimeError('RETIME_UNKNOWN_SCENE', `voice segment "${segment.id}" names unknown scene "${segment.sceneId}"`)
    }
  }
  return scenes.map((scene) => {
    const segment = segmentByScene.get(scene.id)
    if (!segment) throw new RetimeError('RETIME_MISSING_SEGMENT', `scene "${scene.id}" has no voice segment`)
    return { ...scene, durationSeconds: segment.endMs / 1000 + paddingSeconds }
  })
}
```

- [ ] **Step 5: Implement the project.ts additions**

`src/ai/project.ts` — replace the file body with (imports adjusted, `buildFixtureProject` kept):

```ts
import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'
import type { Diagnostic } from '@/timeline/diagnostics'
import type { VoiceTimeline } from '@/timeline/voice'
import { parseProjectDsl, type ProjectDsl, type SceneDsl } from '@/video-engine/schema'
import { compileScene, CompilerError } from '@/video-engine/compiler'
import { buildMasterTimeline } from '@/timeline/master'
import { demoProjectDsl } from './demo-project.dsl'

export type FixtureProject = { dsl: ProjectDsl; compiledScenes: CompiledScene[]; timeline: MasterTimeline }

/**
 * Composition root: parse → timeline → compile. This is the ONLY module in
 * `src/ai/**` allowed to import the compiler (AGENTS.md sanctioned exception).
 * `generate.ts` and the Visual Director's retry reach the compiler only through
 * `buildProject` / `diagnoseScenes` — the exception is not widened.
 */
export function buildProject(input: { dsl: ProjectDsl; voice?: VoiceTimeline | null }): FixtureProject {
  const parsed = parseProjectDsl(input.dsl)
  const timeline = buildMasterTimeline({
    fps: parsed.render.fps,
    width: parsed.render.width,
    height: parsed.render.height,
    voiceScenePolicy: parsed.voiceScenePolicy,
    voice: input.voice ?? null,
    music: null,
    scenes: parsed.scenes.map((s) => ({ sceneId: s.sceneId, duration: s.duration })),
  })
  const compiledScenes = parsed.scenes.map((scene) => compileScene({ dsl: scene, timeline, assets: [] }))
  return { dsl: parsed, compiledScenes, timeline }
}

/** Phase 0 entry point — unchanged behavior, now a delegate. */
export function buildFixtureProject(input: ProjectDsl = demoProjectDsl): FixtureProject {
  return buildProject({ dsl: input, voice: null })
}

/**
 * Compiles scenes against a LOCKED timeline purely to harvest diagnostics —
 * used by the Visual Director's bounded retry (spec §4 rule 2). Never throws;
 * a CompilerError becomes its diagnostics array.
 */
export function diagnoseScenes(scenes: SceneDsl[], timeline: MasterTimeline): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const scene of scenes) {
    try {
      compileScene({ dsl: scene, timeline, assets: [] })
    } catch (err) {
      if (err instanceof CompilerError) diagnostics.push(...err.diagnostics)
      else diagnostics.push({ severity: 'error', code: 'COMPILE_THROW', sceneId: scene.sceneId, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return diagnostics
}
```

Verify `CompilerError` is exported from `@/video-engine/compiler` (it is — `errors.ts` is re-exported by the compiler barrel; if the barrel omits it, add the export there in this task).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: whole suite PASS / exit 0 (Phase 0 tests must remain green through the delegate refactor).

- [ ] **Step 7: Commit**

```bash
git add src/ai/retime.ts src/ai/project.ts tests/ai/retime.test.ts tests/ai/project.test.ts
git commit -m "Task 6 — retime (audio authority) + buildProject/diagnoseScenes plumbing

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: VisualDirector (Gemini #2, locked windows)

**Files:**
- Create: `src/ai/visual/style-presets.ts`
- Create: `src/ai/gemini/prompts/visual.ts`
- Create: `src/ai/gemini/visual-director.ts`
- Modify: `src/ai/visual/contract.ts` (+`sceneWindows`, `fps`; `direct` gains `onAttempt`)
- Modify: `src/ai/index.ts` (export factory)
- Test: `tests/ai/visual-director.test.ts`; modify `tests/ai/contracts.test.ts` if it constructs `VisualDirectorInput` (new required fields)

**Interfaces:**
- Consumes: `geminiGenerateJson`, `withBoundedRetry` (Task 4), `parseSceneDsl` (`@/video-engine/schema` — allowed), `listAvailable()` (`@/video-engine/registry` — not on the forbidden list), `Diagnostic`, Task 6's `diagnoseScenes` — **injected as a callback**, never imported (the Visual Director itself must not reach the compiler).
- Produces:
  ```ts
  // contract.ts additions
  export type SceneWindowRef = { startFrame: number; durationInFrames: number }
  export type VisualDirectorInput = { ...Phase 0 fields..., sceneWindows: Record<string, SceneWindowRef>; fps: number }
  export interface VisualDirector { direct(input: VisualDirectorInput, onAttempt?: (r: AttemptRecord) => void): Promise<SceneDSL[]> }
  // src/ai/visual/style-presets.ts
  export const STYLE_PRESETS: { id: string; description: string }[]
  // src/ai/gemini/prompts/visual.ts
  export const VISUAL_PROMPT_VERSION = 'visual-prompt-1'
  export function buildVisualPrompt(input: VisualDirectorInput): string
  export const VISUAL_RESPONSE_SCHEMA: Record<string, unknown>
  // src/ai/gemini/visual-director.ts
  export function createGeminiVisualDirector(deps: {
    diagnose: (scenes: SceneDsl[]) => Diagnostic[]  // generate.ts binds: (s) => diagnoseScenes(s, lockedTimeline)
    fetchImpl?: typeof fetch; apiKey?: string; model?: string
  }): VisualDirector
  ```
  Validation per attempt: each scene through `parseSceneDsl` (Zod strict) → then `deps.diagnose(scenes)`; **any error-severity diagnostic fails the attempt** with code carried through. Retry prompt returns previous DSL JSON + diagnostics (spec §4 rule 2). Attempt records use codes `VISUAL_INVALID` (Zod) / the compiler's own codes (diagnose).

- [ ] **Step 1: Write the failing test**

```ts
// tests/ai/visual-director.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGeminiVisualDirector } from '@/ai/gemini/visual-director'
import { VISUAL_PROMPT_VERSION, VISUAL_RESPONSE_SCHEMA, buildVisualPrompt } from '@/ai/gemini/prompts/visual'
import { STYLE_PRESETS } from '@/ai/visual/style-presets'
import { demoProjectDsl } from '@/ai/demo-project.dsl'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import type { VisualDirectorInput } from '@/ai/visual/contract'
import type { SceneDsl } from '@/video-engine/schema'
import type { Diagnostic } from '@/timeline/diagnostics'

beforeEach(() => { clearRegistered(); registerBackends() })

const GOOD_SCENE = demoProjectDsl.scenes[0]!
const input = (): VisualDirectorInput => ({
  topic: 'Ba renderer',
  language: 'vi',
  scenes: [{ id: 'scene-001', purpose: 'hook', durationSeconds: 6, title: 'Mở', narration: 'Xin chào' }],
  availableCompositions: ['hero', 'split'],
  availableVisualRecipes: [{ id: 'grid', version: '1' }],
  availableMotionRecipes: [{ id: 'drift', version: '1' }],
  style: { styleId: 'default' },
  assets: [],
  timelineWindow: { startSeconds: 0, durationSeconds: 6 },
  constraints: {},
  sceneWindows: { 'scene-001': { startFrame: 0, durationInFrames: 180 } },
  fps: 30,
})

function geminiReturning(payloads: unknown[]) {
  let i = 0
  return vi.fn(async () => Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payloads[Math.min(i++, payloads.length - 1)]) }] } }],
  }))
}
const err = (m: string): Diagnostic => ({ severity: 'error', code: 'UNKNOWN_VISUAL_RECIPE', message: m })

describe('createGeminiVisualDirector', () => {
  it('accepts compilable DSL and returns scenes in one attempt', async () => {
    const fetchImpl = geminiReturning([[GOOD_SCENE]])
    const diagnose = vi.fn(() => [] as Diagnostic[])
    const director = createGeminiVisualDirector({ diagnose, apiKey: 'test-key', fetchImpl })
    const scenes = await director.direct(input())
    expect(scenes).toEqual([GOOD_SCENE])
    expect(diagnose).toHaveBeenCalledWith([GOOD_SCENE])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fails the attempt when diagnose reports errors, then succeeds with corrected DSL', async () => {
    const fetchImpl = geminiReturning([[GOOD_SCENE], [GOOD_SCENE]])
    const diagnose = vi.fn()
      .mockReturnValueOnce([err('Unknown visual recipe "particlez"')])
      .mockReturnValue([] as Diagnostic[])
    const director = createGeminiVisualDirector({ diagnose, apiKey: 'test-key', fetchImpl })
    const scenes = await director.direct(input())
    expect(scenes).toEqual([GOOD_SCENE])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const retryBody = String(fetchImpl.mock.calls[1]![1]!.body)
    expect(retryBody).toContain('UNKNOWN_VISUAL_RECIPE')       // diagnostics carried back
    expect(retryBody).toContain('particlez')
    expect(retryBody).toContain(GOOD_SCENE.sceneId)            // previous output carried back
  })

  it('Zod failure (bad purpose) also retries', async () => {
    const bad = { ...GOOD_SCENE, purpose: 'nonsense' }
    const fetchImpl = geminiReturning([[bad], [GOOD_SCENE]])
    const director = createGeminiVisualDirector({ diagnose: () => [], apiKey: 'test-key', fetchImpl })
    await director.direct(input())
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const retryBody = String(fetchImpl.mock.calls[1]![1]!.body)
    expect(retryBody).toContain('VISUAL_INVALID')
  })

  it('exhausts after 3 attempts when diagnose keeps failing (stage-local — no upstream calls possible)', async () => {
    const fetchImpl = geminiReturning([[GOOD_SCENE]])
    const diagnose = vi.fn(() => [err('still unknown')])
    const director = createGeminiVisualDirector({ diagnose, apiKey: 'test-key', fetchImpl })
    await expect(director.direct(input())).rejects.toMatchObject({ name: 'StageRetryExhausted', stage: 'visual' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('prompt carries the LOCKED windows, fps, catalogue, purpose enum, style presets, seed context (§4 rule 3, §9.4)', () => {
    const prompt = buildVisualPrompt(input())
    expect(prompt).toContain(VISUAL_PROMPT_VERSION)
    expect(prompt).toContain('startFrame: 0')
    expect(prompt).toContain('durationInFrames: 180')
    expect(prompt).toContain('fps: 30')
    expect(prompt).toContain('hero')                 // composition catalogue id
    expect(prompt).toContain('grid')                 // visual recipe id
    expect(prompt).toContain('drift')                // motion recipe id
    expect(prompt).toContain(STYLE_PRESETS[0]!.id)
    expect(prompt).toContain('scene-001')
    for (const p of ['hook', 'explain_network', 'data_reveal', 'outro']) expect(prompt).toContain(p)
    // the prompt must state that windows are immutable
    expect(prompt).toMatch(/never change (the )?(scene )?windows|windows are locked/i)
  })

  it('VISUAL_RESPONSE_SCHEMA requires sceneId/purpose/composition/visual/typography etc. and forbids extra keys', () => {
    expect(VISUAL_RESPONSE_SCHEMA.type).toBe('object')
    expect((VISUAL_RESPONSE_SCHEMA.properties as { scenes: { type: string } }).scenes.type).toBe('array')
    expect(VISUAL_RESPONSE_SCHEMA.additionalProperties).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai/visual-director.test.ts`
Expected: FAIL — contract fields/factory missing.

- [ ] **Step 3: Extend the contract**

`src/ai/visual/contract.ts`:

```ts
import type { CompositionId, SceneDSL, StyleRef } from '@/video-engine/schema'
import type { StorySceneOutline } from '@/ai/story/contract'
import type { AttemptRecord } from '@/ai/gemini/retry'

export type AvailableRecipeRef = { id: string; version: string; renderer?: string }
export type SceneWindowRef = { startFrame: number; durationInFrames: number }

/**
 * The engine hands the director ids and schemas — never renderer source code
 * (spec §8). `available*` come from `listAvailable()`. `sceneWindows`/`fps` are
 * LOCKED: the director designs inside them and can never change timing (§9.4).
 */
export type VisualDirectorInput = {
  topic: string
  language: string
  scenes: StorySceneOutline[]
  availableCompositions: CompositionId[]
  availableVisualRecipes: AvailableRecipeRef[]
  availableMotionRecipes: AvailableRecipeRef[]
  style: StyleRef
  assets: { id: string; kind: string; source: string }[]
  timelineWindow: { startSeconds: number; durationSeconds: number }
  constraints: { maxLayersPerScene?: number; allowedCompositions?: CompositionId[] }
  sceneWindows: Record<string, SceneWindowRef>
  fps: number
}

/** Chooses composition + recipes + params and returns DSL. Never picks a renderer. */
export interface VisualDirector {
  direct(input: VisualDirectorInput, onAttempt?: (record: AttemptRecord) => void): Promise<SceneDSL[]>
}
```

Check `tests/ai/contracts.test.ts` for any literal `VisualDirectorInput` construction — add `sceneWindows`/`fps` there if needed (the fixture `direct` ignores them).

- [ ] **Step 4: Implement style presets**

```ts
// src/ai/visual/style-presets.ts
/** Prompt vocabulary for StyleRef.styleId (spec §2: token consumption is Phase 1B —
 *  1A only designs the vocabulary; the DSL field already exists). */
export const STYLE_PRESETS: { id: string; description: string }[] = [
  { id: 'default', description: 'balanced, neutral brand look' },
  { id: 'cinematic', description: 'deep contrast, dark backdrop, filmic pacing' },
  { id: 'minimal', description: 'high whitespace, few elements, mono accents' },
  { id: 'energetic', description: 'bright accents, fast motion, playful shapes' },
  { id: 'corporate', description: 'clean grids, blue accents, calm motion' },
]
```

- [ ] **Step 5: Implement `src/ai/gemini/prompts/visual.ts`**

Gemini response schema (subset — object/array/string/number/boolean/enum/required/additionalProperties only):

```ts
import type { VisualDirectorInput } from '@/ai/visual/contract'
import { STYLE_PRESETS } from '@/ai/visual/style-presets'

export const VISUAL_PROMPT_VERSION = 'visual-prompt-1'

const SCENE_OBJECT: Record<string, unknown> = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string' },
    sceneId: { type: 'string' },
    purpose: { type: 'string', enum: ['hook', 'explain_network', 'explain_concept', 'demonstrate', 'compare', 'data_reveal', 'summary', 'outro'] },
    duration: { type: 'number' },
    composition: { type: 'object', properties: { id: { type: 'string' }, params: { type: 'object' } }, required: ['id'], additionalProperties: false },
    backdropRenderer: { type: 'string', enum: ['dom', 'canvas2d', 'three'] },
    visual: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, recipe: { type: 'string' }, params: { type: 'object' }, slot: { type: 'string' } }, required: ['recipe'], additionalProperties: false } },
    motion: { type: 'array', items: { type: 'object', properties: { recipe: { type: 'string' }, params: { type: 'object' }, target: { type: 'string' } }, required: ['recipe'], additionalProperties: false } },
    typography: { type: ['object', 'null'], properties: { text: { type: 'string' }, animation: { type: 'string', enum: ['none', 'fade', 'reveal', 'typewriter', 'word-by-word'] }, slot: { type: 'string' }, startSeconds: { type: 'number' }, durationSeconds: { type: 'number' } }, required: ['text', 'animation'], additionalProperties: false },
    audio: { type: 'array', items: { type: 'object' } },
    events: { type: 'array', items: { type: 'object' } },
    style: { type: 'object' },
    seed: { type: 'integer' },
  },
  required: ['schemaVersion', 'sceneId', 'purpose', 'duration', 'composition', 'visual', 'motion', 'typography', 'audio', 'events', 'style', 'seed'],
  additionalProperties: false,
}

export const VISUAL_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { scenes: { type: 'array', items: SCENE_OBJECT } },
  required: ['scenes'],
  additionalProperties: false,
}

export function buildVisualPrompt(input: VisualDirectorInput): string {
  const windows = Object.entries(input.sceneWindows)
    .map(([id, w]) => `- ${id}: startFrame=${w.startFrame}, durationInFrames=${w.durationInFrames}`).join('\n')
  const scenes = input.scenes
    .map((s) => `- ${s.id} | purpose=${s.purpose} | duration=${s.durationSeconds}s | title=${s.title} | narration=${s.narration}`).join('\n')
  const compositions = input.availableCompositions.join(', ')
  const visualRecipes = input.availableVisualRecipes.map((r) => `${r.id}@${r.version}`).join(', ')
  const motionRecipes = input.availableMotionRecipes.map((r) => `${r.id}@${r.version}`).join(', ')
  const styles = STYLE_PRESETS.map((p) => `${p.id}: ${p.description}`).join('; ')
  return [
    `PROMPT_VERSION: ${VISUAL_PROMPT_VERSION}`,
    'You are the VisualDirector of a video generation pipeline. You design scenes as declarative Scene DSL JSON — never code, never JSX.',
    `Topic: ${input.topic} | Language: ${input.language}`,
    `Locked scene windows at ${input.fps} fps (these are IMMUTABLE — you may never change the scene windows; design only inside them):`,
    windows,
    'Scenes (retimed; duration matches the window):',
    scenes,
    `Available compositions: ${compositions}`,
    `Available visual recipes: ${visualRecipes}`,
    `Available motion recipes: ${motionRecipes}`,
    `Typography animations: none, fade, reveal, typewriter, word-by-word`,
    `Style presets (pick one styleId): ${styles}`,
    `Project style: ${JSON.stringify(input.style)}`,
    'Rules:',
    '- One output scene per input scene, same sceneId and same duration (seconds) as the window implies.',
    '- Only use ids from the catalogues above; invented ids will be rejected and sent back to you as diagnostics.',
    '- schemaVersion must be "0.1"; seed is a small integer.',
    '- Return JSON matching the response schema. Nothing else.',
  ].join('\n')
}
```

(Adjust `required`/property lists to exactly match `SceneDSLSchema` in `src/video-engine/schema/scene-dsl.ts` if the schema and this shape drift — the Zod parse in the director is the authority; the responseSchema only steers.)

- [ ] **Step 6: Implement `src/ai/gemini/visual-director.ts`**

```ts
import type { VisualDirector, VisualDirectorInput } from '@/ai/visual/contract'
import type { SceneDsl } from '@/video-engine/schema'
import { parseSceneDsl } from '@/video-engine/schema'
import { geminiGenerateJson } from './client'
import { withBoundedRetry, RetryableValidationError, type AttemptRecord } from './retry'
import { buildVisualPrompt, VISUAL_RESPONSE_SCHEMA } from './prompts/visual'
import type { Diagnostic } from '@/timeline/diagnostics'

export function createGeminiVisualDirector(deps: {
  diagnose: (scenes: SceneDsl[]) => Diagnostic[]
  fetchImpl?: typeof fetch
  apiKey?: string
  model?: string
}): VisualDirector {
  return {
    async direct(input: VisualDirectorInput, onAttempt?: (record: AttemptRecord) => void): Promise<SceneDSL[]> {
      const result = await withBoundedRetry<SceneDSL[]>(
        async (attempt, previous) => {
          const prompt = previous
            ? [
                buildVisualPrompt(input),
                '',
                `Previous attempt #${previous.output === undefined ? attempt - 1 : attempt - 1} output:`,
                JSON.stringify(previous.output),
                'Diagnostics that rejected it:',
                ...previous.diagnostics.map((d) => `- [${d.code}] ${d.message}`),
                'Fix ONLY what the diagnostics name. Return the full corrected JSON scene list.',
              ].join('\n')
            : buildVisualPrompt(input)
          const raw = await geminiGenerateJson(
            { prompt, responseSchema: VISUAL_RESPONSE_SCHEMA, model: deps.model },
            { apiKey: deps.apiKey, fetchImpl: deps.fetchImpl },
          )
          const rawScenes = (raw as { scenes?: unknown })?.scenes
          if (!Array.isArray(rawScenes)) {
            throw new RetryableValidationError('Response is not {scenes: [...]}',
              [{ severity: 'error', code: 'VISUAL_INVALID', message: 'missing scenes array' }], raw)
          }
          const scenes: SceneDsl[] = []
          const zodDiagnostics: Diagnostic[] = []
          for (const candidate of rawScenes) {
            const parsed = parseSceneDsl(candidate)
            if (!parsed.success) {
              zodDiagnostics.push(...parsed.error.issues.map((issue) => ({
                severity: 'error' as const,
                code: 'VISUAL_INVALID',
                sceneId: typeof (candidate as { sceneId?: string })?.sceneId === 'string' ? (candidate as { sceneId: string }).sceneId : undefined,
                message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
              })))
            } else scenes.push(parsed.data)
          }
          if (zodDiagnostics.length > 0) throw new RetryableValidationError('Scene DSL failed Zod validation', zodDiagnostics, raw)

          const compileDiagnostics = deps.diagnose(scenes).filter((d) => d.severity === 'error')
          if (compileDiagnostics.length > 0) {
            throw new RetryableValidationError('Scene DSL failed compilation diagnostics', compileDiagnostics, raw)
          }
          return scenes
        },
        { stage: 'visual' },
      )
      for (const record of result.attempts) onAttempt?.(record)
      return result.value
    },
  }
}
```

Confirm the exact return shape of `parseSceneDsl` (Phase 0: throws on failure **or** returns a result — read `src/video-engine/schema/scene-dsl.ts` first and adapt: if it throws with issue paths, wrap the call in try/catch and map `err.issues` the same way; the Zod-authority behavior is what the test pins).

Export from `src/ai/index.ts`: `export { createGeminiVisualDirector } from './gemini/visual-director'`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS / exit 0 (fix `tests/ai/contracts.test.ts` input literals if the contract widened).

- [ ] **Step 8: Commit**

```bash
git add src/ai/visual/contract.ts src/ai/visual/style-presets.ts src/ai/gemini/prompts/visual.ts src/ai/gemini/visual-director.ts src/ai/index.ts tests/ai/visual-director.test.ts tests/ai/contracts.test.ts
git commit -m "Task 7 — VisualDirector: locked-window prompt, catalogue injection, diagnose-driven retry

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: Artifacts — sourceHash chain, manifest, resume validators

**Plan-time ruling (spec §7.3):** the spec formula is `sourceHash = hash(upstream + stageInputs)`. Stages ①②⑤ are **non-deterministic** — a successful re-generation with identical inputs would keep the same hash and wrongly mark downstream artifacts valid. This plan therefore uses `hashObject({ upstream, stageInputs, payload })` for **every** stage (a superset of the spec's formula that delivers its stated goal: *"if any upstream hash changes, every downstream recomputed hash differs"*). Validators recompute from the file's own payload + manifest-stored `stageInputs`. `video.mp4` is the sole exception: it is never hashed; its staleness key is `manifest.render.sourceHash === render-props.json sourceHash` (spec §7.4/§7.5).

**Files:**
- Create: `src/ai/artifacts.ts`
- Test: `tests/ai/artifacts.test.ts`

**Interfaces:**
- Consumes: `hashObject` (`@/shared`), `parseProjectDsl` (`@/video-engine/schema`), `computeCompiledHash` (`@/video-engine/ir`), `ENGINE_VERSION` (`@/video-engine/version`), StoryPlan schema (Task 5), `StoryPlan`/`Brief` types, node `fs`/`path`.
- Produces:
  ```ts
  // src/ai/artifacts.ts
  export type ArtifactHeader = { schemaVersion: string; runId: string; createdAt: string; sourceHash: string }
  export type GenerateStage = 'story' | 'voice' | 'timeline' | 'visual' | 'compile' | 'renderProps' | 'render'
  export type AttemptRecord = ... // re-export from gemini/retry
  export type StageRecord = { status: 'pending' | 'done' | 'failed'; stageInputs?: Record<string, unknown>; sourceHash?: string; attempts?: AttemptRecord[]; at?: string; error?: string }
  export type Manifest = {
    schemaVersion: 'manifest-1'; runId: string; createdAt: string; briefHash: string; engineVersion: string
    tts: { baseUrl: string; provider: 'tts-studio'; model: 'omnivoice'; voiceId: string; outputFormat: 'mp3'; voiceSettings: { stability: 0.5; similarity_boost: 0.75; style: 0.0; speed: 1.0 }; normalizeText: false }
    asr: { model: string; wordTimestamps: true; durationSource: 'ffprobe'; maxDurationDeltaSeconds: 0.1 }
    retime: { paddingSeconds: number }
    promptVersions: { story: string; visual: string }
    stages: Record<GenerateStage, StageRecord>
    render?: { sourceHash: string; output: 'video.mp4' }
  }
  export function briefHash(brief: Brief): string
  export function stageSourceHash(input: { upstream: string; stageInputs: Record<string, unknown>; payload: unknown }): string
  export function writeJsonArtifact(filePath: string, header: Omit<ArtifactHeader, 'createdAt'> & { createdAt?: string }, payload: unknown): void
  export function readJsonArtifact<T>(filePath: string): { header: ArtifactHeader; payload: T } | null  // null on missing/corrupt/not-an-object
  export function readManifest(runDir: string): Manifest | null
  export function writeManifest(runDir: string, manifest: Manifest): void
  export function createManifest(input: { runId: string; brief: Brief; briefHash: string; paddingSeconds: number; storyPromptVersion: string; visualPromptVersion: string; asrModel: string; voiceId?: string }): Manifest
  export type StageValidation = { ok: true; sourceHash: string } | { ok: false; reason: string }
  export function validateStory(runDir: string, upstream: string, manifest: Manifest): StageValidation
  export function validateVoice(runDir: string, upstream: string, manifest: Manifest): StageValidation
  export function validateTimeline(runDir: string, upstream: string, manifest: Manifest): StageValidation
  export function validateVisual(runDir: string, upstream: string, manifest: Manifest): StageValidation
  export function validateCompiled(runDir: string, upstream: string, manifest: Manifest): StageValidation
  export function validateRenderProps(runDir: string, upstream: string, manifest: Manifest): StageValidation
  export function validateVideo(runDir: string, propsSourceHash: string): StageValidation
  ```
  Artifact file names (spec §7.1): `brief.json`, `story.json`, `voicetimeline.json`, `master-timeline.json`, `project.dsl.json`, `compiled/<sceneId>.json`, `render-props.json`, `video.mp4`.

  **stageInputs** (stored in `manifest.stages[stage].stageInputs` at run time, hashed and reused by validators):
  - `story`: `{ promptVersion }`
  - `voice`: `{ tts: { modelId, voiceId, outputFormat, voiceSettings, normalizeText }, asr: { model, wordTimestamps } }`
  - `timeline`: `{ paddingSeconds, fps, width, height, voiceScenePolicy }`
  - `visual`: `{ promptVersion, seed, style, catalogue: { compositions: string[], visual: string[], motion: string[] } }`
  - `compile`: `{ engineVersion }`
  - `renderProps`: `{ audioSceneIds: string[] }`
  - `render`: not hashed — uses `render-props`'s `sourceHash` (spec §7.5).

- [ ] **Step 1: Write the failing test**

```ts
// tests/ai/artifacts.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  briefHash, stageSourceHash, writeJsonArtifact, readJsonArtifact,
  readManifest, writeManifest, createManifest,
  validateStory, validateVoice, validateTimeline, validateVisual, validateCompiled, validateRenderProps, validateVideo,
} from '@/ai/artifacts'
import { StoryPlanSchema } from '@/ai/story/schema'
import { demoProjectDsl } from '@/ai/demo-project.dsl'
import { buildFixtureProject } from '@/ai/project'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import { ENGINE_VERSION } from '@/video-engine/version'
import type { Manifest } from '@/ai/artifacts'
import type { Brief, StoryPlan } from '@/ai/story/contract'

let runDir: string
beforeEach(() => { clearRegistered(); registerBackends(); runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delyai-art-')) })
afterEach(() => fs.rmSync(runDir, { recursive: true, force: true }))

const BRIEF: Brief = { topic: 'x', targetSeconds: 10, language: 'vi' }
const STORY: StoryPlan = {
  title: 'T',
  scenes: [{ id: 'scene-001', purpose: 'hook', durationSeconds: 5, title: 'a', narration: 'b' }],
}
const UPSTREAM = 'u'.repeat(64)

function manifest(): Manifest {
  return createManifest({
    runId: 'run-1', brief: BRIEF, briefHash: briefHash(BRIEF), paddingSeconds: 0.5,
    storyPromptVersion: 'story-prompt-1', visualPromptVersion: 'visual-prompt-1', asrModel: 'medium', voiceId: 'v1',
  })
}

describe('hash chain (spec §7.3)', () => {
  it('briefHash is stable and payload-sensitive', () => {
    expect(briefHash(BRIEF)).toBe(briefHash({ ...BRIEF }))
    expect(briefHash(BRIEF)).not.toBe(briefHash({ ...BRIEF, topic: 'y' }))
  })

  it('stageSourceHash depends on upstream AND payload — mutating the payload invalidates the stage', () => {
    const a = stageSourceHash({ upstream: UPSTREAM, stageInputs: { p: 1 }, payload: { v: 1 } })
    const b = stageSourceHash({ upstream: UPSTREAM, stageInputs: { p: 1 }, payload: { v: 2 } })
    const c = stageSourceHash({ upstream: 'other', stageInputs: { p: 1 }, payload: { v: 1 } })
    const d = stageSourceHash({ upstream: UPSTREAM, stageInputs: { p: 2 }, payload: { v: 1 } })
    expect(new Set([a, b, c, d]).size).toBe(4)
  })

  it('mutating the brief invalidates every downstream hop, and nothing else (spec §9.2)', () => {
    const build = (b: Brief) => {
      const h0 = briefHash(b)
      const h1 = stageSourceHash({ upstream: h0, stageInputs: { promptVersion: 's1' }, payload: STORY })
      const h2 = stageSourceHash({ upstream: h1, stageInputs: { paddingSeconds: 0.5 }, payload: { totalMs: 1 } })
      const h3 = stageSourceHash({ upstream: h2, stageInputs: { seed: 1 }, payload: { scenes: [] } })
      return { h0, h1, h2, h3 }
    }
    const original = build(BRIEF)
    const mutated = build({ ...BRIEF, topic: 'CHANGED' })
    expect(mutated.h0).not.toBe(original.h0)
    expect(mutated.h1).not.toBe(original.h1)
    expect(mutated.h2).not.toBe(original.h2)
    expect(mutated.h3).not.toBe(original.h3)
    // same payload at every hop — the ONLY difference is the propagated upstream hash
    const h1SamePayload = stageSourceHash({ upstream: mutated.h0, stageInputs: { promptVersion: 's1' }, payload: STORY })
    expect(h1SamePayload).toBe(mutated.h1)
    expect(h1SamePayload).not.toBe(original.h1)
  })
})

describe('read/write', () => {
  it('round-trips header + payload; returns null on missing or corrupt', () => {
    const file = path.join(runDir, 'story.json')
    expect(readJsonArtifact(file)).toBeNull()
    writeJsonArtifact(file, { schemaVersion: 'story-1', runId: 'run-1', sourceHash: 'abc' }, STORY)
    const back = readJsonArtifact<StoryPlan>(file)
    expect(back?.payload).toEqual(STORY)
    expect(back?.header.sourceHash).toBe('abc')
    expect(back?.header.runId).toBe('run-1')
    expect(typeof back?.header.createdAt).toBe('string')
    fs.writeFileSync(file, '{not json')
    expect(readJsonArtifact(file)).toBeNull()
    fs.writeFileSync(file, '"just a string"')
    expect(readJsonArtifact(file)).toBeNull()
  })

  it('manifest round-trips', () => {
    const m = manifest()
    expect(readManifest(runDir)).toBeNull()
    writeManifest(runDir, m)
    expect(readManifest(runDir)).toEqual(m)
    fs.writeFileSync(path.join(runDir, 'manifest.json'), 'garbage')
    expect(readManifest(runDir)).toBeNull()
  })
})

describe('stage validators (spec §7.4)', () => {
  it('story: valid payload + chain → ok; garbage payload → not ok; wrong chain → not ok', () => {
    const m = manifest()
    m.stages.story.stageInputs = { promptVersion: 'story-prompt-1' }
    const h = stageSourceHash({ upstream: briefHash(BRIEF), stageInputs: m.stages.story.stageInputs, payload: STORY })
    m.stages.story.sourceHash = h
    writeJsonArtifact(path.join(runDir, 'story.json'), { schemaVersion: 'story-1', runId: 'run-1', sourceHash: h }, STORY)
    expect(validateStory(runDir, briefHash(BRIEF), m)).toEqual({ ok: true, sourceHash: h })

    fs.writeFileSync(path.join(runDir, 'story.json'), '{"schemaVersion":"x","runId":"y","createdAt":"z","sourceHash":"abc","payload":{"nope":1}}')
    expect(validateStory(runDir, briefHash(BRIEF), m).ok).toBe(false) // sourceHash no longer covers this payload → chain mismatch

    writeJsonArtifact(path.join(runDir, 'story.json'), { schemaVersion: 'story-1', runId: 'run-1', sourceHash: h }, { title: 'T', scenes: [] })
    expect(validateStory(runDir, briefHash(BRIEF), m).ok).toBe(false) // payload edited after hashing → chain mismatch (StoryPlanSchema is the second net)
  })

  it('voice: requires timeline shape AND every referenced mp3 present non-empty', () => {
    const m = manifest()
    m.stages.voice.stageInputs = { tts: { modelId: 'omnivoice', voiceId: 'v1', outputFormat: 'mp3', voiceSettings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 }, normalizeText: false }, asr: { model: 'medium', wordTimestamps: true } }
    const voiceTl = {
      timingSource: 'exact', totalMs: 1000,
      segments: [{ id: 'scene-001-voice', text: 'b', startMs: 0, endMs: 1000, words: [{ word: 'b', startMs: 0, endMs: 900 }], timingSource: 'exact', sceneId: 'scene-001', wordTimingSource: 'whisper' }],
    }
    const h = stageSourceHash({ upstream: UPSTREAM, stageInputs: m.stages.voice.stageInputs, payload: voiceTl })
    m.stages.voice.sourceHash = h
    writeJsonArtifact(path.join(runDir, 'voicetimeline.json'), { schemaVersion: 'voice-1', runId: 'run-1', sourceHash: h }, voiceTl)
    fs.mkdirSync(path.join(runDir, 'voice'), { recursive: true })
    fs.writeFileSync(path.join(runDir, 'voice', 'scene-001.mp3'), 'mp3-bytes')
    expect(validateVoice(runDir, UPSTREAM, m).ok).toBe(true)

    fs.writeFileSync(path.join(runDir, 'voice', 'scene-001.mp3'), '')
    expect(validateVoice(runDir, UPSTREAM, m).ok).toBe(false) // zero-byte mp3
    fs.writeFileSync(path.join(runDir, 'voice', 'scene-001.mp3'), 'mp3-bytes')
    fs.rmSync(path.join(runDir, 'voice', 'scene-001.mp3'))
    expect(validateVoice(runDir, UPSTREAM, m).ok).toBe(false) // missing mp3
  })

  it('timeline: Σ durationInFrames === totalFrames, no diagnostics, chain match', () => {
    const m = manifest()
    const project = buildFixtureProject()
    const good = project.timeline
    m.stages.timeline.stageInputs = { paddingSeconds: 0.5, fps: good.fps, width: good.width, height: good.height, voiceScenePolicy: 'strict' }
    const h = stageSourceHash({ upstream: UPSTREAM, stageInputs: m.stages.timeline.stageInputs, payload: good })
    m.stages.timeline.sourceHash = h
    writeJsonArtifact(path.join(runDir, 'master-timeline.json'), { schemaVersion: 'master-1', runId: 'run-1', sourceHash: h }, good)
    expect(validateTimeline(runDir, UPSTREAM, m).ok).toBe(true)

    const broken = { ...good, totalFrames: good.totalFrames + 1 }
    writeJsonArtifact(path.join(runDir, 'master-timeline.json'), { schemaVersion: 'master-1', runId: 'run-1', sourceHash: h }, broken)
    expect(validateTimeline(runDir, UPSTREAM, m).ok).toBe(false)
  })

  it('visual: parseProjectDsl strict acceptance', () => {
    const m = manifest()
    m.stages.visual.stageInputs = { promptVersion: 'visual-prompt-1', seed: demoProjectDsl.seed, style: demoProjectDsl.style, catalogue: { compositions: ['hero'], visual: [], motion: [] } }
    const h = stageSourceHash({ upstream: UPSTREAM, stageInputs: m.stages.visual.stageInputs, payload: demoProjectDsl })
    m.stages.visual.sourceHash = h
    writeJsonArtifact(path.join(runDir, 'project.dsl.json'), { schemaVersion: 'dsl-1', runId: 'run-1', sourceHash: h }, demoProjectDsl)
    expect(validateVisual(runDir, UPSTREAM, m).ok).toBe(true)

    const bad = { ...demoProjectDsl, scenes: [] } // min(1) violated
    writeJsonArtifact(path.join(runDir, 'project.dsl.json'), { schemaVersion: 'dsl-1', runId: 'run-1', sourceHash: h }, bad)
    expect(validateVisual(runDir, UPSTREAM, m).ok).toBe(false)
  })

  it('compiled: every scene file parses and computeCompiledHash recomputes', () => {
    const m = manifest()
    const project = buildFixtureProject()
    const entries = project.compiledScenes.map((s) => ({ sceneId: s.sceneId, compiledHash: s.provenance.compiledHash }))
    m.stages.compile.stageInputs = { engineVersion: ENGINE_VERSION }
    const h = stageSourceHash({ upstream: UPSTREAM, stageInputs: m.stages.compile.stageInputs, payload: entries })
    m.stages.compile.sourceHash = h
    fs.mkdirSync(path.join(runDir, 'compiled'), { recursive: true })
    for (const scene of project.compiledScenes) {
      writeJsonArtifact(path.join(runDir, 'compiled', `${scene.sceneId}.json`), { schemaVersion: 'ir-1', runId: 'run-1', sourceHash: h }, scene)
    }
    expect(validateCompiled(runDir, UPSTREAM, m).ok).toBe(true)

    // corrupt one scene's params so the recomputed hash no longer matches its provenance
    const victim = path.join(runDir, 'compiled', `${project.compiledScenes[0]!.sceneId}.json`)
    const doc = JSON.parse(fs.readFileSync(victim, 'utf8')) as { payload: { layers: unknown[] } }
    doc.payload.layers = []
    fs.writeFileSync(victim, JSON.stringify(doc))
    expect(validateCompiled(runDir, UPSTREAM, m).ok).toBe(false)
  })

  it('renderProps + stale video (spec §9.2)', () => {
    const m = manifest()
    const project = buildFixtureProject()
    const props = { scenes: project.compiledScenes, timeline: project.timeline, voice: null, audioSrcBySceneId: {} }
    m.stages.renderProps.stageInputs = { audioSceneIds: [] }
    const h = stageSourceHash({ upstream: UPSTREAM, stageInputs: m.stages.renderProps.stageInputs, payload: props })
    m.stages.renderProps.sourceHash = h
    writeJsonArtifact(path.join(runDir, 'render-props.json'), { schemaVersion: 'render-props-1', runId: 'run-1', sourceHash: h }, props)
    expect(validateRenderProps(runDir, UPSTREAM, m).ok).toBe(true)

    // video: non-empty file + manifest.render.sourceHash === props hash
    fs.writeFileSync(path.join(runDir, 'video.mp4'), 'fake-mp4-bytes')
    expect(validateVideo(runDir, h)).toEqual({ ok: false, reason: expect.stringContaining('manifest') }) // manifest.render not set yet
    m.render = { sourceHash: h, output: 'video.mp4' }
    expect(validateVideo(runDir, h).ok).toBe(true)                                        // fresh
    expect(validateVideo(runDir, 'x'.repeat(64)).ok).toBe(false)                           // STALE — props changed
    fs.writeFileSync(path.join(runDir, 'video.mp4'), '')                                   // empty file
    m.render = { sourceHash: h, output: 'video.mp4' }
    expect(validateVideo(runDir, h).ok).toBe(false)                                        // empty ≠ done
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai/artifacts.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/ai/artifacts.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { hashObject } from '@/shared'
import { parseProjectDsl } from '@/video-engine/schema'
import { computeCompiledHash } from '@/video-engine/ir'
import { ENGINE_VERSION } from '@/video-engine/version'
import { StoryPlanSchema } from './story/schema'
import type { Brief, StoryPlan } from './story/contract'
import type { AttemptRecord } from './gemini/retry'

export type ArtifactHeader = { schemaVersion: string; runId: string; createdAt: string; sourceHash: string }
export type GenerateStage = 'story' | 'voice' | 'timeline' | 'visual' | 'compile' | 'renderProps' | 'render'
export type StageRecord = { status: 'pending' | 'done' | 'failed'; stageInputs?: Record<string, unknown>; sourceHash?: string; attempts?: AttemptRecord[]; at?: string; error?: string }

export type Manifest = {
  schemaVersion: 'manifest-1'
  runId: string
  createdAt: string
  briefHash: string
  engineVersion: string
  tts: { baseUrl: string; provider: 'tts-studio'; model: 'omnivoice'; voiceId: string; outputFormat: 'mp3'; voiceSettings: { stability: 0.5; similarity_boost: 0.75; style: 0.0; speed: 1.0 }; normalizeText: false }
  asr: { model: string; wordTimestamps: true; durationSource: 'ffprobe'; maxDurationDeltaSeconds: 0.1 }
  retime: { paddingSeconds: number }
  promptVersions: { story: string; visual: string }
  stages: Record<GenerateStage, StageRecord>
  render?: { sourceHash: string; output: 'video.mp4' }
}

/** Plan ruling (spec §7.3): hash commits upstream + stage inputs + payload. */
export function briefHash(brief: Brief): string {
  return hashObject({ upstream: null, stageInputs: {}, payload: brief })
}
export function stageSourceHash(input: { upstream: string; stageInputs: Record<string, unknown>; payload: unknown }): string {
  return hashObject(input)
}

export function writeJsonArtifact(
  filePath: string,
  header: { schemaVersion: string; runId: string; sourceHash: string; createdAt?: string },
  payload: unknown,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const doc: ArtifactHeader & { payload: unknown } = {
    schemaVersion: header.schemaVersion,
    runId: header.runId,
    createdAt: header.createdAt ?? new Date().toISOString(),
    sourceHash: header.sourceHash,
    payload,
  }
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2))
}

export function readJsonArtifact<T>(filePath: string): { header: ArtifactHeader; payload: T } | null {
  try {
    const doc = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<ArtifactHeader> & { payload?: unknown }
    if (typeof doc.sourceHash !== 'string' || typeof doc.runId !== 'string' || typeof doc.schemaVersion !== 'string') return null
    return { header: doc as ArtifactHeader, payload: doc.payload as T }
  } catch {
    return null
  }
}

export function readManifest(runDir: string): Manifest | null {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8')) as Manifest
    if (doc.schemaVersion !== 'manifest-1' || !doc.stages) return null
    return doc
  } catch {
    return null
  }
}
export function writeManifest(runDir: string, manifest: Manifest): void {
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

export function createManifest(input: {
  runId: string; brief: Brief; briefHash: string; paddingSeconds: number
  storyPromptVersion: string; visualPromptVersion: string; asrModel: string; voiceId?: string
}): Manifest {
  const stages = {} as Manifest['stages']
  for (const s of ['story', 'voice', 'timeline', 'visual', 'compile', 'renderProps', 'render'] as GenerateStage[]) {
    stages[s] = { status: 'pending' }
  }
  return {
    schemaVersion: 'manifest-1',
    runId: input.runId,
    createdAt: new Date().toISOString(),
    briefHash: input.briefHash,
    engineVersion: ENGINE_VERSION,
    tts: {
      baseUrl: process.env.TTS_BASE_URL ?? 'http://localhost:8080',
      provider: 'tts-studio',
      model: 'omnivoice',
      voiceId: input.voiceId ?? '',
      outputFormat: 'mp3',
      voiceSettings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, speed: 1.0 },
      normalizeText: false,
    },
    asr: { model: input.asrModel, wordTimestamps: true, durationSource: 'ffprobe', maxDurationDeltaSeconds: 0.1 },
    retime: { paddingSeconds: input.paddingSeconds },
    promptVersions: { story: input.storyPromptVersion, visual: input.visualPromptVersion },
    stages,
  }
}

export type StageValidation = { ok: true; sourceHash: string } | { ok: false; reason: string }

function checkChain(doc: { header: ArtifactHeader } | null, upstream: string, stageInputs: Record<string, unknown>, manifest: Manifest, stage: GenerateStage): StageValidation | null {
  if (!doc) return { ok: false, reason: `${stage}: artifact missing or corrupt` }
  const expected = stageSourceHash({ upstream, stageInputs, payload: (doc as { payload: unknown }).payload })
  if (doc.header.sourceHash !== expected) return { ok: false, reason: `${stage}: sourceHash chain mismatch` }
  const record = manifest.stages[stage]
  if (record.sourceHash !== undefined && record.sourceHash !== expected) return { ok: false, reason: `${stage}: manifest sourceHash differs` }
  return null
}

export function validateStory(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.story.stageInputs
  if (!stageInputs) return { ok: false, reason: 'story: never ran (no stageInputs in manifest)' }
  const doc = readJsonArtifact<StoryPlan>(path.join(runDir, 'story.json'))
  const chain = checkChain(doc, upstream, stageInputs, manifest, 'story')
  if (chain) return chain
  const parsed = StoryPlanSchema.safeParse(doc!.payload)
  if (!parsed.success) return { ok: false, reason: `story: StoryPlanSchema rejected payload — ${parsed.error.issues[0]?.message}` }
  return { ok: true, sourceHash: doc!.header.sourceHash }
}

export function validateVoice(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.voice.stageInputs
  if (!stageInputs) return { ok: false, reason: 'voice: never ran' }
  type VoiceTl = { timingSource?: string; totalMs?: number; segments?: { sceneId: string; endMs: number; words?: unknown[] }[] }
  const doc = readJsonArtifact<VoiceTl>(path.join(runDir, 'voicetimeline.json'))
  const chain = checkChain(doc, upstream, stageInputs, manifest, 'voice')
  if (chain) return chain
  const payload = doc!.payload
  if (!Array.isArray(payload.segments) || payload.segments.length === 0) return { ok: false, reason: 'voice: no segments' }
  for (const seg of payload.segments) {
    if (!seg.sceneId || !Number.isFinite(seg.endMs)) return { ok: false, reason: 'voice: malformed segment' }
    const mp3 = path.join(runDir, 'voice', `${seg.sceneId}.mp3`)
    const stat = fs.existsSync(mp3) ? fs.statSync(mp3) : null
    if (!stat || stat.size === 0) return { ok: false, reason: `voice: missing/empty ${path.basename(mp3)}` }
  }
  return { ok: true, sourceHash: doc!.header.sourceHash }
}

export function validateTimeline(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.timeline.stageInputs
  if (!stageInputs) return { ok: false, reason: 'timeline: never ran' }
  type MasterLike = { totalFrames: number; sceneWindows: Record<string, { durationInFrames: number }>; diagnostics: unknown[] }
  const doc = readJsonArtifact<MasterLike>(path.join(runDir, 'master-timeline.json'))
  const chain = checkChain(doc, upstream, stageInputs, manifest, 'timeline')
  if (chain) return chain
  const t = doc!.payload
  if (!t.sceneWindows || typeof t.totalFrames !== 'number') return { ok: false, reason: 'timeline: malformed' }
  const sum = Object.values(t.sceneWindows).reduce((acc, w) => acc + w.durationInFrames, 0)
  if (sum !== t.totalFrames) return { ok: false, reason: `timeline: Σ durationInFrames ${sum} !== totalFrames ${t.totalFrames}` }
  if (Array.isArray(t.diagnostics) && t.diagnostics.length > 0) return { ok: false, reason: `timeline: ${t.diagnostics.length} diagnostics present` }
  return { ok: true, sourceHash: doc!.header.sourceHash }
}

export function validateVisual(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.visual.stageInputs
  if (!stageInputs) return { ok: false, reason: 'visual: never ran' }
  const doc = readJsonArtifact<unknown>(path.join(runDir, 'project.dsl.json'))
  const chain = checkChain(doc, upstream, stageInputs, manifest, 'visual')
  if (chain) return chain
  try {
    parseProjectDsl(doc!.payload)
  } catch (err) {
    return { ok: false, reason: `visual: parseProjectDsl — ${err instanceof Error ? err.message.slice(0, 200)}` }
  }
  return { ok: true, sourceHash: doc!.header.sourceHash }
}

export function validateCompiled(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.compile.stageInputs
  if (!stageInputs) return { ok: false, reason: 'compile: never ran' }
  const dslDoc = readJsonArtifact<{ scenes: { sceneId: string }[] }>(path.join(runDir, 'project.dsl.json'))
  if (!dslDoc) return { ok: false, reason: 'compile: project.dsl.json missing' }
  const dir = path.join(runDir, 'compiled')
  if (!fs.existsSync(dir)) return { ok: false, reason: 'compile: compiled/ missing' }
  const entries: { sceneId: string; compiledHash: string }[] = []
  for (const scene of dslDoc.payload.scenes) {
    const doc = readJsonArtifact<{ provenance?: { compiledHash?: string } }>(path.join(dir, `${scene.sceneId}.json`))
    if (!doc) return { ok: false, reason: `compile: ${scene.sceneId}.json missing/corrupt` }
    const recomputed = computeCompiledHash(doc.payload as never)
    if (doc.payload.provenance?.compiledHash !== recomputed) return { ok: false, reason: `compile: ${scene.sceneId} compiledHash mismatch` }
    entries.push({ sceneId: scene.sceneId, compiledHash: recomputed })
  }
  const expected = stageSourceHash({ upstream, stageInputs, payload: entries })
  if (manifest.stages.compile.sourceHash !== undefined && manifest.stages.compile.sourceHash !== expected) {
    return { ok: false, reason: 'compile: manifest chain mismatch' }
  }
  // recompute against the artifact payload list (the doc we just rebuilt)
  const stored = path.join(dir, `${dslDoc.payload.scenes[0]?.sceneId}.json`)
  const firstHeader = readJsonArtifact(stored)
  if (firstHeader && firstHeader.header.sourceHash !== expected) return { ok: false, reason: 'compile: scene header chain mismatch' }
  return { ok: true, sourceHash: expected }
}

export function validateRenderProps(runDir: string, upstream: string, manifest: Manifest): StageValidation {
  const stageInputs = manifest.stages.renderProps.stageInputs
  if (!stageInputs) return { ok: false, reason: 'renderProps: never ran' }
  const doc = readJsonArtifact<unknown>(path.join(runDir, 'render-props.json'))
  const chain = checkChain(doc, upstream, stageInputs, manifest, 'renderProps')
  if (chain) return chain
  return { ok: true, sourceHash: doc!.header.sourceHash }
}

/** Spec §7.4 video row: exists + non-empty + manifest.render.sourceHash === current props hash. Never hashes the MP4. */
export function validateVideo(runDir: string, propsSourceHash: string): StageValidation {
  const manifest = readManifest(runDir)
  if (!manifest?.render) return { ok: false, reason: 'render: manifest.render absent (never rendered)' }
  if (manifest.render.sourceHash !== propsSourceHash) return { ok: false, reason: 'render: STALE — manifest.render.sourceHash ≠ render-props sourceHash' }
  const video = path.join(runDir, 'video.mp4')
  const stat = fs.existsSync(video) ? fs.statSync(video) : null
  if (!stat || stat.size === 0) return { ok: false, reason: 'render: video.mp4 missing or empty' }
  return { ok: true, sourceHash: propsSourceHash }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai/artifacts.test.ts && npx tsc --noEmit && npx eslint .`
Expected: PASS / exit 0. If `validateCompiled`'s dual header/manifest check double-counts, keep both assertions (they pin the same chain from two sides) — simplify only if the test proves one path redundant.

- [ ] **Step 5: Commit**

```bash
git add src/ai/artifacts.ts tests/ai/artifacts.test.ts
git commit -m "Task 8 — artifacts: sourceHash chain, manifest, semantic resume validators

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: Orchestrator — `generateProject` through render-props

**Files:**
- Create: `src/ai/generate.ts`
- Modify: `src/ai/index.ts` (export `generateProject`, `GenerateOptions`, `GenerateResult`, `StageError`)
- Test: `tests/ai/generate.test.ts`

**Interfaces:**
- Consumes: Tasks 3–8 (`createRemoteTtsAdapter`, `createGeminiStoryDirector`, `createGeminiVisualDirector`, `retimeScenes`, `buildProject`/`diagnoseScenes`, all validators/manifest helpers), `buildMasterTimeline` (`@/timeline`), `listAvailable` (`@/video-engine/registry` — not on the ai forbidden list), `SCENE_DSL_VERSION`/`parseProjectDsl` (`@/video-engine/schema`), `STORY_PROMPT_VERSION`/`VISUAL_PROMPT_VERSION`.
- Produces:
  ```ts
  export type GenerateStage = 'story' | 'voice' | 'timeline' | 'visual' | 'compile' | 'renderProps' | 'render'
  export type GenerateProgress = { stage: GenerateStage; status: 'start' | 'done' | 'skip' | 'fail'; detail?: string }
  export class StageError extends Error { constructor(readonly stage: GenerateStage, message: string, readonly attempts?: AttemptRecord[]) }
  export type GenerateOptions = {
    brief: { topic: string; targetSeconds: number; language: string }
    runId?: string                      // default: run-YYYYMMDD-HHmmss; must match /^[\w-]+$/
    repoRoot?: string                   // default process.cwd(); tests inject a tmp dir
    voiceId?: string                    // else env TTS_VOICE else first GET /v1/voices entry (stage ② only)
    paddingSeconds?: number             // only used when the manifest is first created (0.5 default)
    adapters?: { story?: StoryDirector; visual?: VisualDirector; tts?: TtsAdapter } // test/counting seam
    fetchImpl?: typeof fetch            // passed to Gemini client + remote TTS + voices lookup
    measureDuration?: (filePath: string) => Promise<number>
    onProgress?: (event: GenerateProgress) => void
  }
  export type GenerateResult = {
    runId: string; dir: string
    videoPath: string | null            // null until Task 11 wires the render stage
    renderPropsPath: string
    story: StoryPlan; voice: VoiceTimeline; timeline: MasterTimeline
    diagnostics: Diagnostic[]
  }
  export function generateProject(options: GenerateOptions): Promise<GenerateResult>
  ```
  **Resume rules pinned:** config values are read from the *manifest* on resume (`retime.paddingSeconds`, `tts.voiceId` when non-empty) so a changed CLI flag cannot silently invalidate a chain — first run wins. `voiceId` HTTP resolution happens **only inside stage ② when the stage actually runs** (spec §9.3's zero-call resume). When `adapters.tts` is injected, no voices HTTP lookup ever happens (`voiceId = opts.voiceId ?? env TTS_VOICE ?? 'injected-voice'`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/ai/generate.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateProject, StageError } from '@/ai/generate'
import { demoProjectDsl } from '@/ai/demo-project.dsl'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import type { StoryDirector, StoryPlan } from '@/ai/story/contract'
import type { VisualDirector, VisualDirectorInput } from '@/ai/visual/contract'
import type { TtsAdapter } from '@/ai/tts/contract'
import type { SceneDsl } from '@/video-engine/schema'
import type { VoiceTimeline } from '@/timeline/voice'
import type { AttemptRecord } from '@/ai/gemini/retry'

const RUN_ID = 'run-unit-1'
const BRIEF = { topic: 'Kiến trúc DeLyAI2', targetSeconds: 10, language: 'vi' }

let repoRoot: string
beforeEach(() => { clearRegistered(); registerBackends(); repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'delyai-gen-')) })
afterEach(() => fs.rmSync(repoRoot, { recursive: true, force: true }))

const STORY: StoryPlan = {
  title: 'Kiến trúc',
  scenes: [
    { id: 'scene-001', purpose: 'hook', durationSeconds: 9, title: 'Mở', narration: 'Xin chào các bạn.' },
    { id: 'scene-002', purpose: 'outro', durationSeconds: 9, title: 'Kết', narration: 'Hẹn gặp lại.' },
  ],
}

function countingStory(): StoryDirector & { calls: number } {
  const self = { calls: 0 }
  return Object.assign(self, {
    async direct(_b: unknown, onAttempt?: (r: AttemptRecord) => void) {
      self.calls++
      onAttempt?.({ attempt: 1, ok: true, at: new Date().toISOString() })
      return structuredClone(STORY)
    },
  })
}

/** Writes real mp3 stubs so validateVoice passes — file existence is part of the contract. */
function countingTts(repo: string, runId: string): TtsAdapter & { calls: number } {
  const self = { calls: 0 }
  const runDir = path.join(repo, 'generated', runId)
  const END_MS: Record<string, number> = { 'scene-001': 2000, 'scene-002': 1500 }
  return Object.assign(self, {
    async synthesize(input: { sceneId: string; text: string; language: string; voice: string }) {
      self.calls++
      const endMs = END_MS[input.sceneId] ?? 1000
      fs.mkdirSync(path.join(runDir, 'voice'), { recursive: true })
      fs.writeFileSync(path.join(runDir, 'voice', `${input.sceneId}.mp3`), `mp3-of-${input.sceneId}`)
      return {
        timingSource: 'exact', totalMs: endMs,
        segments: [{ id: `${input.sceneId}-voice`, text: input.text, startMs: 0, endMs, words: [{ word: 'x', startMs: 0, endMs: endMs - 100 }], timingSource: 'exact', sceneId: input.sceneId, wordTimingSource: 'whisper' }],
      } satisfies VoiceTimeline
    },
  })
}

/** Returns demo scenes re-id'd/retimed to the locked input — valid DSL, compilable. */
function countingVisual(mode: 'ok' | 'always-fail' = 'ok'): VisualDirector & { calls: number } {
  const self = { calls: 0 }
  return Object.assign(self, {
    async direct(input: VisualDirectorInput, onAttempt?: (r: AttemptRecord) => void) {
      self.calls++
      if (mode === 'always-fail') {
        const attempts: AttemptRecord[] = [1, 2, 3].map((n) => ({ attempt: n, ok: false, at: new Date().toISOString(), error: 'visual rejected' }))
        for (const a of attempts) onAttempt?.(a)
        throw Object.assign(new Error('visual: all 3 attempts failed — fake reject'), { name: 'StageRetryExhausted', attempts })
      }
      onAttempt?.({ attempt: 1, ok: true, at: new Date().toISOString() })
      return input.scenes.map((outline, i) => {
        const clone = structuredClone(demoProjectDsl.scenes[i % demoProjectDsl.scenes.length]!) as SceneDsl
        return { ...clone, sceneId: outline.id, duration: outline.durationSeconds, purpose: outline.purpose } as SceneDsl
      })
    },
  })
}

function fakes() {
  return { story: countingStory(), tts: countingTts(repoRoot, RUN_ID), visual: countingVisual() }
}
const adaptersOf = (f: ReturnType<typeof fakes>) => ({ story: f.story, tts: f.tts, visual: f.visual })

describe('generateProject — full pipeline through render-props (spec §3 order)', () => {
  it('writes every artifact with a consistent chain; result carries timeline/voice/story', async () => {
    const f = fakes()
    const progress: string[] = []
    const result = await generateProject({
      brief: BRIEF, runId: RUN_ID, repoRoot,
      adapters: adaptersOf(f),
      onProgress: (e) => progress.push(`${e.stage}:${e.status}`),
    })

    const dir = path.join(repoRoot, 'generated', RUN_ID)
    for (const file of ['brief.json', 'story.json', 'voicetimeline.json', 'master-timeline.json', 'project.dsl.json', 'render-props.json', 'manifest.json']) {
      expect(fs.existsSync(path.join(dir, file)), file).toBe(true)
    }
    expect(fs.readdirSync(path.join(dir, 'compiled')).sort()).toEqual(['scene-001.json', 'scene-002.json'])
    expect(fs.existsSync(path.join(dir, 'voice', 'scene-001.mp3'))).toBe(true)

    // pipeline order visible in progress events (spec §3)
    const starts = progress.filter((p) => p.endsWith(':start')).map((p) => p.split(':')[0])
    expect(starts).toEqual(['story', 'voice', 'timeline', 'visual', 'compile', 'renderProps'])

    // audio authority: durations = endMs/1000 + 0.5
    expect(result.story.scenes.map((s) => s.id)).toEqual(['scene-001', 'scene-002'])
    expect(result.voice.segments.map((s) => s.endMs)).toEqual([2000, 1500])
    expect(result.timeline.sceneWindows['scene-001']!.durationInFrames).toBe(75)  // 2.5s @30
    expect(result.timeline.sceneWindows['scene-002']!.durationInFrames).toBe(60)  // 2.0s @30
    expect(result.timeline.diagnostics).toEqual([])                               // zero voice warnings by construction
    expect(result.videoPath).toBeNull()                                           // render stage lands in Task 11

    // render-props carries props + header (spec §7.2)
    const propsDoc = JSON.parse(fs.readFileSync(path.join(dir, 'render-props.json'), 'utf8'))
    expect(propsDoc).toMatchObject({ runId: RUN_ID, sourceHash: expect.any(String) })
    expect(propsDoc.payload.scenes).toHaveLength(2)
    expect(propsDoc.payload.audioSrcBySceneId).toEqual({
      'scene-001': `generated/${RUN_ID}/voice/scene-001.mp3`,
      'scene-002': `generated/${RUN_ID}/voice/scene-002.mp3`,
    })
    expect(propsDoc.payload.voice.segments[0].wordTimingSource).toBe('whisper')

    // manifest records §5.2 config + per-stage attempts
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    expect(manifest.tts).toMatchObject({ provider: 'tts-studio', model: 'omnivoice', voiceId: 'injected-voice', outputFormat: 'mp3', normalizeText: false })
    expect(manifest.retime.paddingSeconds).toBe(0.5)
    expect(manifest.stages.story.attempts).toHaveLength(1)
    expect(manifest.stages.story.status).toBe('done')
    expect(manifest.engineVersion).toBe('0.1.0')

    // call counts for the run: 1 story, 2 TTS, 1 visual
    expect([f.story.calls, f.tts.calls, f.visual.calls]).toEqual([1, 2, 1])
  })
})

describe('generateProject — resume token-saving (spec §9.2)', () => {
  it('valid upstream ⇒ zero story/TTS/visual calls; every stage reports skip', async () => {
    const f = fakes()
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f) })
    expect([f.story.calls, f.tts.calls, f.visual.calls]).toEqual([1, 2, 1])

    const progress: string[] = []
    await generateProject({
      brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f),
      onProgress: (e) => progress.push(`${e.stage}:${e.status}`),
    })
    expect([f.story.calls, f.tts.calls, f.visual.calls]).toEqual([1, 2, 1]) // UNCHANGED — 0 new calls
    expect(progress.filter((p) => p.endsWith(':skip'))).toEqual([
      'story:skip', 'voice:skip', 'timeline:skip', 'visual:skip', 'compile:skip', 'renderProps:skip',
    ])
    expect(progress.filter((p) => p.endsWith(':start'))).toEqual([])
  })

  it('run #1 Visual fails 3 attempts → resume: Story/TTS counts unchanged, Visual retried (spec §9.2)', async () => {
    const f = { story: countingStory(), tts: countingTts(repoRoot, RUN_ID), visual: countingVisual('always-fail') }
    await expect(generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f) }))
      .rejects.toBeInstanceOf(StageError)
    expect([f.story.calls, f.tts.calls, f.visual.calls]).toEqual([1, 2, 3])
    const failedManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'generated', RUN_ID, 'manifest.json'), 'utf8'))
    expect(failedManifest.stages.visual.status).toBe('failed')
    expect(failedManifest.stages.visual.attempts).toHaveLength(3)

    f.visual = countingVisual('ok') // second attempt: the director is fixed
    const result = await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f) })
    expect([f.story.calls, f.tts.calls]).toEqual([1, 2])     // ZERO new story/TTS calls
    expect(f.visual.calls).toBe(1)                            // visual retried from scratch
    expect(result.timeline.sceneWindows['scene-001']!.durationInFrames).toBe(75)
  })

  it('corrupt-but-existing story.json is NOT done — story re-runs (Review Focus 2)', async () => {
    const f = fakes()
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f) })
    const storyPath = path.join(repoRoot, 'generated', RUN_ID, 'story.json')
    fs.writeFileSync(storyPath, '{"truncated": ')
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f) })
    expect(f.story.calls).toBe(2)  // re-ran
    expect(f.tts.calls).toBe(4)    // new story hash invalidates voice (§7.3) — re-ran too
  })

  it('same runId with a DIFFERENT brief is a hard failure (no silent resume)', async () => {
    const f = fakes()
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f) })
    await expect(generateProject({ brief: { ...BRIEF, topic: 'KHÁC' }, runId: RUN_ID, repoRoot, adapters: adaptersOf(f) }))
      .rejects.toThrow(/BRIEF_MISMATCH/)
  })
})

describe('generateProject — failure semantics', () => {
  it('a TTS failure is a hard run failure with the stage recorded (no estimated fallback, spec §3)', async () => {
    const f = fakes()
    const broken: TtsAdapter = { async synthesize() { throw new Error('TTS_HTTP_500') } }
    const err = await generateProject({
      brief: BRIEF, runId: RUN_ID, repoRoot,
      adapters: { story: f.story, visual: f.visual, tts: broken },
    }).catch((e) => e as StageError)
    expect(err).toBeInstanceOf(StageError)
    expect((err as StageError).stage).toBe('voice')
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'generated', RUN_ID, 'manifest.json'), 'utf8'))
    expect(manifest.stages.voice.status).toBe('failed')
    expect(manifest.stages.voice.error).toContain('TTS_HTTP_500')
    expect(manifest.stages.story.status).toBe('done')
  })

  it('rejects runIds that are not path-safe (Review Focus 5 — spawn/path injection)', async () => {
    await expect(generateProject({ brief: BRIEF, runId: 'bad id/..\\x', repoRoot, adapters: adaptersOf(fakes()) }))
      .rejects.toThrow(/RUN_ID_INVALID/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai/generate.test.ts`
Expected: FAIL — `@/ai/generate` does not exist.

- [ ] **Step 3: Implement `src/ai/generate.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { Brief, StoryDirector, StoryPlan } from './story/contract'
import type { VisualDirector } from './visual/contract'
import type { TtsAdapter } from './tts/contract'
import type { VoiceTimeline } from '@/timeline/voice'
import type { MasterTimeline } from '@/timeline/master'
import type { Diagnostic } from '@/timeline/diagnostics'
import { SCENE_DSL_VERSION, parseProjectDsl, type CompositionId, type SceneDsl, type ProjectDsl } from '@/video-engine/schema'
import { buildMasterTimeline } from '@/timeline/master'
import { listAvailable } from '@/video-engine/registry'
import { buildProject, diagnoseScenes } from './project'
import { retimeScenes, RETIME_PADDING_SECONDS } from './retime'
import { createRemoteTtsAdapter, createGeminiStoryDirector, createGeminiVisualDirector } from './index-helpers' // ← see note below
import { STORY_PROMPT_VERSION } from './gemini/prompts/story'
import { VISUAL_PROMPT_VERSION } from './gemini/prompts/visual'
import type { AttemptRecord } from './gemini/retry'
import {
  briefHash, stageSourceHash, createManifest, readManifest, writeManifest,
  writeJsonArtifact, readJsonArtifact,
  validateStory, validateVoice, validateTimeline, validateVisual, validateCompiled, validateRenderProps,
  type Manifest, type GenerateStage,
} from './artifacts'

export type { GenerateStage }
export type GenerateProgress = { stage: GenerateStage; status: 'start' | 'done' | 'skip' | 'fail'; detail?: string }

export class StageError extends Error {
  constructor(readonly stage: GenerateStage, message: string, readonly attempts?: AttemptRecord[]) {
    super(`[${stage}] ${message}`); this.name = 'StageError'
  }
}

const RENDER_DEFAULTS = { fps: 30, width: 1920, height: 1080 } // matches the Phase 0 demo; spec §8 exposes no flags
const RUN_ID_PATTERN = /^[\w-]+$/

export type GenerateOptions = {
  brief: Brief
  runId?: string
  repoRoot?: string
  voiceId?: string
  paddingSeconds?: number
  adapters?: { story?: StoryDirector; visual?: VisualDirector; tts?: TtsAdapter }
  fetchImpl?: typeof fetch
  measureDuration?: (filePath: string) => Promise<number>
  onProgress?: (event: GenerateProgress) => void
}

export type GenerateResult = {
  runId: string; dir: string
  videoPath: string | null
  renderPropsPath: string
  story: StoryPlan; voice: VoiceTimeline; timeline: MasterTimeline
  diagnostics: Diagnostic[]
}

export async function generateProject(options: GenerateOptions): Promise<GenerateResult> {
  const repoRoot = options.repoRoot ?? process.cwd()
  const brief = options.brief
  const progress = options.onProgress ?? (() => undefined)

  // ---- run identity ------------------------------------------------------
  const runId = options.runId ?? `run-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
  if (!RUN_ID_PATTERN.test(runId)) throw new StageError('story', `RUN_ID_INVALID: "${runId}" must match /^[\w-]+$/`)
  const dir = path.join(repoRoot, 'generated', runId)
  fs.mkdirSync(dir, { recursive: true })

  // ---- brief artifact (identity of the run) ------------------------------
  const bHash = briefHash(brief)
  const briefPath = path.join(dir, 'brief.json')
  const existingBrief = readJsonArtifact<Brief>(briefPath)
  if (existingBrief) {
    if (JSON.stringify(existingBrief.payload) !== JSON.stringify(brief)) {
      throw new StageError('story', `BRIEF_MISMATCH: run "${runId}" belongs to a different brief`)
    }
  } else {
    writeJsonArtifact(briefPath, { schemaVersion: 'brief-1', runId, sourceHash: bHash }, brief)
  }

  // ---- manifest ----------------------------------------------------------
  let manifest = readManifest(dir)
  if (!manifest) {
    manifest = createManifest({
      runId, brief, briefHash: bHash,
      paddingSeconds: options.paddingSeconds ?? RETIME_PADDING_SECONDS, // first run wins; resume reads the manifest
      storyPromptVersion: STORY_PROMPT_VERSION, visualPromptVersion: VISUAL_PROMPT_VERSION,
      asrModel: process.env.WHISPER_MODEL ?? 'medium',
      voiceId: options.voiceId ?? process.env.TTS_VOICE ?? '',
    })
    writeManifest(dir, manifest)
  }
  const stageInputsOf = (stage: GenerateStage): Record<string, unknown> | undefined => manifest!.stages[stage].stageInputs

  // Explicit type annotation is REQUIRED: TypeScript only applies never-returning
  // call narrowing (definite assignment of `story`/`voice`/…) when a const-bound
  // function carries an explicit type annotation, not just a return type.
  const failStage: (stage: GenerateStage, err: unknown, attempts?: AttemptRecord[]) => never = (stage, err, attempts) => {
    manifest!.stages[stage] = {
      ...manifest!.stages[stage],
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      attempts: attempts ?? (err as { attempts?: AttemptRecord[] })?.attempts,
      at: new Date().toISOString(),
    }
    writeManifest(dir, manifest!)
    progress({ stage, status: 'fail', detail: manifest!.stages[stage].error })
    if (err instanceof StageError) throw err
    throw new StageError(stage, err instanceof Error ? err.message : String(err), attempts)
  }

  let upstream = bHash

  // ---- ① story -----------------------------------------------------------
  const storyInputs = { promptVersion: STORY_PROMPT_VERSION }
  const storyValid = stageInputsOf('story') ? validateStory(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  let story: StoryPlan
  if (storyValid.ok) {
    story = readJsonArtifact<StoryPlan>(path.join(dir, 'story.json'))!.payload
    upstream = storyValid.sourceHash
    progress({ stage: 'story', status: 'skip' })
  } else {
    progress({ stage: 'story', status: 'start', detail: storyValid.reason })
    try {
      const director = options.adapters?.story ?? createGeminiStoryDirector({ fetchImpl: options.fetchImpl })
      const attempts: AttemptRecord[] = []
      story = await director.direct(brief, (r) => attempts.push(r))
      const sourceHash = stageSourceHash({ upstream, stageInputs: storyInputs, payload: story })
      writeJsonArtifact(path.join(dir, 'story.json'), { schemaVersion: 'story-1', runId, sourceHash }, story)
      manifest.stages.story = { status: 'done', stageInputs: storyInputs, sourceHash, attempts, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'story', status: 'done' })
    } catch (err) { failStage('story', err) }
  }

  // ---- ② voice (TTS + ASR per scene) -------------------------------------
  const voiceInputsFromManifest = (): Record<string, unknown> => ({
    tts: {
      modelId: 'omnivoice', voiceId: manifest!.tts.voiceId || 'injected-voice',
      outputFormat: 'mp3', voiceSettings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, speed: 1.0 }, normalizeText: false,
    },
    asr: { model: manifest!.asr.model, wordTimestamps: true },
  })
  const voiceValid = stageInputsOf('voice') ? validateVoice(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  let voice: VoiceTimeline
  if (voiceValid.ok) {
    voice = readJsonArtifact<VoiceTimeline>(path.join(dir, 'voicetimeline.json'))!.payload
    upstream = voiceValid.sourceHash
    progress({ stage: 'voice', status: 'skip' })
  } else {
    progress({ stage: 'voice', status: 'start', detail: voiceValid.reason })
    try {
      const injected = options.adapters?.tts
      let voiceId = manifest.tts.voiceId || options.voiceId || process.env.TTS_VOICE || ''
      if (!injected && !voiceId) {
        // resolve lazily, ONLY when this stage runs (spec §9.3 zero-call resume)
        const baseUrl = process.env.TTS_BASE_URL ?? 'http://localhost:8080'
        const apiKey = process.env.TTS_API_KEY
        if (!apiKey) throw new Error('TTS_API_KEY is not set (put it in .env — never in code)')
        const res = await (options.fetchImpl ?? fetch)(`${baseUrl}/v1/voices`, { headers: { 'x-api-key': apiKey } })
        if (!res.ok) throw new Error(`TTS_VOICES_HTTP_${res.status}`)
        const data = (await res.json()) as { voices?: { voice_id?: string }[] }
        voiceId = data.voices?.[0]?.voice_id ?? ''
        if (!voiceId) throw new Error('TTS_NO_VOICES: GET /v1/voices returned no voices')
      }
      if (!injected && !process.env.TTS_API_KEY) throw new Error('TTS_API_KEY is not set (put it in .env — never in code)')
      manifest.tts.voiceId = voiceId || 'injected-voice'
      writeManifest(dir, manifest)

      const baseUrl = process.env.TTS_BASE_URL ?? 'http://localhost:8080'
      const tts: TtsAdapter = injected ?? createRemoteTtsAdapter({
        baseUrl,
        apiKey: process.env.TTS_API_KEY ?? '',
        voiceId: manifest.tts.voiceId,
        outDir: path.join(dir, 'voice'),
        fetchImpl: options.fetchImpl,
        measureDuration: options.measureDuration,
      })
      const parts: VoiceTimeline[] = []
      for (const scene of story.scenes) {
        parts.push(await tts.synthesize({ text: scene.narration, language: brief.language, voice: manifest.tts.voiceId, sceneId: scene.id }))
      }
      voice = mergeVoiceTimelines(parts)
      const stageInputs = voiceInputsFromManifest()
      const sourceHash = stageSourceHash({ upstream, stageInputs, payload: voice })
      writeJsonArtifact(path.join(dir, 'voicetimeline.json'), { schemaVersion: 'voice-1', runId, sourceHash }, voice)
      manifest.stages.voice = { status: 'done', stageInputs, sourceHash, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'voice', status: 'done' })
    } catch (err) { failStage('voice', err) }
  }

  // ---- ③ retime + ④ master timeline --------------------------------------
  const padding = manifest.retime.paddingSeconds
  const retimed = retimeScenes(story.scenes, voice, padding)
  const timelineInputs = { paddingSeconds: padding, fps: RENDER_DEFAULTS.fps, width: RENDER_DEFAULTS.width, height: RENDER_DEFAULTS.height, voiceScenePolicy: 'strict' }
  const timelineValid = stageInputsOf('timeline') ? validateTimeline(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  let timeline: MasterTimeline
  if (timelineValid.ok) {
    timeline = readJsonArtifact<MasterTimeline>(path.join(dir, 'master-timeline.json'))!.payload
    upstream = timelineValid.sourceHash
    progress({ stage: 'timeline', status: 'skip' })
  } else {
    progress({ stage: 'timeline', status: 'start', detail: timelineValid.reason })
    try {
      timeline = buildMasterTimeline({
        fps: RENDER_DEFAULTS.fps, width: RENDER_DEFAULTS.width, height: RENDER_DEFAULTS.height,
        scenes: retimed.map((s) => ({ sceneId: s.id, duration: s.durationSeconds })),
        voice, music: null, voiceScenePolicy: 'strict',
      })
      if (timeline.diagnostics.length > 0) {
        throw new Error(`TIMELINE_DIAGNOSTICS: ${timeline.diagnostics.map((d) => d.code).join(', ')} — retime/strict construction violated (spec §3)`)
      }
      const sourceHash = stageSourceHash({ upstream, stageInputs: timelineInputs, payload: timeline })
      writeJsonArtifact(path.join(dir, 'master-timeline.json'), { schemaVersion: 'master-1', runId, sourceHash }, timeline)
      manifest.stages.timeline = { status: 'done', stageInputs: timelineInputs, sourceHash, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'timeline', status: 'done' })
    } catch (err) { failStage('timeline', err) }
  }

  // ---- ⑤ visual (locked windows + catalogue) -----------------------------
  const catalogue = listAvailable()
  const seed = Number.parseInt(briefHash(brief).slice(0, 8), 16) % 2147483647
  const style: ProjectDsl['style'] = { styleId: 'default' }
  const visualInputs = {
    promptVersion: VISUAL_PROMPT_VERSION,
    seed,
    style,
    catalogue: {
      compositions: catalogue.composition.map((c) => c.id),
      visual: catalogue.visual.map((r) => r.id),
      motion: catalogue.motion.map((r) => r.id),
    },
  }
  const visualValid = stageInputsOf('visual') ? validateVisual(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  let dsl: ProjectDsl
  if (visualValid.ok) {
    dsl = readJsonArtifact<ProjectDsl>(path.join(dir, 'project.dsl.json'))!.payload
    upstream = visualValid.sourceHash
    progress({ stage: 'visual', status: 'skip' })
  } else {
    progress({ stage: 'visual', status: 'start', detail: visualValid.reason })
    try {
      const director = options.adapters?.visual ?? createGeminiVisualDirector({
        diagnose: (scenes: SceneDsl[]) => diagnoseScenes(scenes, timeline),
        fetchImpl: options.fetchImpl,
      })
      const attempts: AttemptRecord[] = []
      const scenes = await director.direct({
        topic: brief.topic,
        language: brief.language,
        scenes: retimed,
        availableCompositions: catalogue.composition.map((c) => c.id) as CompositionId[],
        availableVisualRecipes: catalogue.visual,
        availableMotionRecipes: catalogue.motion,
        style,
        assets: [],
        timelineWindow: { startSeconds: 0, durationSeconds: timeline.totalFrames / RENDER_DEFAULTS.fps },
        constraints: {},
        sceneWindows: timeline.sceneWindows,
        fps: RENDER_DEFAULTS.fps,
      }, (r) => attempts.push(r))
      const candidate: ProjectDsl = {
        dslVersion: SCENE_DSL_VERSION,
        project: { id: runId, title: story.title, language: brief.language },
        render: { ...RENDER_DEFAULTS },
        style,
        seed,
        voiceScenePolicy: 'strict',
        music: null,
        scenes,
      }
      dsl = parseProjectDsl(candidate) // final strict guard
      const sourceHash = stageSourceHash({ upstream, stageInputs: visualInputs, payload: dsl })
      writeJsonArtifact(path.join(dir, 'project.dsl.json'), { schemaVersion: 'dsl-1', runId, sourceHash }, dsl)
      manifest.stages.visual = { status: 'done', stageInputs: visualInputs, sourceHash, attempts, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'visual', status: 'done' })
    } catch (err) { failStage('visual', err) }
  }

  // ---- ⑥ compile (via buildProject — the only compiler path, spec §8) -----
  const compileInputs = { engineVersion: manifest.engineVersion }
  const compileValid = stageInputsOf('compile') ? validateCompiled(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  if (compileValid.ok) {
    upstream = compileValid.sourceHash
    progress({ stage: 'compile', status: 'skip' })
  } else {
    progress({ stage: 'compile', status: 'start', detail: compileValid.reason })
    try {
      const built = buildProject({ dsl, voice })
      if (built.timeline.totalFrames !== timeline.totalFrames) {
        throw new Error(`COMPILE_TIMELINE_MISMATCH: compiled ${built.timeline.totalFrames} ≠ locked ${timeline.totalFrames}`)
      }
      const entries = built.compiledScenes.map((s) => ({ sceneId: s.sceneId, compiledHash: s.provenance.compiledHash }))
      const sourceHash = stageSourceHash({ upstream, stageInputs: compileInputs, payload: entries })
      fs.mkdirSync(path.join(dir, 'compiled'), { recursive: true })
      for (const scene of built.compiledScenes) {
        writeJsonArtifact(path.join(dir, 'compiled', `${scene.sceneId}.json`), { schemaVersion: 'ir-1', runId, sourceHash }, scene)
      }
      manifest.stages.compile = { status: 'done', stageInputs: compileInputs, sourceHash, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'compile', status: 'done' })
    } catch (err) { failStage('compile', err) }
  }
  const compiledScenes = readCompiledScenes(dir)

  // ---- ⑥b render-props.json (header + props, spec §7.2) ------------------
  const audioSrcBySceneId = Object.fromEntries(voice.segments.map((s) => [s.sceneId, `generated/${runId}/voice/${s.sceneId}.mp3`]))
  const propsPayload = { scenes: compiledScenes, timeline, voice, audioSrcBySceneId }
  const propsInputs = { audioSceneIds: voice.segments.map((s) => s.sceneId).sort() }
  const propsValid = stageInputsOf('renderProps') ? validateRenderProps(dir, upstream, manifest) : { ok: false as const, reason: 'never ran' }
  if (propsValid.ok) {
    upstream = propsValid.sourceHash
    progress({ stage: 'renderProps', status: 'skip' })
  } else {
    progress({ stage: 'renderProps', status: 'start', detail: propsValid.reason })
    try {
      const sourceHash = stageSourceHash({ upstream, stageInputs: propsInputs, payload: propsPayload })
      writeJsonArtifact(path.join(dir, 'render-props.json'), { schemaVersion: 'render-props-1', runId, sourceHash }, propsPayload)
      manifest.stages.renderProps = { status: 'done', stageInputs: propsInputs, sourceHash, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      upstream = sourceHash
      progress({ stage: 'renderProps', status: 'done' })
    } catch (err) { failStage('renderProps', err) }
  }

  // The render stage (video.mp4 + manifest.render) is added by Task 11; up to
  // render-props the run is complete and `videoPath` stays null.

  return {
    runId, dir,
    videoPath: null,
    renderPropsPath: path.join(dir, 'render-props.json'),
    story, voice, timeline,
    diagnostics: timeline.diagnostics,
  }
}

/** Scene-relative segments concatenated; totalMs = Σ endMs (total voiced ms across scenes). */
export function mergeVoiceTimelines(parts: VoiceTimeline[]): VoiceTimeline {
  const segments = parts.flatMap((p) => p.segments)
  if (segments.some((s) => s.timingSource !== 'exact')) throw new Error('VOICE_TIMING_SOURCE_MIXED: every part must be exact')
  return { timingSource: 'exact', totalMs: segments.reduce((acc, s) => acc + s.endMs, 0), segments }
}

function readCompiledScenes(dir: string) {
  const dslDoc = readJsonArtifact<{ scenes: { sceneId: string }[] }>(path.join(dir, 'project.dsl.json'))
  if (!dslDoc) throw new StageError('compile', 'project.dsl.json missing after compile stage')
  return dslDoc.payload.scenes.map((s) => {
    const doc = readJsonArtifact<never>(path.join(dir, 'compiled', `${s.sceneId}.json`))
    if (!doc) throw new StageError('compile', `compiled/${s.sceneId}.json missing`)
    return doc.payload
  })
}
```

**Import note:** replace the `./index-helpers` import line with direct imports — `import { createRemoteTtsAdapter } from './tts/remote'`, `import { createGeminiStoryDirector } from './gemini/story-director'`, `import { createGeminiVisualDirector } from './gemini/visual-director'` (importing `./index` would be circular once `index.ts` re-exports `generateProject`).

Export from `src/ai/index.ts`: `export { generateProject, StageError } from './generate'` plus `export type { GenerateOptions, GenerateResult, GenerateProgress, GenerateStage } from './generate'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ai/generate.test.ts && npx tsc --noEmit && npx eslint .`
Expected: PASS / exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/ai/generate.ts src/ai/index.ts tests/ai/generate.test.ts
git commit -m "Task 9 — orchestrator: stage chain, semantic resume, zero-call skip, manifest accounting

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: Runtime VoiceTrack + props-driven composition

**Files:**
- Create: `src/video-engine/runtime/VoiceTrack.tsx`
- Modify: `src/video-engine/runtime/ProjectVideo.tsx`
- Modify: `src/video-engine/runtime/index.ts`
- Modify: `remotion/Root.tsx`
- Modify: `remotion/DemoComposition.tsx`
- Test: `tests/runtime/voice-track.test.ts` (new), `tests/demo/composition.test.ts` (extend)

**Interfaces:**
- Consumes: `VoiceTimeline` + `SceneWindow` types from `@/timeline` (runtime → timeline is allowed), Remotion `Sequence`/`Audio`/`staticFile`.
- Produces:
  ```ts
  // runtime/VoiceTrack.tsx
  export type VoiceTrackProps = {
    voice: VoiceTimeline | null
    sceneWindows: MasterTimeline['sceneWindows']
    audioSrcBySceneId: Record<string, string>
    resolveSrc?: (repoRelativePath: string) => string  // default identity; DemoComposition passes staticFile
  }
  export const VoiceTrack: React.FC<VoiceTrackProps>
  // ProjectVideoProps — two optional props ADDED (spec §9.1), nothing removed:
  //   voice?: VoiceTimeline | null ; audioSrcBySceneId?: Record<string, string> ; resolveAudioSrc?: (p: string) => string
  // remotion/Root: defaultProps (fixture project) + calculateMetadata deriving fps/w/h/duration from props.timeline
  ```
  **Runtime rules (spec §9.1):** consumes `sceneWindows` + `audioSrcBySceneId` + `voice` only; missing window → skip the segment (the master already emitted `VOICE_UNKNOWN_SCENE`); missing `audioSrcBySceneId` entry → **throw** (loud invariant violation, not a fallback); no retime, no duration resolution, no audio fallback.

- [ ] **Step 1: Write the failing VoiceTrack test**

```ts
// tests/runtime/voice-track.test.ts
import { describe, it, expect } from 'vitest'
import { VoiceTrack } from '@/video-engine/runtime/VoiceTrack'
import type { VoiceTimeline } from '@/timeline/voice'
import type { MasterTimeline } from '@/timeline/master'

const windows: MasterTimeline['sceneWindows'] = {
  'scene-001': { startFrame: 0, durationInFrames: 75 },
  'scene-002': { startFrame: 75, durationInFrames: 60 },
}
const voice: VoiceTimeline = {
  timingSource: 'exact', totalMs: 3500,
  segments: [
    { id: 'scene-001-voice', text: 'a', startMs: 0, endMs: 2000, words: [], timingSource: 'exact', sceneId: 'scene-001' },
    { id: 'scene-002-voice', text: 'b', startMs: 0, endMs: 1500, words: [], timingSource: 'exact', sceneId: 'scene-002' },
  ],
}
type El = { type: unknown; props: { from?: number; durationInFrames?: number; src?: string; children?: El | El[] } }
const flatten = (children: El | El[]): El[] => (Array.isArray(children) ? children : [children])

describe('VoiceTrack', () => {
  it('renders one Sequence per segment, anchored at the scene window (spec §9.1)', () => {
    const tree = VoiceTrack({ voice, sceneWindows: windows, audioSrcBySceneId: {
      'scene-001': 'generated/r/voice/scene-001.mp3', 'scene-002': 'generated/r/voice/scene-002.mp3',
    } }) as unknown as El
    const seqs = flatten(tree.props.children!)
    expect(seqs).toHaveLength(2)
    expect(seqs[0]!.props.from).toBe(0)
    expect(seqs[0]!.props.durationInFrames).toBe(75)
    expect(seqs[1]!.props.from).toBe(75)
    expect(seqs[1]!.props.durationInFrames).toBe(60)
    // inner Audio receives the resolved path
    const audio = flatten(seqs[0]!.props.children!)[0]!
    expect(audio.props.src).toBe('generated/r/voice/scene-001.mp3') // identity resolver by default
  })

  it('applies resolveSrc (the staticFile adapter on the render side)', () => {
    const tree = VoiceTrack({
      voice, sceneWindows: windows,
      audioSrcBySceneId: { 'scene-001': 'generated/r/voice/scene-001.mp3', 'scene-002': 'generated/r/voice/scene-002.mp3' },
      resolveSrc: (p) => `/${p}`,
    }) as unknown as El
    const seqs = flatten(tree.props.children!)
    const audio = flatten(seqs[0]!.props.children!)[0]!
    expect(audio.props.src).toBe('/generated/r/voice/scene-001.mp3')
  })

  it('voice=null renders nothing', () => {
    expect(VoiceTrack({ voice: null, sceneWindows: windows, audioSrcBySceneId: {} })).toBeNull()
  })

  it('a segment whose window is unknown is SKIPPED (master owns VOICE_UNKNOWN_SCENE)', () => {
    const stray: VoiceTimeline = { ...voice, segments: [...voice.segments, { id: 'x', text: 'c', startMs: 0, endMs: 100, words: [], timingSource: 'exact', sceneId: 'scene-999' }] }
    const tree = VoiceTrack({ voice: stray, sceneWindows: windows, audioSrcBySceneId: {
      'scene-001': 'a.mp3', 'scene-002': 'b.mp3', 'scene-999': 'c.mp3',
    } }) as unknown as El
    expect(flatten(tree.props.children!)).toHaveLength(2) // stray skipped, not invented
  })

  it('a MISSING audioSrc for a known segment THROWS (loud invariant, no silent fallback)', () => {
    expect(() => VoiceTrack({
      voice, sceneWindows: windows,
      audioSrcBySceneId: { 'scene-001': 'a.mp3' }, // scene-002 missing
    })).toThrow(/missing audioSrc.*scene-002/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/runtime/voice-track.test.ts`
Expected: FAIL — `VoiceTrack` does not exist.

- [ ] **Step 3: Implement `src/video-engine/runtime/VoiceTrack.tsx`**

```tsx
import React from 'react'
import { Audio, Sequence } from 'remotion'
import type { VoiceTimeline } from '@/timeline/voice'
import type { MasterTimeline } from '@/timeline/master'

export type VoiceTrackProps = {
  voice: VoiceTimeline | null
  sceneWindows: MasterTimeline['sceneWindows']
  audioSrcBySceneId: Record<string, string>
  /** Render-side adapter (staticFile on the Remotion side; identity in tests/Player). */
  resolveSrc?: (repoRelativePath: string) => string
}

/**
 * One <Sequence><Audio/></Sequence> per voice segment, anchored at the scene's
 * locked window. The renderer consumes data only — no retime, no duration
 * resolution, no audio fallback (spec §9.1, AGENTS.md rule 5).
 */
export const VoiceTrack: React.FC<VoiceTrackProps> = ({ voice, sceneWindows, audioSrcBySceneId, resolveSrc = (p) => p }) => {
  if (!voice || voice.segments.length === 0) return null
  return (
    <>
      {voice.segments.map((segment) => {
        const window = sceneWindows[segment.sceneId]
        if (!window) return null // master emitted VOICE_UNKNOWN_SCENE — never invent a window
        const src = audioSrcBySceneId[segment.sceneId]
        if (!src) throw new Error(`VoiceTrack: missing audioSrc for scene "${segment.sceneId}"`)
        return (
          <Sequence key={segment.id} from={window.startFrame} durationInFrames={window.durationInFrames}>
            <Audio src={resolveSrc(src)} />
          </Sequence>
        )
      })}
    </>
  )
}
```

- [ ] **Step 4: Wire ProjectVideo + runtime barrel**

`src/video-engine/runtime/ProjectVideo.tsx`:

```tsx
import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import type { CompiledScene } from '@/video-engine/ir'
import type { MasterTimeline } from '@/timeline/master'
import type { VoiceTimeline } from '@/timeline/voice'
import { SceneRenderer } from './SceneRenderer'
import { VoiceTrack } from './VoiceTrack'

export type ProjectVideoProps = {
  scenes: CompiledScene[]
  timeline: MasterTimeline
  voice?: VoiceTimeline | null
  audioSrcBySceneId?: Record<string, string>
  resolveAudioSrc?: (repoRelativePath: string) => string
}

/** Master composition: sequences each compiled scene at its absolute window, voice rides on top. */
export const ProjectVideo: React.FC<ProjectVideoProps> = ({ scenes, timeline, voice, audioSrcBySceneId, resolveAudioSrc }) => (
  <AbsoluteFill style={{ backgroundColor: '#05070d' }}>
    {scenes.map((scene) => (
      <Sequence key={scene.sceneId} from={scene.timing.startFrame} durationInFrames={scene.timing.durationInFrames} premountFor={timeline.fps}>
        <SceneRenderer scene={scene} />
      </Sequence>
    ))}
    <VoiceTrack
      voice={voice ?? null}
      sceneWindows={timeline.sceneWindows}
      audioSrcBySceneId={audioSrcBySceneId ?? {}}
      resolveSrc={resolveAudioSrc}
    />
  </AbsoluteFill>
)
```

`src/video-engine/runtime/index.ts` — add:

```ts
export { VoiceTrack } from './VoiceTrack'
export type { VoiceTrackProps } from './VoiceTrack'
```

- [ ] **Step 5: Make the composition props-driven**

`remotion/Root.tsx`:

```tsx
import React from 'react'
import { Composition } from 'remotion'
import { DemoComposition } from './DemoComposition'
import { demoProject } from './project'
import type { ProjectVideoProps } from '@/video-engine/runtime'

const { timeline } = demoProject

const defaultProps: ProjectVideoProps = {
  scenes: demoProject.compiledScenes,
  timeline: demoProject.timeline,
  voice: null,
  audioSrcBySceneId: undefined,
}

/**
 * Every metadata field derives from props.timeline: static values feed the
 * Phase 0 fixture, calculateMetadata re-derives them for --props runs (spec §8).
 */
export const RemotionRoot: React.FC = () => (
  <Composition
    id="DeLyDemo"
    component={DemoComposition}
    durationInFrames={timeline.totalFrames}
    fps={timeline.fps}
    width={timeline.width}
    height={timeline.height}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.timeline.totalFrames,
      fps: props.timeline.fps,
      width: props.timeline.width,
      height: props.timeline.height,
    })}
  />
)
```

`remotion/DemoComposition.tsx`:

```tsx
import React from 'react'
import { staticFile } from 'remotion'
import { ProjectVideo, type ProjectVideoProps } from '@/video-engine/runtime'
import { demoProject } from './project'

/** Fixture default when no --props; render-side audio adapter resolves repo-relative artifact paths. */
export const DemoComposition: React.FC<ProjectVideoProps> = (props) => (
  <ProjectVideo
    scenes={props.scenes ?? demoProject.compiledScenes}
    timeline={props.timeline ?? demoProject.timeline}
    voice={props.voice ?? null}
    audioSrcBySceneId={props.audioSrcBySceneId}
    resolveAudioSrc={staticFile}
  />
)
```

(`staticFile` maps `generated/<runId>/voice/x.mp3` → `/generated/<runId>/voice/x.mp3`, served from `public/generated/<runId>/voice/x.mp3` — the Task 11 copy step. Absolute filesystem paths are intentionally unsupported by Remotion.)

- [ ] **Step 6: Extend `tests/demo/composition.test.ts`**

Add these tests inside the existing `describe('demo composition source')` (keep all existing assertions — they must stay green):

```ts
  it('Root defaultProps carry the fixture project by reference (voice null until a --props run)', () => {
    const el = RemotionRoot({}) as unknown as { props: { defaultProps: { scenes: unknown; timeline: unknown; voice: unknown } } }
    expect(el.props.defaultProps.scenes).toBe(demoProject.compiledScenes)
    expect(el.props.defaultProps.timeline).toBe(demoProject.timeline)
    expect(el.props.defaultProps.voice).toBeNull()
  })

  it('calculateMetadata re-derives all four fields from props.timeline (spec §8 props-driven)', () => {
    const el = RemotionRoot({}) as unknown as { props: { calculateMetadata: (input: { props: { timeline: unknown } }) => { durationInFrames: number; fps: number; width: number; height: number } } }
    const generated = { ...demoProject.timeline, totalFrames: 137, fps: 24, width: 640, height: 360 }
    const meta = el.props.calculateMetadata({ props: { timeline: generated } })
    expect(meta).toEqual({ durationInFrames: 137, fps: 24, width: 640, height: 360 })
  })

  it('DemoComposition forwards props to ProjectVideo and binds the staticFile adapter', () => {
    const el = DemoComposition({
      scenes: demoProject.compiledScenes,
      timeline: demoProject.timeline,
      voice: null,
    }) as unknown as { props: { scenes: unknown; timeline: unknown; resolveAudioSrc: (p: string) => string } }
    expect(el.props.scenes).toBe(demoProject.compiledScenes)
    expect(el.props.timeline).toBe(demoProject.timeline)
    expect(el.props.resolveAudioSrc('generated/x/voice/a.mp3')).toBe('/generated/x/voice/a.mp3')
  })
```

(The existing test `'DemoComposition passes the built project through to ProjectVideo by reference'` calls `DemoComposition({})` — update that call to pass `{ scenes: demoProject.compiledScenes, timeline: demoProject.timeline, voice: null }` so it exercises the new signature with the same by-reference assertions.)

- [ ] **Step 7: Run tests + gates**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS / exit 0. If Remotion's `Composition` types reject `calculateMetadata` alongside static `durationInFrames`, keep both (that is the intended pattern — static for the fixture, calculated for `--props`) and cast the element only in the test if needed.

- [ ] **Step 8: Commit**

```bash
git add src/video-engine/runtime/VoiceTrack.tsx src/video-engine/runtime/ProjectVideo.tsx src/video-engine/runtime/index.ts remotion/Root.tsx remotion/DemoComposition.tsx tests/runtime/voice-track.test.ts tests/demo/composition.test.ts
git commit -m "Task 10 — VoiceTrack audio sequences + props-driven DeLyDemo with calculateMetadata

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: Render stage — public copy → spawn → verify → `manifest.render`

**Files:**
- Create: `src/ai/render.ts`
- Modify: `src/ai/generate.ts` (append stage ⑦ after render-props; `GenerateOptions.renderVideo` seam; `GenerateResult.videoPath` becomes `string`)
- Modify: `src/ai/index.ts` (export `renderVideo`)
- Test: `tests/ai/render.test.ts` (new); extend `tests/ai/generate.test.ts` with the stale-render test

**Interfaces:**
- Consumes: `measureAudioDuration` from `./tts/remote` (ffprobe on any media file), `validateVideo`/`readManifest`/`writeManifest` (artifacts), node `fs`/`child_process`.
- Produces:
  ```ts
  // src/ai/render.ts
  export type RenderVideoOptions = {
    runDir: string; runId: string; repoRoot: string; propsPath: string
    totalFrames: number; fps: number
    exec?: (command: string, args: string[], options: { cwd: string; shell: boolean }) => Promise<{ code: number; stdout: string; stderr: string }>
    measureOutput?: (filePath: string) => Promise<number>  // default ffprobe
  }
  export async function renderVideo(options: RenderVideoOptions): Promise<{ videoPath: string }>
  // generate.ts additions:
  //   GenerateOptions.renderVideo?: (o: Parameters<typeof renderVideo>[0]) => Promise<{ videoPath: string }>
  //   GenerateResult.videoPath: string   (no longer null)
  ```
  Hard failures: `RENDER_NO_AUDIO` (no mp3s to copy), `RENDER_FAILED` (exit ≠ 0), `RENDER_NO_OUTPUT`, `RENDER_DURATION_MISMATCH` (|measured − totalFrames/fps| > 0.5).

- [ ] **Step 1: Write the failing render tests**

```ts
// tests/ai/render.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderVideo } from '@/ai/render'

const RUN_ID = 'run-render-1'
let repoRoot: string, runDir: string

beforeEach(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'delyai-render-'))
  runDir = path.join(repoRoot, 'generated', RUN_ID)
  fs.mkdirSync(path.join(runDir, 'voice'), { recursive: true })
  fs.writeFileSync(path.join(runDir, 'voice', 'scene-001.mp3'), 'mp3-bytes')
  fs.writeFileSync(path.join(runDir, 'voice', 'scene-002.mp3'), 'mp3-bytes')
  fs.writeFileSync(path.join(runDir, 'render-props.json'), '{"payload":{}}')
})
afterEach(() => fs.rmSync(repoRoot, { recursive: true, force: true }))

const base = {
  runId: RUN_ID, repoRoot,
  propsPath: path.join(runDir, 'render-props.json'),
  totalFrames: 135, fps: 30,
}

describe('renderVideo', () => {
  it('copies mp3s into public/ BEFORE exec, spawns remotion with --props, verifies, cleans up (Review Focus 1)', async () => {
    const seen: { copied: boolean; args: string[]; cwd: string } = { copied: false, args: [], cwd: '' }
    const exec = async (command: string, args: string[], options: { cwd: string; shell: boolean }) => {
      // proven copy-before-exec: the public tree must exist while remotion runs
      seen.copied = fs.existsSync(path.join(repoRoot, 'public', 'generated', RUN_ID, 'voice', 'scene-001.mp3'))
      seen.args = args; seen.cwd = options.cwd
      const outRel = args[4]! // DeLyDemo <out> --props <props>
      fs.writeFileSync(path.join(repoRoot, outRel), 'mp4-bytes'.repeat(10))
      return { code: 0, stdout: '', stderr: '' }
    }
    const { videoPath } = await renderVideo({
      ...base, runDir, exec,
      measureOutput: async () => base.totalFrames / base.fps, // 4.5s exact
    })
    expect(seen.copied).toBe(true)                                     // copy precedes spawn
    expect(seen.args).toEqual(['remotion', 'render', 'remotion/index.ts', 'DeLyDemo',
      `generated/${RUN_ID}/video.mp4`, '--props', `generated/${RUN_ID}/render-props.json`])
    expect(seen.cwd).toBe(repoRoot)
    expect(fs.existsSync(videoPath)).toBe(true)
    expect(fs.readFileSync(videoPath, 'utf8')).toContain('mp4-bytes')
    expect(fs.existsSync(path.join(repoRoot, 'public', 'generated', RUN_ID))).toBe(false) // cleaned after
  })

  it('RENDER_FAILED on non-zero exit (stderr tail surfaces)', async () => {
    const exec = async () => ({ code: 1, stdout: '', stderr: 'Cannot find module "x" …tail of error…' })
    await expect(renderVideo({ ...base, runDir, exec, measureOutput: async () => 4.5 }))
      .rejects.toThrow(/RENDER_FAILED[\s\S]*Cannot find module/)
  })

  it('RENDER_NO_OUTPUT when exit 0 but no file appears', async () => {
    const exec = async () => ({ code: 0, stdout: '', stderr: '' })
    await expect(renderVideo({ ...base, runDir, exec })).rejects.toThrow(/RENDER_NO_OUTPUT/)
  })

  it('RENDER_DURATION_MISMATCH when the mp4 length drifts > 0.5s from frames/fps', async () => {
    const exec = async (_c: string, args: string[]) => {
      fs.writeFileSync(path.join(repoRoot, args[4]!), 'mp4')
      return { code: 0, stdout: '', stderr: '' }
    }
    await expect(renderVideo({ ...base, runDir, exec, measureOutput: async () => 9.9 }))
      .rejects.toThrow(/RENDER_DURATION_MISMATCH/)
  })

  it('RENDER_NO_AUDIO refuses to render a voiceless run', async () => {
    fs.rmSync(path.join(runDir, 'voice', 'scene-001.mp3'))
    fs.rmSync(path.join(runDir, 'voice', 'scene-002.mp3'))
    const exec = async () => { throw new Error('exec must not be called') }
    await expect(renderVideo({ ...base, runDir, exec })).rejects.toThrow(/RENDER_NO_AUDIO/)
  })
})
```

- [ ] **Step 2: Write the failing stale-render test (append to `tests/ai/generate.test.ts`)**

```ts
describe('generateProject — render stage + stale video (spec §9.2)', () => {
  it('renders once, skips a fresh resume, re-renders when render-props.sourceHash moves', async () => {
    const f = fakes()
    const renders: string[] = []
    const fakeRender = vi.fn(async (o: { runDir: string }) => {
      renders.push(o.runDir)
      fs.writeFileSync(path.join(o.runDir, 'video.mp4'), 'mp4')
      return { videoPath: path.join(o.runDir, 'video.mp4') }
    })

    const first = await generateProject({
      brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: fakeRender,
    })
    expect(first.videoPath).toBe(path.join(repoRoot, 'generated', RUN_ID, 'video.mp4'))
    expect(fakeRender).toHaveBeenCalledTimes(1)
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'generated', RUN_ID, 'manifest.json'), 'utf8'))
    const propsDoc = JSON.parse(fs.readFileSync(path.join(repoRoot, 'generated', RUN_ID, 'render-props.json'), 'utf8'))
    expect(manifest.render).toEqual({ sourceHash: propsDoc.sourceHash, output: 'video.mp4' })

    // fresh resume: video valid → render skipped, zero new upstream calls
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: fakeRender })
    expect(fakeRender).toHaveBeenCalledTimes(1)                     // NOT called again
    expect([f.story.calls, f.tts.calls, f.visual.calls]).toEqual([1, 2, 1])

    // STALE: manifest.render.sourceHash no longer matches the current render-props
    const manifestPath = path.join(repoRoot, 'generated', RUN_ID, 'manifest.json')
    const stale = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    stale.render.sourceHash = 'stale-hash-not-the-props-hash'
    fs.writeFileSync(manifestPath, JSON.stringify(stale))
    await generateProject({ brief: BRIEF, runId: RUN_ID, repoRoot, adapters: adaptersOf(f), renderVideo: fakeRender })
    expect(fakeRender).toHaveBeenCalledTimes(2)                     // re-rendered (Review Focus 6)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/ai/render.test.ts tests/ai/generate.test.ts`
Expected: FAIL — `@/ai/render` missing; `renderVideo` option unknown to generate.

- [ ] **Step 4: Implement `src/ai/render.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { measureAudioDuration } from './tts/remote'

const execAsync = promisify(exec)

export type RenderVideoOptions = {
  runDir: string
  runId: string
  repoRoot: string
  propsPath: string
  totalFrames: number
  fps: number
  exec?: (command: string, args: string[], options: { cwd: string; shell: boolean }) => Promise<{ code: number; stdout: string; stderr: string }>
  measureOutput?: (filePath: string) => Promise<number>
}

const posix = (p: string) => p.split(path.sep).join('/')

export async function renderVideo(options: RenderVideoOptions): Promise<{ videoPath: string }> {
  const { runDir, runId, repoRoot, propsPath, totalFrames, fps } = options
  const measure = options.measureOutput ?? measureAudioDuration
  // Default exec: one shell line (Windows `npx` resolution), args quoted when they
  // contain spaces; a non-zero exit arrives as a rejected execFile/exec — map it back
  // to { code } so the RENDER_FAILED branch below actually runs.
  const exec = options.exec ?? (async (command: string, args: string[], opts: { cwd: string; shell: boolean }) => {
    const line = [command, ...args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))].join(' ')
    try {
      const { stdout, stderr } = await execAsync(line, { cwd: opts.cwd, shell: opts.shell, maxBuffer: 32 * 1024 * 1024 })
      return { code: 0, stdout, stderr }
    } catch (err) {
      const e = err as { code?: number | string; stdout?: string; stderr?: string }
      return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(err) }
    }
  })

  // 1) public/ copy — Remotion serves only public/ + staticFile (spec §8; absolute paths unsupported)
  const voiceSrc = path.join(runDir, 'voice')
  const mp3s = fs.existsSync(voiceSrc) ? fs.readdirSync(voiceSrc).filter((f) => f.endsWith('.mp3')) : []
  if (mp3s.length === 0) throw new Error('RENDER_NO_AUDIO: no voice/*.mp3 to publish into public/')
  const publicRunDir = path.join(repoRoot, 'public', 'generated', runId)
  fs.rmSync(publicRunDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(publicRunDir, 'voice'), { recursive: true })
  for (const mp3 of mp3s) fs.copyFileSync(path.join(voiceSrc, mp3), path.join(publicRunDir, 'voice', mp3))

  // 2) spawn — args are path-safe (runId is /^[\w-]+$/, enforced by the orchestrator)
  const relVideo = posix(path.relative(repoRoot, path.join(runDir, 'video.mp4')))
  const relProps = posix(path.relative(repoRoot, propsPath))
  const args = ['remotion', 'render', 'remotion/index.ts', 'DeLyDemo', relVideo, '--props', relProps]
  const result = await exec('npx', args, { cwd: repoRoot, shell: true })
  if (result.code !== 0) {
    throw new Error(`RENDER_FAILED (exit ${result.code}): ${(result.stderr || result.stdout).slice(-500)}`)
  }

  // 3) verify output + duration (spec §9.3's assertion, enforced at the source)
  const videoPath = path.join(runDir, 'video.mp4')
  const stat = fs.existsSync(videoPath) ? fs.statSync(videoPath) : null
  if (!stat || stat.size === 0) throw new Error(`RENDER_NO_OUTPUT: ${videoPath} missing or empty`)
  const expected = totalFrames / fps
  const measured = await measure(videoPath)
  if (Math.abs(measured - expected) > 0.5) {
    throw new Error(`RENDER_DURATION_MISMATCH: expected ${expected.toFixed(3)}s (frames/fps) measured ${measured.toFixed(3)}s`)
  }

  // 4) cleanup the public mirror (render already bundled it)
  try { fs.rmSync(publicRunDir, { recursive: true, force: true }) } catch { /* best effort */ }

  return { videoPath }
}
```

- [ ] **Step 5: Wire stage ⑦ into `src/ai/generate.ts`**

1. Add imports: `import { renderVideo } from './render'` and `validateVideo` back into the artifacts import list.
2. Extend `GenerateOptions` with `renderVideo?: (o: Parameters<typeof renderVideo>[0]) => Promise<{ videoPath: string }>`.
3. Change `GenerateResult.videoPath` to `string`.
4. Insert **after** the render-props block, before the `return`:

```ts
  // ---- ⑦ render ----------------------------------------------------------
  const propsHash = upstream // render-props sourceHash — the render stage's input (spec §7.5)
  const videoValid = validateVideo(dir, propsHash)
  let videoPath: string
  if (videoValid.ok) {
    videoPath = path.join(dir, 'video.mp4')
    progress({ stage: 'render', status: 'skip' })
  } else {
    progress({ stage: 'render', status: 'start', detail: videoValid.reason })
    try {
      const renderFn = options.renderVideo ?? renderVideo
      const out = await renderFn({
        runDir: dir, runId, repoRoot,
        propsPath: path.join(dir, 'render-props.json'),
        totalFrames: timeline.totalFrames, fps: timeline.fps,
      })
      manifest.render = { sourceHash: propsHash, output: 'video.mp4' }
      manifest.stages.render = { status: 'done', sourceHash: propsHash, at: new Date().toISOString() }
      writeManifest(dir, manifest)
      videoPath = out.videoPath
      progress({ stage: 'render', status: 'done' })
    } catch (err) { failStage('render', err) }
  }
```

5. `return { runId, dir, videoPath, renderPropsPath: …, story, voice, timeline, diagnostics: timeline.diagnostics }`.
6. Export `renderVideo` from `src/ai/index.ts`.

- [ ] **Step 6: Update the Task 9 tests for the new stage, then run all gates**

Adding stage ⑦ changes three Task 9 tests. In `tests/ai/generate.test.ts`:

1. Add a shared helper next to `fakes()`:

```ts
const fakeRender = vi.fn(async ({ runDir }: { runDir: string }) => {
  fs.writeFileSync(path.join(runDir, 'video.mp4'), 'mp4')
  return { videoPath: path.join(runDir, 'video.mp4') }
})
```

2. **Happy-path test:** pass `renderVideo: fakeRender` to `generateProject`; replace

```ts
expect(result.videoPath).toBeNull() // render stage lands in Task 11
```
with

```ts
expect(result.videoPath).toBe(path.join(repoRoot, 'generated', RUN_ID, 'video.mp4'))
expect(fakeRender).toHaveBeenCalledTimes(1)
```

and extend the progress assertion's `starts` expectation from six stages to seven — `'render'` now follows `'renderProps'`:

```ts
expect(starts).toEqual(['story', 'voice', 'timeline', 'visual', 'compile', 'renderProps', 'render'])
```

3. **Resume token-saving test:** pass `renderVideo: fakeRender` to *both* calls; extend the skip expectation to

```ts
['story:skip', 'voice:skip', 'timeline:skip', 'visual:skip', 'compile:skip', 'renderProps:skip', 'render:skip']
```

and add `expect(fakeRender).toHaveBeenCalledTimes(1)` after the second call (resume did not re-render).

4. **Every other test whose call can complete all stages** also gets `renderVideo: fakeRender` — the *second* call of the Visual-failure test and *both* calls of the corrupt-story test (after corruption the chain moves, so render legitimately re-runs there; no count assertion needed, the injection only prevents a real spawn). Tests that throw earlier (TTS failure, brief mismatch, invalid runId) need no change.

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS / exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/ai/render.ts src/ai/generate.ts src/ai/index.ts tests/ai/render.test.ts tests/ai/generate.test.ts
git commit -m "Task 11 — render stage: public/ mirror, spawn, ffprobe verify, manifest.render stale check

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: CLI — `npm run generate:1a`

**Files:**
- Create: `src/ai/cli-args.ts`
- Create: `scripts/generate-1a.ts`
- Modify: `package.json` (script `generate:1a`)
- Test: `tests/ai/cli-args.test.ts`

**Interfaces:**
- Consumes: `generateProject`/`StageError` (Task 9+11), `registerBackends` (`@/video-engine/runtime` — imported from the **entry script**, which lives outside `src/ai/**`, so the layer rule holds), Node `node:util` `parseArgs`, `node --env-file-if-exists` for env.
- Produces:
  ```ts
  // src/ai/cli-args.ts
  export type GenerateCliArgs = { brief: string; targetSeconds: number; language: string; runId?: string; voice?: string; resume?: string }
  export function parseGenerateArgs(argv: string[]): GenerateCliArgs   // throws with usage text on bad input
  // package.json
  "generate:1a": "node --env-file-if-exists=.env --import tsx scripts/generate-1a.ts"
  ```
  CLI surface (spec §8): `npm run generate:1a -- --brief "…" [--target 30] [--lang vi] [--run-id <id>] [--voice <voiceId>] [--resume <id>]`. `--resume` and `--run-id` are aliases: supplying either passes the runId, and `generateProject`'s validators decide what actually re-runs.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ai/cli-args.test.ts
import { describe, it, expect } from 'vitest'
import { parseGenerateArgs } from '@/ai/cli-args'

describe('parseGenerateArgs', () => {
  it('parses the full surface (spec §8)', () => {
    expect(parseGenerateArgs(['--brief', 'Ba renderer', '--target', '20', '--lang', 'en', '--run-id', 'run-abc', '--voice', 'v9']))
      .toEqual({ brief: 'Ba renderer', targetSeconds: 20, language: 'en', runId: 'run-abc', voice: 'v9', resume: undefined })
  })

  it('defaults: target 30, language vi, no run-id/voice', () => {
    expect(parseGenerateArgs(['--brief', 'x']))
      .toEqual({ brief: 'x', targetSeconds: 30, language: 'vi', runId: undefined, voice: undefined, resume: undefined })
  })

  it('--resume passes through (alias of --run-id)', () => {
    expect(parseGenerateArgs(['--brief', 'x', '--resume', 'run-def']).resume).toBe('run-def')
  })

  it('missing/empty --brief throws usage', () => {
    expect(() => parseGenerateArgs([])).toThrow(/--brief/)
    expect(() => parseGenerateArgs(['--brief', '   '])).toThrow(/--brief/)
  })

  it('invalid --target throws', () => {
    expect(() => parseGenerateArgs(['--brief', 'x', '--target', 'abc'])).toThrow(/--target/)
    expect(() => parseGenerateArgs(['--brief', 'x', '--target', '-5'])).toThrow(/--target/)
  })

  it('unknown flag throws (node:util parseArgs strict)', () => {
    expect(() => parseGenerateArgs(['--brief', 'x', '--wat'])).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai/cli-args.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/ai/cli-args.ts`**

```ts
import { parseArgs } from 'node:util'

export type GenerateCliArgs = { brief: string; targetSeconds: number; language: string; runId?: string; voice?: string; resume?: string }

const USAGE = 'Usage: npm run generate:1a -- --brief "<topic>" [--target 30] [--lang vi] [--run-id <id>] [--voice <voiceId>] [--resume <id>]'

export function parseGenerateArgs(argv: string[]): GenerateCliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      brief: { type: 'string' },
      target: { type: 'string' },
      lang: { type: 'string' },
      'run-id': { type: 'string' },
      voice: { type: 'string' },
      resume: { type: 'string' },
    },
    strict: true,
  })

  const brief = (values.brief ?? '').trim()
  if (!brief) throw new Error(`--brief is required.\n${USAGE}`)

  const targetSeconds = values.target === undefined ? 30 : Number(values.target)
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) throw new Error(`--target must be a positive number of seconds.\n${USAGE}`)

  return {
    brief,
    targetSeconds,
    language: values.lang ?? 'vi',
    runId: values['run-id'],
    voice: values.voice,
    resume: values.resume,
  }
}
```

- [ ] **Step 4: Implement `scripts/generate-1a.ts` + package.json script**

```ts
// scripts/generate-1a.ts — CLI entry. Lives outside src/ai/**, so it may own
// registration: the compiler needs the registry before generateProject compiles.
import { registerBackends } from '@/video-engine/runtime'
import { parseGenerateArgs } from '@/ai/cli-args'
import { generateProject, StageError } from '@/ai/generate'

registerBackends()

const args = parseGenerateArgs(process.argv.slice(2))

try {
  const result = await generateProject({
    brief: { topic: args.brief, targetSeconds: args.targetSeconds, language: args.language },
    runId: args.runId ?? args.resume,
    voiceId: args.voice,
    onProgress: (e) => console.log(`[${e.status.padEnd(4)}] ${e.stage}${e.detail ? ` — ${e.detail}` : ''}`),
  })
  console.log(`\n✅ video: ${result.videoPath}`)
  console.log(`   runId: ${result.runId}`)
  console.log(`   scenes: ${Object.keys(result.timeline.sceneWindows).length}, frames: ${result.timeline.totalFrames} @ ${result.timeline.fps}fps`)
} catch (err) {
  if (err instanceof StageError) console.error(`\n❌ stage "${err.stage}" failed: ${err.message}`)
  else console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
```

`package.json` scripts — add:

```json
"generate:1a": "node --env-file-if-exists=.env --import tsx scripts/generate-1a.ts"
```

(`tsx` from Task 2 resolves the `@/*` tsconfig paths; `--env-file-if-exists` is Node ≥22.9 — this machine runs 22.15. Both file paths exist in `tsconfig.json`'s `include` (`scripts` is listed), so `tsc --noEmit` typechecks this entry.)

- [ ] **Step 5: Run tests + gates**

Run: `npx vitest run tests/ai/cli-args.test.ts && npx tsc --noEmit && npx eslint .`
Expected: PASS / exit 0.

- [ ] **Step 6: Manual smoke (requires `.env` with both keys + TTS server running; skip cleanly if absent)**

Run:
```bash
test -f .env && npm run generate:1a -- --brief "Giới thiệu DeLyAI2 trong 10 giây" --target 10 || echo "SKIP: no .env"
```
Expected (when present): per-stage `[start]/[done]/[skip]` lines, then `✅ video: …/generated/<runId>/video.mp4`, exit 0. Without `.env`, the SKIP branch prints and the task still commits — the env-gated integration test (Task 14) is the automated proof.

- [ ] **Step 7: Commit**

```bash
git add src/ai/cli-args.ts scripts/generate-1a.ts package.json tests/ai/cli-args.test.ts
git commit -m "Task 12 — generate:1a CLI with env-file loading and per-stage progress

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 13: Dev endpoint + GeneratePanel

**Files:**
- Modify: `vite.config.ts`
- Create: `src/app/GeneratePanel.tsx`
- Modify: `src/app/App.tsx`
- Test: no new unit test (middleware needs a live Vite server; spec §9 does not require endpoint tests) — proof is `tsc`/`vite build` green plus the manual curl flow below.

**Interfaces:**
- Consumes: `generateProject` via `server.ssrLoadModule('/src/ai/generate.ts')` (Vite's resolver handles `@/` aliases — the config file itself must NOT import `src/**` statically, because `vite.config.ts` is bundled before the config's own alias applies), `registerBackends` via `ssrLoadModule('/src/video-engine/runtime/index.ts')` once per dev process, `loadEnv`.
- Produces:
  - `POST /api/generate` body `{topic, targetSeconds?, language?, runId?}` → `200 {runId}` (fire-and-forget; pipeline runs in Node).
  - `GET /api/generate/status?runId=…` → `{stage, status: 'running'|'done'|'failed', videoUrl?, error?}`.
  - `GET /generated/<runId>/video.mp4` → served by Vite's static dev middleware from the repo root (no extra wiring).
  - `<GeneratePanel />` — brief textarea, seconds, language, Generate button, 2s polling, `<video>` on success.
  Layer note: the middleware runs only inside `configureServer` (dev serve — never during `vite build`), satisfying spec §8's "registered only in dev".

- [ ] **Step 1: Rewrite `vite.config.ts`**

```ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import type { IncomingMessage } from 'node:http'

type RunState = { stage: string; status: 'running' | 'done' | 'failed'; videoUrl?: string; error?: string }

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  optimizeDeps: { exclude: ['@remotion/player'] },
  configureServer(server) {
    const runs = new Map<string, RunState>()
    let backendsRegistered = false

    const readBody = (req: IncomingMessage) =>
      new Promise<string>((resolve, reject) => {
        let data = ''
        req.on('data', (chunk) => { data += chunk })
        req.on('end', () => resolve(data))
        req.on('error', reject)
      })

    // Registered FIRST: Connect matches prefixes in order, and
    // "/api/generate" is a prefix of "/api/generate/status".
    server.middlewares.use('/api/generate/status', (req, res) => {
      const runId = new URL(req.url ?? '', 'http://localhost').searchParams.get('runId') ?? ''
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(runs.get(runId) ?? { stage: 'unknown', status: 'unknown' }))
    })

    server.middlewares.use('/api/generate', async (req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST only' })); return }
      try {
        const body = JSON.parse(await readBody(req)) as { topic?: string; targetSeconds?: number; language?: string; runId?: string }
        if (!body.topic?.trim()) { res.statusCode = 400; res.end(JSON.stringify({ error: 'topic required' })); return }

        // Load project modules through Vite's pipeline (aliases/TS resolve here;
        // a static import inside this config file would bypass the alias).
        const { generateProject } = await server.ssrLoadModule('/src/ai/generate.ts')
        const { registerBackends } = await server.ssrLoadModule('/src/video-engine/runtime/index.ts')
        if (!backendsRegistered) { registerBackends(); backendsRegistered = true } // idempotent guard — double registration throws

        const env = loadEnv(server.config.mode, server.config.cwd, '')
        for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'TTS_API_KEY', 'TTS_BASE_URL', 'TTS_VOICE', 'WHISPER_MODEL']) {
          if (env[key]) process.env[key] = env[key]
        }

        const runId = body.runId ?? `run-dev-${Date.now().toString(36)}`
        if (!/^[\w-]+$/.test(runId)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'runId must match /^[\\w-]+$/' })); return }
        runs.set(runId, { stage: 'story', status: 'running' })

        void generateProject({
          brief: { topic: body.topic, targetSeconds: Number(body.targetSeconds) || 30, language: body.language ?? 'vi' },
          runId,
          onProgress: (e) => { const state = runs.get(runId); if (state?.status === 'running') state.stage = e.stage },
        })
          .then(() => runs.set(runId, { stage: 'done', status: 'done', videoUrl: `/generated/${runId}/video.mp4` }))
          .catch((err: unknown) => runs.set(runId, { stage: 'fail', status: 'failed', error: err instanceof Error ? err.message : String(err) }))

        res.end(JSON.stringify({ runId }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      }
    })
  },
})
```

- [ ] **Step 2: Create `src/app/GeneratePanel.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react'

type StatusResponse = { stage?: string; status: string; videoUrl?: string; error?: string }

/** Dev-only trigger for the Node-side pipeline; the browser never runs generation (spec §8). */
export const GeneratePanel: React.FC = () => {
  const [topic, setTopic] = useState('')
  const [targetSeconds, setTargetSeconds] = useState(10)
  const [language, setLanguage] = useState('vi')
  const [status, setStatus] = useState('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  const generate = async () => {
    setError(null); setVideoUrl(null); setStatus('starting')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic, targetSeconds, language }),
      })
      const payload = (await res.json()) as { runId?: string; error?: string }
      if (!res.ok || !payload.runId) throw new Error(payload.error ?? `HTTP ${res.status}`)
      setStatus('running')
      timer.current = setInterval(async () => {
        try {
          const state = (await (await fetch(`/api/generate/status?runId=${encodeURIComponent(payload.runId!)}`)).json()) as StatusResponse
          if (state.status === 'done') {
            if (timer.current) clearInterval(timer.current)
            setVideoUrl(state.videoUrl ?? null); setStatus('done')
          } else if (state.status === 'failed') {
            if (timer.current) clearInterval(timer.current)
            setError(state.error ?? 'failed'); setStatus('failed')
          } else setStatus(`running: ${state.stage ?? ''}`)
        } catch { /* transient poll failure — next tick retries */ }
      }, 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setStatus('failed')
    }
  }

  const busy = status === 'starting' || status.startsWith('running')
  return (
    <section style={{ marginTop: 32, borderTop: '1px solid #2a3140', paddingTop: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h2 style={{ fontSize: 18 }}>Generate from brief (dev)</h2>
      <textarea
        value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
        placeholder="Chủ đề video, ví dụ: Giới thiệu kiến trúc DeLyAI2…"
        style={{ width: '100%', fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '8px 0' }}>
        <label>seconds{' '}
          <input type="number" min={5} max={120} value={targetSeconds}
            onChange={(e) => setTargetSeconds(Number(e.target.value))} style={{ width: 64 }} />
        </label>
        <label>lang{' '}
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="vi">vi</option>
            <option value="en">en</option>
          </select>
        </label>
        <button onClick={generate} disabled={!topic.trim() || busy}>Generate</button>
        <span style={{ opacity: 0.7 }}>{status}{error ? ` — ${error}` : ''}</span>
      </div>
      {videoUrl && <video src={videoUrl} controls style={{ width: '100%' }} />}
    </section>
  )
}
```

- [ ] **Step 3: Mount in `src/app/App.tsx`**

After the existing `<ProjectPlayer … />` line inside `<main>`:

```tsx
import { GeneratePanel } from './GeneratePanel'
// …
    <ProjectPlayer compiledScenes={project.compiledScenes} timeline={project.timeline} />
    <GeneratePanel />
// …
```

The Phase 0 fixture Player preview stays untouched (spec §8).

- [ ] **Step 4: Gates**

Run: `npx tsc --noEmit && npx eslint . && npx vite build && npx vitest run`
Expected: all exit 0 (the endpoint itself is dev-only; `configureServer` does not run during `vite build`).

- [ ] **Step 5: Manual verification (dev server)**

```bash
npm run dev
```
Then, in another shell:

```bash
curl -s -X POST http://localhost:5173/api/generate -H "content-type: application/json" -d "{\"topic\":\"Giới thiệu DeLyAI2\",\"targetSeconds\":10,\"language\":\"vi\"}"
```
Expected: `{"runId":"run-dev-…"}`. Poll:

```bash
curl -s "http://localhost:5173/api/generate/status?runId=<runId>"
```
Expected: stage progresses (`story → voice → …`), then `{"status":"done","videoUrl":"/generated/<runId>/video.mp4"}`. Fetch the video:

```bash
curl -sI "http://localhost:5173/generated/<runId>/video.mp4"
```
Expected: HTTP 200. In the browser: panel → type a brief → Generate → `<video>` plays. (Requires `.env` + TTS server; without them the POST returns `500` with the stage error — the failure path is itself worth seeing once.)

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts src/app/GeneratePanel.tsx src/app/App.tsx
git commit -m "Task 13 — dev-only /api/generate middleware + GeneratePanel with video polling

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 14: Env-gated integration + full gate battery

**Files:**
- Test: `tests/integration/generate-e2e.test.ts`
- Test: `tests/integration/gate.test.ts` (gate battery as a skipped-battery script is NOT a test — gates are run as shell steps in Step 3; this file is only created if a gate needs encoding — default: **not created**)

**Interfaces:**
- Consumes: `generateProject` (real adapters — no injection except the counting `fetchImpl` on resume), `readManifest`, ffprobe, spec §1/§9.3 assertions.
- Produces: the automated proof of success criteria 1–3; credentials gate via `describe.skipIf`.

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/integration/generate-e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { generateProject } from '@/ai/generate'
import { registerBackends, clearRegistered } from '@/video-engine/runtime'
import { readJsonArtifact, readManifest } from '@/ai/artifacts'

const HAS_CREDS = Boolean(process.env.GEMINI_API_KEY && process.env.TTS_API_KEY)
const RUN_ID = 'run-e2e-1'
const BRIEF = { topic: 'Giới thiệu kiến trúc DeLyAI2 cho người mới', targetSeconds: 10, language: 'vi' }

const ffprobeJson = (file: string) =>
  JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' })) as {
    streams: { codec_type: string; codec_name: string }[]
    format: { duration: string }
  }

describe.skipIf(!HAS_CREDS)('Phase 1A end-to-end (spec §1, §9.3) — needs .env + running TTS server', () => {
  beforeAll(() => { clearRegistered(); registerBackends() })
  afterAll(() => { fs.rmSync(path.join(process.cwd(), 'generated', RUN_ID), { recursive: true, force: true }) })

  it('brief → real Gemini/TTS/ASR → video.mp4 with audio, zero voice warnings', async () => {
    const result = await generateProject({ brief: BRIEF, runId: RUN_ID })
    const dir = result.dir

    // --- MP4: h264 + aac, duration ≈ Σ scenes (spec §9.3) ---
    const probe = ffprobeJson(result.videoPath!)
    const types = probe.streams.map((s) => `${s.codec_type}:${s.codec_name}`)
    expect(types).toContain('video:h264')
    expect(types).toContain('audio:aac')                                  // audio actually present (Review Focus 1)
    const expected = result.timeline.totalFrames / result.timeline.fps
    expect(Number(probe.format.duration)).toBeGreaterThan(0)
    expect(Math.abs(Number(probe.format.duration) - expected)).toBeLessThan(1.0)

    // --- zero voice diagnostics (spec §1 success criterion 1) ---
    const codes = result.timeline.diagnostics.map((d) => d.code)
    expect(codes).not.toContain('VOICE_OVERRUNS_SCENE')
    expect(codes).not.toContain('VOICE_UNKNOWN_SCENE')
    expect(codes).not.toContain('VOICE_ESTIMATED_TIMING')

    // --- scene count and audio mapping are 1:1 (spec §9.3) ---
    const compiledFiles = fs.readdirSync(path.join(dir, 'compiled')).filter((f) => f.endsWith('.json'))
    expect(compiledFiles).toHaveLength(Object.keys(result.timeline.sceneWindows).length)
    const props = readJsonArtifact<{ audioSrcBySceneId: Record<string, string>; voice: { segments: { sceneId: string }[] } }>(path.join(dir, 'render-props.json'))
    expect(props).not.toBeNull()
    const segmentSceneIds = props!.payload.voice.segments.map((s) => s.sceneId)
    expect(segmentSceneIds).toHaveLength(new Set(segmentSceneIds).size)     // every sceneId exactly once
    expect(Object.keys(props!.payload.audioSrcBySceneId).sort()).toEqual([...segmentSceneIds].sort())
    for (const id of segmentSceneIds) expect(result.timeline.sceneWindows[id]).toBeDefined()

    // --- manifest config block recorded (spec §7.5) ---
    const manifest = readManifest(dir)
    expect(manifest).not.toBeNull()
    expect(manifest!.tts.model).toBe('omnivoice')
    expect(manifest!.retime.paddingSeconds).toBe(0.5)
    expect(manifest!.render?.sourceHash).toBeTruthy()
    expect(manifest!.stages.visual.attempts?.length ?? 0).toBeGreaterThanOrEqual(1)

    // --- word provenance present (spec §12) ---
    const wordSeg = result.voice.segments.find((s) => s.words.length > 0)
    expect(wordSeg?.wordTimingSource).toBe('whisper')
  }, 600_000)

  it('resume on the completed run issues ZERO Gemini/TTS/ASR calls (spec §10)', async () => {
    let httpCalls = 0
    const countingFetch: typeof fetch = (input, init) => {
      httpCalls++
      return fetch(input as never, init)
    }
    const before = fs.statSync(path.join(process.cwd(), 'generated', RUN_ID, 'video.mp4')).mtimeMs
    const second = await generateProject({ brief: BRIEF, runId: RUN_ID, fetchImpl: countingFetch })
    expect(httpCalls).toBe(0)                                              // token-saving proof (spec §9.3)
    expect(second.videoPath).toBe(path.join(process.cwd(), 'generated', RUN_ID, 'video.mp4'))
    expect(fs.statSync(second.videoPath!).mtimeMs).toBe(before)            // video NOT re-rendered
  }, 120_000)
})
```

- [ ] **Step 2: Run without credentials — must skip clean, never red**

Run: `npx vitest run tests/integration/generate-e2e.test.ts`
Expected (no `.env`): suite reported as **skipped**, exit 0.

Run: `npx vitest run`
Expected: full suite PASS / exit 0 with the integration file skipped-or-passed.

- [ ] **Step 3: Run the full gate battery (spec §9.5) — each command exit 0**

```bash
npx tsc --noEmit
```
Expected: exit 0.

```bash
npx vitest run
```
Expected: exit 0 (with integration skipped when credentials are absent — that is green, not red).

```bash
npx eslint .
```
Expected: exit 0.

```bash
npx vite build
```
Expected: exit 0.

```bash
npx remotion bundle remotion/index.ts
```
Expected: exit 0.

```bash
npx remotion versions
```
Expected: exit 0 — "All packages have the same version".

- [ ] **Step 4: Credential-gated run (when `.env` + TTS server are available)**

```bash
npx vitest run tests/integration/generate-e2e.test.ts
```
Expected: 2 passed (10-minute timeout covers Gemini + per-scene TTS/ASR + Whisper + a 10s/30fps render). If it fails: read the stage error — a red integration run with credentials present is a real defect, not a flake.

- [ ] **Step 5: Final consistency sweep**

Run: `git status --porcelain -uall`
Expected: only the plan's own new test file staged for this commit — no `.env`, no `generated/`, no `public/generated/`, no `*.mp3`, no `*.mp4`.

Run: `git ls-files | grep -E "(^|/)\.env$|^generated/|^public/generated/" || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/generate-e2e.test.ts
git commit -m "Task 14 — env-gated end-to-end: audio in MP4, zero voice warnings, resume issues 0 calls

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Execution Handoff

- **Method:** subagent-driven development (same as Phase 0): fresh implementer per task + fresh task reviewer (spec compliance **and** quality verdicts, both required) + bounded fix rounds + final whole-branch review on the most capable model.
- **Rulings made while writing this plan** (each is embedded in the owning task; none changes approved scope):
  1. **`E:\TTS-ASR-API` has no git** — Task 1 does `git init` + `.gitignore` (`.env` first) + baseline commit, then the feature commit. Secret scan ran at plan time: the API key exists only in `.env`.
  2. **`sourceHash` includes the artifact payload** (`hashObject({upstream, stageInputs, payload})`) — required by the spec's own §7.3 goal for non-deterministic stages; video remains hash-exempt.
  3. **openai-whisper, not faster-whisper** — the deployed ASR uses `whisper` (verified in `app/services/asr.py`); the `word_timestamps` parameter name and `words: [{word,start,end}]` shape are identical to the spec's contract.
  4. **Voice stage granularity = whole stage** — an invalid voice re-synthesizes every scene (single `voicetimeline.json` chain value); the zero-call guarantee covers the *valid* case the spec tests.
  5. **VoiceTrack loud-guard** — missing window skips (master owns the diagnostic), missing `audioSrc` throws (renderer invariant, not a fallback).
- **Before implementation:** create `.env` (git-ignored, verified by Task 2's security test) with `GEMINI_API_KEY`, `TTS_API_KEY`, and optionally `GEMINI_MODEL`/`TTS_BASE_URL`/`TTS_VOICE`. Keys never enter any committed file.
- **Execution order** is the Task Index order — it is the dependency order (API contract → adapters → artifacts → orchestrator → runtime → CLI → endpoint → tests/gates); do not reorder.
