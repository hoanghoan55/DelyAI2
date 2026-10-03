# DeLyAI2 — Báo cáo Phase 0

> Báo cáo theo yêu cầu mục 31 (16 mục), viết trước khi bắt đầu Phase 1.
> Ngày: 2026-10-03. Nhánh: `master` @ `94ae480`. Base trước Phase 0: `5e300c9`.

---

## 1. Repository structure

```
E:\DelyAI2
├── AGENTS.md                  # luật ràng buộc + layer table (cột FORBIDDEN là normative)
├── README.md
├── docs/
│   ├── ARCHITECTURE.md   SCENE_DSL.md   TIMELINE.md
│   ├── VIDEO_ENGINE.md   DESIGN_SYSTEM.md   ROADMAP.md
│   └── superpowers/specs/2026-10-03-delyai2-phase0-design.md
│       superpowers/plans/2026-10-03-delyai2-phase0.md
├── remotion/                  # entry Remotion: index, Root, DemoComposition, project fixture
├── src/
│   ├── shared/                # SeededRandom, canonical JSON, SHA-256, ids
│   ├── timeline/              # units, convert, voice, music, master
│   ├── video-engine/
│   │   ├── schema/            # Scene DSL v0 (Zod .strict())
│   │   ├── ir/                # Compiled Scene IR v0 + compiledHash
│   │   ├── compiler/          # DSL → IR, diagnostics, params resolution
│   │   ├── registry/          # compositions / visual / motion recipes
│   │   ├── runtime/           # SceneRenderer, TypographyLayer, backends
│   │   ├── canvas/  three/  motion/   # backend subsystems + recipes
│   │   └── compositions/      # layout primitives
│   ├── ai/                    # director contracts (story/visual/assets/tts) + fixtures
│   ├── qa/                    # 5 structural layers + vision boundary
│   └── app/                   # Vite SPA preview shell (@remotion/player)
├── tests/                     # vitest: unit + integration theo từng layer
└── out/ (git-ignored)         # demo.mp4 — không bao giờ commit
```

Quy mô nhánh: **144 files, +12,179 dòng, 26 commits** (`cf053a9` → `94ae480`).

## 2. Architecture

```
AI → Scene DSL → Scene Compiler → Compiled Scene IR → Video Engine → Remotion → MP4
```

- **AI** chỉ sinh DSL (Phase 0: fixture director; contract đã có sẵn) — không bao giờ sinh JSX/TSX.
- **Scene Compiler** là ranh giới duy nhất AI → IR: validate, resolve default từ registry, phát diagnostics.
- **Runtime** không resolve default nào; registry quyết định renderer (ngoại lệ: `backdropRenderer` data-only).
- **Layer table** trong `AGENTS.md`: cột "Must never import" là ràng buộc; cột "May import" chỉ minh hoạ.
  Audit cuối vòng 240 import edge trong `src/`: **0 vi phạm** cột forbidden. Ngoại lệ được phép duy nhất
  là `src/ai/project.ts` (composition root gọi `compileScene`).

## 3. Scene DSL schema

- `SceneDSLSchema` + `ProjectDSLSchema` — Zod `.strict()` (khoá lạ = lỗi), `.finite()` trên trường số thời gian.
- Đơn vị **giây**; DSL là non-executable, versioned, là source of truth.
- `parseSceneDsl` / `parseProjectDsl` trả diagnostics có mã lỗi; QA layer báo lại cho người dùng.
- Fixture 30 giây: `src/ai/fixtures/demo-project.dsl.json` (+ mirror TypeScript `demo-project.dsl.ts`).

## 4. Timeline model

- Branded types `Seconds` / `Milliseconds` / `Frames` (`src/timeline/units.ts`).
- Chuyển đổi chính tắc duy nhất: `src/timeline/convert.ts` —
  `secondsToFrames(v,fps) = Math.round(v*fps)` (+ `framesToSeconds`, `msToFrames`, `framesToMs`, `beatToFrame`).
- `buildMasterTimeline` cộng dồn **integer frames**: không có khe hở / chồng frame,
  `Σ durationInFrames === totalFrames` (test ở cả 30 và 29.97 fps).
- Voice timeline (ms, mapping `sceneId` tường minh) **độc lập** Music timeline (beats).
- `voiceScenePolicy`: Phase 0 chỉ cài `strict` — cảnh báo `VOICE_OVERRUNS_SCENE`, **không** sửa window.

## 5. Compiler

