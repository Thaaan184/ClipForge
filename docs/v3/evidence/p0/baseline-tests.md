# Hasil Test Baseline — ClipForge v3 P0

Hasil eksekusi test suite baseline pada branch `v3/p0-baseline` (commit `b92f6ee3cddf4787c376cb41711637c1e86cb895`).

## 1. Ringkasan Eksekusi Test

| Suite | Perintah | Status | Lulus | Gagal | Di-skip | Durasi |
|---|---|---|---|---|---|---|
| Backend Unit & Integration | `cd apps/api && uv run pytest` | **VERIFIED** | 107 | 0 | 0 | 28.23 s |
| Frontend Unit Tests | `cd apps/web && npm test` | **VERIFIED** | 12 | 0 | 0 | 0.45 s |
| Frontend Typecheck & Build | `cd apps/web && npm run build` | **VERIFIED** | OK | 0 | 0 | 11.10 s |
| Frontend Lint | `cd apps/web && npm run lint` | **VERIFIED** | OK (0 warnings) | 0 | 0 | 2.10 s |

**Total Test Otomatis**: 119 Passed, 0 Failed, 0 Skipped.

## 2. Rincian Test Backend per Modul (`apps/api`)

- `tests/integration/test_clips_api.py`: 1 passed (CRUD clips & subtitles)
- `tests/integration/test_db_migration.py`: 1 passed (clean migrations 0001-0005)
- `tests/integration/test_freeform_e2e_pipeline.py`: 1 passed (mixed batch & safety skip)
- `tests/integration/test_health.py`: 2 passed (`/healthz` dan `/readyz`)
- `tests/integration/test_job_lifecycle.py`: 5 passed (validation, review, cancel, recovery, SSE)
- `tests/integration/test_pipeline_e2e_synthetic.py`: 1 passed (signals pipeline e2e)
- `tests/integration/test_pipeline_fase4_e2e.py`: 1 passed (fase 4 full quality cycle)
- `tests/integration/test_render_integration.py`: 1 passed (blur render & QA inspector)
- `tests/integration/test_scene_render_synthetic.py`: 1 passed (synthetic lavfi scene render)
- `tests/integration/test_timeline_api.py`: 1 passed (timeline & candidates endpoints)
- `tests/unit/test_ass_generator.py`: 4 passed (centisecond, presets, none preset, active word highlight)
- `tests/unit/test_audio_signals.py`: 2 passed (silence vs loud spike)
- `tests/unit/test_boundary_snap.py`: 2 passed (snap to silence & invariants)
- `tests/unit/test_chat_signals.py`: 2 passed (unavailable & lag compensation)
- `tests/unit/test_checkpoints.py`: 2 passed (hash & lifecycle)
- `tests/unit/test_clip_qa.py`: 2 passed (missing vs valid ffprobe)
- `tests/unit/test_evaluation_metrics.py`: 2 passed (exact hit & tbd end)
- `tests/unit/test_fusion_candidates.py`: 3 passed (temporal IoU, reweighting, duration bounds)
- `tests/unit/test_fusion_normalize.py`: 2 passed (robust Z-invariance & unit clamping)
- `tests/unit/test_heatmap_signals.py`: 2 passed (unavailable & interpolation)
- `tests/unit/test_llm_scout.py`: 3 passed (heuristic talking reject, combat action keep, mocked LLM)
- `tests/unit/test_loudnorm.py`: 2 passed (fallback & two-pass EBU R128)
- `tests/unit/test_manual_clip.py`: 11 passed (request validation, styling, positioning, safe zone)
- `tests/unit/test_presets_routes.py`: 1 passed (scene presets lifecycle)
- `tests/unit/test_quality_gates.py`: 3 passed (gaming talking vs intense combat vs podcast)
- `tests/unit/test_reframe_filtergraph.py`: 4 passed (blur, center crop, stacked, without subtitles)
- `tests/unit/test_scene_compiler.py`: 5 passed (single rect, rotated ellipse, lasso, 5 layers, determinism)
- `tests/unit/test_scene_geometry.py`: 5 passed (round even, clamp, padding, rotw/roth, douglas-peucker)
- `tests/unit/test_scene_legacy.py`: 3 passed (blur, center, stacked legacy reframe)
- `tests/unit/test_scene_masks.py`: 3 passed (hex color, layer assets, gradient background)
- `tests/unit/test_scene_routes.py`: 2 passed (candidate scene routes & 404 handler)
- `tests/unit/test_scene_schema.py`: 7 passed (z-normalization, rotation, out-of-bounds, duplicate layer, lasso, unknown source, forbidden extra fields)
- `tests/unit/test_sentence_boundary_snap.py`: 2 passed (word start & punct end, clamp invariants)
- `tests/unit/test_subtitles_chunker.py`: 3 passed (max words, pause, punctuation)
- `tests/unit/test_subtitles_validator.py`: 2 passed (normalize text & word invariants)
- `tests/unit/test_targeted_asr.py`: 2 passed (missing audio empty transcript, mocked slice)
- `tests/unit/test_time.py`: 3 passed (time conversions, ASS format, SRT format)
- `tests/unit/test_url_validation.py`: 6 passed (valid URLs, invalid schemes, credentials, disallowed hosts, private IP, missing ID)
- `tests/unit/test_vad.py`: 2 passed (silence vs speech burst)

## 3. Rincian Test Frontend (`apps/web`)

- `src/lib/scene/geometry.test.ts`: 7 passed (geometry math, bbox, clamp)
- `src/lib/scene/store.test.ts`: 5 passed (layer addition, selection, reordering, deletion, undo/redo)
