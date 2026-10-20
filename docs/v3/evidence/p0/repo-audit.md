# Audit Struktur Monorepo vs Brief v2 — ClipForge v3 P0

Audit menyeluruh kondisi aktual repositori `Thaaan184/ClipForge` (baseline `legacy-v2-final` / SHA `b92f6ee`) terhadap Executive Technical Brief (`docs/v3/seed/00-handover-v2.md`).

## 1. Tabel Modul Backend (`apps/api/src/clipforge/`)

| Modul | Status | Lokasi Riil | Catatan & Analisis |
|---|---|---|---|
| `api.routes` | **VERIFIED** | `apps/api/src/clipforge/api/routes/` | Berisi `jobs.py`, `clips.py`, `presets.py`, `health.py`, `segments.py`. Routing modular. |
| `asr` | **VERIFIED** | `apps/api/src/clipforge/asr/` | `transcribe.py`, `models.py`. Faster-Whisper CTranslate2 int8, word timestamps alignment. |
| `boundaries` | **VERIFIED** | `apps/api/src/clipforge/boundaries/` | Snapping boundary ke silence VAD & kata transkrip. |
| `core` | **VERIFIED** | `apps/api/src/clipforge/core/` | `config.py` (Pydantic v2 `BaseSettings`), `time.py`, `errors.py`, `logging.py`. |
| `db` | **VERIFIED** | `apps/api/src/clipforge/db/` | `connection.py` (`aiosqlite`), `migrations/` (0001–0005 SQL). |
| `eval` | **VERIFIED** | `apps/api/src/clipforge/eval/` | `evaluate.py`. Evaluasi Recall@K dan Mean IoU vs ground truth. |
| `fusion` | **VERIFIED** | `apps/api/src/clipforge/fusion/` | `normalize.py`, `candidates.py`, `snap.py`, `presets/`. Robust Z-score, Gaussian smoothing, NMS. |
| `ingest` | **VERIFIED** | `apps/api/src/clipforge/ingest/` | `ytdlp.py`. yt-dlp metadata probe, range download, live chat jsonl. |
| `jobs` | **VERIFIED** | `apps/api/src/clipforge/jobs/` | `runner.py`, `engine.py`, `checkpoints.py`, `models.py`. State machine async 7 stages. |
| `llm` | **VERIFIED** | `apps/api/src/clipforge/llm/` | `client.py`, `scout.py`, `prompts/`. OpenAI client, fallback heuristic KEEP/REJECT. |
| `qa` | **VERIFIED** | `apps/api/src/clipforge/qa/` | `inspector.py`. Otomatis cek ffprobe, resolusi 1080x1920, yuv420p, audio drift. |
| `quality` | **VERIFIED** | `apps/api/src/clipforge/quality/` | `gates.py`. Pre-ASR heuristic gates (filter talking-only pada gaming). |
| `render` | **VERIFIED** | `apps/api/src/clipforge/render/` | `engine.py`, `reframe.py`, `loudnorm.py`, `scene/`. FFmpeg filtergraph, EBU R128 loudnorm, Freeform compiler. |
| `signals` | **VERIFIED** | `apps/api/src/clipforge/signals/` | `audio.py`, `vad.py`, `chat.py`, `heatmap.py`, `lexicon/`. DSP RMS/flux/onsets, Silero VAD. |
| `subtitles` | **VERIFIED** | `apps/api/src/clipforge/subtitles/` | `ass_builder.py`, `chunker.py`, `validator.py`, `presets/`. Libass generator, active word highlight. |
| `timeline` | **VERIFIED** | `apps/api/src/clipforge/timeline/` | Serialisasi kurva sinyal 1 detik untuk visualisasi UI. |
| `editorial_ai` | **VERIFIED** | `apps/api/src/clipforge/editorial_ai/` | Direktori kosong hasil placeholder v2 awal. Akan diisi modul v3 editorial. |
| `references` | **VERIFIED** | `apps/api/src/clipforge/references/` | Direktori kosong. |

## 2. Tabel Modul Frontend (`apps/web/src/`)

| Modul | Status | Lokasi Riil | Catatan & Analisis |
|---|---|---|---|
| `components/` | **VERIFIED** | `apps/web/src/components/` | `CandidateCard.tsx`, `TimelineVisualizer.tsx`, `SubtitleEditor.tsx`, `JobProgress.tsx`, dll. |
| `components/freeform/` | **VERIFIED** | `apps/web/src/components/freeform/` | `FreeformStudio.tsx`, `CanvasViewport.tsx`, `TransformGizmo.tsx`, `LayerList.tsx`, `AssetTray.tsx`. |
| `lib/scene/` | **VERIFIED** | `apps/web/src/lib/scene/` | `store.ts` (Zustand state), `geometry.ts` (affine transform math), `compiler.ts`. |
| `api.ts` | **VERIFIED** | `apps/web/src/api.ts` | Fetch API client terstruktur. |
| `types.ts` | **VERIFIED** | `apps/web/src/types.ts` | TypeScript domain interfaces untuk Job, Candidate, Clip, Subtitles, Scene. |

## 3. Dependency & Toolchain

- **Backend (`apps/api`)**: Python 3.11 (`uv`), FastAPI 0.115, Pydantic v2.8, aiosqlite, NumPy, SciPy, Faster-Whisper 1.0.3, OpenAI 1.51, Pillow, yt-dlp.
- **Frontend (`apps/web`)**: React 18.3.1, TypeScript 5.6.3, Vite 5.4.8, TailwindCSS 3.4.13, Zustand 5.0, TanStack Query 5.59, Lucide React, Vitest 2.1.9.
- **Docker**: `docker-compose.yml` (service `api` di port 8000, `web` di port 8080 via Nginx).

## 4. Skema Database SQLite (`data/clipforge.db`)

Tabel terdaftar (**VERIFIED**):
1. `schema_migrations`: tracking versi migrasi (0001–0005).
2. `jobs`: lifecycle job, status, stage, progress, parameter JSON.
3. `stage_runs`: execution telemetry per stage (durasi, status, input_hash).
4. `events`: event stream untuk SSE replay (`/{job_id}/events`).
5. `candidates`: rentang klip yang diprediksi (start_s, end_s, peak_s, scores, flags, render_mode).
6. `clips`: klip final hasil render (video_path, thumb_path, srt_path, qa_json, scene_json).
7. `subtitle_tracks` & `subtitle_words`: kata transkrip kata per kata, confidence, speaker, pos_y.
8. `feedback`: log koreksi human-in-the-loop.
9. `glossary`: kamus leksikon koreksi kata ASR.
10. `finished_clips`: arsip klip selesai lintas-job.
11. `scene_graphs`: JSON layer scene Freeform Canvas per kandidat.
12. `scene_presets`: template layout scene yang dapat dipakai ulang.