- Hàm thuần DSL → IR: không LLM, không network, không self-repair.
- Resolve `ResolvedParams` từ registry schema + default; sai/thiếu → `CompilerError` mã `INVALID_PARAMS`
  (kèm tên recipe). Mã lỗi khác: `UNKNOWN_COMPOSITION`, `UNKNOWN_VISUAL_RECIPE`, `UNKNOWN_MOTION_RECIPE`,
  `UNKNOWN_SLOT`, `MISSING_SCENE_WINDOW`, `DURATION_MISMATCH`, `NON_FINITE_FRAME`.
- Hash hai bước không vòng: `sourceHash = hash(schemaVersion, dsl, assetFingerprints)` → `compiledHash`
  (chứa provenance, gồm `engineVersion`).
- Mọi trường số (DSL lẫn recipe params) có `.finite()` → NaN/Infinity chặn ngay ở schema, trước hasher.

## 6. Canvas integration

- `src/video-engine/canvas/Canvas2DBackend.tsx` vẽ per-frame trong Remotion qua ref; **5 recipe**
  (`grid`, `particle-field`, `glow`, `geometric-lines`, `waveform`) deterministic nhờ `SeededRandom`.
- Hook `dispose` có sẵn trong `canvas/types.ts`, backend gọi khi unmount (recipe Phase 0 chưa implement).
- Bậc determinism: **call-stream exact** — test ghi lại luồng lệnh 2D qua context headless,
  **không** so pixel; không có golden-image test trong CI.

## 7. Three.js integration

- `<ThreeCanvas>` của `@remotion/three`, **không** dùng `useFrame()` — mọi thứ driven bởi frame prop.
- **6 recipe** (`network-graph`, `particles-3d`, `basic-scene`, `lighting`, `camera`, `wireframe-object`)
  deterministic về cấu trúc; GPU resources dispose khi unmount.
- Bậc determinism: **structural** (`structuralHashOf` trên `SceneDescriptor`) — không so pixel.

## 8. Remotion integration

- `ProjectVideo` sequence các scene đúng theo `sceneWindows`; composition `DeLyDemo` derive metadata từ timeline.
- Remotion family đồng bộ **4.0.191**; `npx remotion versions` → "All packages have the same version".
- Cả hai entry (`src/app/main.tsx`, `remotion/project.ts`) đều `registerBackends()` **trước**
  `buildFixtureProject()` — hazard module-evaluation-order được loại trừ bằng cấu trúc, có regression test.

## 9. Deterministic strategy

- Ladder: **compiler exact** → **canvas call-stream exact** → **Three structural**.
- `SeededRandom` (không `Math.random()` trong render path — ESLint + test quét ≥50 file engine),
  canonical JSON, SHA-256.
- DSL giống nhau → `compiledHash` giống nhau (có test); mirror JSON fixture so bằng deep equality.
- **Không** golden-image test; pixel determinism **không** được guarantee — tài liệu nói đúng mức này.

## 10. Demo video

- `out/demo.mp4` (git-ignored, **không** commit): 4 scene / 900 frame / 30 fps / 1920×1080 / ~30.06 s, h264 (+ aac).
- 4 scene: Hero (Remotion) → Split + Canvas particles → 3D network (Three.js) → Typography ending.
- Chứng minh đủ 10 điểm của mục 26: DSL parse/validate, timeline, composition registry, visual recipe registry,
  motion recipe, Canvas render trong Remotion, Three.js render trong Remotion, Remotion compose mọi layer,
  seed deterministic, MP4 render thành công.

## 11. Test result

`npx vitest run` → **exit 0** — 20 test files, **168/168 tests passed** (quan sát tại HEAD `94ae480`
và chạy lại trên `master` sau merge). Bao gồm: determinism ladder, canonical-JSON survival
(canvas/three/motion), compiler diagnostics, timeline accumulation ở 29.97 fps, module-order regression,
mirror-JSON fixture, và test non-finite recipe param → `INVALID_PARAMS`.

## 12. Typecheck result

`npx tsc --noEmit` → **exit 0**; `npx eslint .` → **exit 0** (tại HEAD và trên `master` sau merge).

## 13. Build result

Tất cả **exit 0** (`94ae480`):

| Command | Kết quả |
|---|---|
| `npx tsc --noEmit` | 0 |
| `npx vitest run` | 0 — 20 files, 168 tests |
| `npx eslint .` | 0 |
| `npx vite build` | 0 — built in 8.04 s |
| `npx remotion bundle remotion/index.ts` | 0 |
| `npx remotion versions` | 0 — mọi package 4.0.191 |
| `npx remotion render … DeLyDemo` | 0 — 900/900 frames → ~5 MB |
| `ffprobe` scratch render | h264, 1920×1080, `duration=30.058667`, aac |
| `git ls-files out build dist` | rỗng — không artifact nào tracked |

## 14. Known limitations

- `extend_to_voice` / `stretch_to_voice` là enum reserved, **chưa** cài nhánh — chỉ `strict` chạy thật.
- Nhánh `VOICE_ESTIMATED_TIMING` có thật nhưng không path nào emit `estimated` (fixture dùng `"fixture"`).
- `StyleRef` trong DSL → layout **chưa** nối (layout nhận `style: {}`).
- TTS chỉ là fixture (`timingSource: "fixture"`); Vision QA chỉ có boundary (`available: false`).
- Không có transition giữa các scene; `dispose` chưa recipe nào implement.
- Không golden-pixel test (đúng chủ đích — pixel determinism không được guarantee).

## 15. Recommended next phase

Phase 1 (theo `docs/ROADMAP.md`, không phải cam kết):

- **Director AI thật** (story/visual) thay fixture, qua contract sẵn có ở `src/ai/*/contract.ts`.
- **TTS thật + voice timeline `exact`** word-level → cân nhắc mở `voiceScenePolicy` ngoài `strict`.
- **Transitions giữa scene** — thuộc runtime/composition layer, driven bởi master-timeline events.
- **Vision QA thật** + bounded repair loop (spec §9: tối đa 1 lần sửa, rồi dừng).
- **Recipe mới** — registry là extension point, không đụng compiler/runtime.

## 16. Commit hashes

`master` @ `94ae480` — 26 commits từ base `5e300c9`:

| Commit | Nội dung |
|---|---|
| `cf053a9` | Task 1 — scaffold repo (vite, remotion, vitest, eslint) |
| `72be20b` | Task 2 — shared primitives (SeededRandom, canonical JSON, SHA-256, ids) |
| `32b2fba` | fix plan Task 2 |
| `fcb1b71` | Task 3 — timeline units, conversions, voice/music/master |
| `e3f1dfb` | Task 4 — Scene DSL v0 Zod schema |
| `4703e55` | Task 5 — Compiled Scene IR types + non-circular compiledHash |
| `d76eda9` | Task 6 — recipe registry + 9 composition primitives |
| `faa98bb` | Task 7 — deterministic scene compiler with diagnostics |
| `5eaa6e0` | fix — typed INVALID_PARAMS; drop unreachable renderer guard |
| `6510ea7` | Task 8 — runtime interpreter + Remotion root composition |
| `087d2b8` | Task 9 — Canvas 2D subsystem + 5 recipes |
| `eb2b340` | Task 10 — Three.js subsystem + 6 recipes |
| `0eea451` | Task 11 — motion recipes + typography layer transform |
| `4798d6d` | fix — pass compiled motion params through verbatim |
| `812907a` | fix plan Task 11 (compiler/runtime boundary) |
| `c132dd6` | Task 12 — AI director contracts + 30s fixture project DSL |
| `bc3bf58` | Task 13 — 5 structural QA layers + vision boundary |
| `b2edd52` | fix qa — total on malformed input; slot-overlap + timeline-overlap |
| `02f0af9` | Task 14 — vite SPA shell with Remotion Player |
| `45239a8` | fix — structural backend registration order; ignore dist in eslint |
| `386cd05` | Task 15 — 30s demo composition + determinism tests + render script |
| `67184d3` | fix — align remotion family to 4.0.191 |
| `f1c611e` | Task 16 — Phase 0 documentation set |
| `d9ffad7` | fix docs — 15 false claims found in review |
| `2fea929` | fix docs — 2 residuals (framesToMs claim, conversion scope) |
| `94ae480` | fix — `.finite()` on recipe params + framesToMs test (final review) |

---

## Phụ lục — Quy trình thực thi & kiểm định

Phase 0 được thực thi theo **subagent-driven development**: 16 task, mỗi task một implementer
context mới + một task reviewer (spec + quality, cả hai verdict bắt buộc), các vòng fix có re-review
scoped. Kết thúc bằng **final whole-branch review** trên model mạnh nhất.

- Final review: **SPEC PASS / QUALITY PASS**, 10/10 lệnh gate exit 0, 240 import edge 0 vi phạm,
  không code ngoài scope mục 30, không secret, docs khớp code.
- Findings: 0 Critical / 0 Important / 2 Minor → cả hai được sửa trong `94ae480` và qua scoped
  re-review **PASS** (0 residual).
- Báo cáo kèm theo từng bước được lưu ở workspace SDD trong lúc chạy; workspace đã được xoá sau khi
  nhánh hoàn tất (đúng quy trình). Lịch sử đầy đủ nằm trong git log ở mục 16.
