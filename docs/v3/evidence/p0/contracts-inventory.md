# Inventaris Kontrak Antar-Komponen — ClipForge v3 P0

Dokumentasi lengkap kontrak sistem ClipForge v2 sebagai baseline untuk arsitektur v3 Editorial.

## 1. REST Endpoints (`apps/api/src/clipforge/api/routes/`)

### Jobs (`jobs.py`)
- `POST /jobs` — Buat job pemrosesan VOD baru (`JobCreateRequest` -> `JobResponse`, 202 Accepted)
- `POST /jobs/manual` — Buat klip manual spesifik (`JobCreateRequest` -> `JobResponse`, 202 Accepted)
- `POST /jobs/{job_id}/manual-clips` — Tambah klip manual ke job berjalan (`AddManualClipsRequest`)
- `GET /jobs` — Daftar semua job (`list[JobResponse]`)
- `GET /jobs/{job_id}` — Detail status & progress job (`JobResponse`)
- `POST /jobs/{job_id}/cancel` — Batalkan job
- `DELETE /jobs/{job_id}` — Hapus job & direktori data
- `GET /jobs/{job_id}/events` — Server-Sent Events (SSE) telemetry stream
- `GET /jobs/{job_id}/timeline` — Sinyal audio/chat/heatmap per detik (`TimelineResponse`)
- `GET /jobs/{job_id}/candidates` — Daftar kandidat klip hasil fusi & LLM (`CandidatesResponse`)
- `PATCH /candidates/{candidate_id}` — Update kandidat (status: `kept`/`rejected`, user timing: `user_start_s`, `user_end_s`)
- `GET /candidates/{candidate_id}/scene` — Ambil Freeform SceneGraph JSON
- `PUT /candidates/{candidate_id}/scene` — Update Freeform SceneGraph JSON
- `POST /candidates/{candidate_id}/scene/preview-frame` — Render 1 snapshot still frame SceneGraph
- `POST /jobs/{job_id}/render` — Trigger render klip final (`RenderJobRequest`, 202 Accepted)
- `GET /jobs/{job_id}/clips` — Ambil daftar klip yang selesai dirender

### Clips (`clips.py`)
- `GET /clips` — Daftar klip yang selesai (`list[ClipResponse]`)
- `GET /clips/{clip_id}` — Detail klip individual
- `GET /clips/{clip_id}/video` — Streaming video MP4
- `GET /clips/{clip_id}/thumb` — Image thumbnail JPEG
- `GET /clips/{clip_id}/subtitles` — Daftar subtitle words kata per kata
- `PUT /clips/{clip_id}/subtitles` — Simpan revisi subtitle words
- `POST /clips/{clip_id}/subtitles/preview` — Render WYSIWYG preview frame pada detik tertentu
- `POST /clips/{clip_id}/rerender` — Render ulang klip dengan timing/preset baru
- `GET /clips/{clip_id}/subtitles.srt` — Download subtitle format SRT
- `GET /clips/finished` — Arsip seluruh klip lintas-proyek
- `GET /clips/finished/{clip_id}/video` — Streaming video arsip
- `DELETE /clips/finished/{clip_id}` — Hapus klip dari arsip

### Presets & System (`presets.py`, `health.py`)
- `GET /presets/scenes` — Daftar template preset Freeform
- `POST /presets/scenes` — Buat template preset baru
- `PUT /presets/scenes/{preset_id}` — Update preset Freeform
- `DELETE /presets/scenes/{preset_id}` — Hapus preset Freeform
- `GET /healthz` — Liveness probe (200 OK)
- `GET /readyz` — Readiness probe (database connection & disk check)
- `GET /api/system/diagnostics` — Telemetri hardware & versi dependency

## 2. Status Lifecycle Job (State Machine v2)

```
PENDING → VALIDATE → FETCH_SIGNALS → ANALYZE_SIGNALS → FUSE_CANDIDATES → TARGETED_ASR → SCOUT_RERANK → AWAITING_REVIEW (human-in-the-loop) → RENDERING → DONE
Fail states: FAILED, CANCELLED
```

## 3. Skema Data Kunci (Pydantic v2)

### `JobCreateRequest`
```python
class JobCreateRequest(BaseModel):
    url: str
    clip_count: int = 5
    genre: str = "gaming"
    language: str = "id"
    reframe_mode: str = "blur"  # "blur" | "center" | "stacked"
    subtitle_style: str = "classic_white"  # Akan diubah ke "none" pada P1
    subtitle_position: str = "bottom"  # "bottom" | "top"
    manual_clips: list[ManualClipRequest] | None = None
```

### `ScoutVerdict` (Skema Output LLM Scout)
```python
class ScoutVerdict(BaseModel):
    decision: Literal["KEEP", "REJECT"]
    confidence: float = Field(ge=0.0, le=1.0)
    category: str  # misal: "clutch", "funny_fail", "high_kill", "tactical"
    title: str = Field(max_length=60)
    hook_text: str = Field(max_length=40)
    reason: str = Field(max_length=200)
```

### `SceneGraph` (Freeform Canvas v2)
```python
class SceneGraph(BaseModel):
    version: int = 1
    canvas: CanvasConfig  # width: 1080, height: 1920, bg_color: str
    layers: list[Layer]   # VideoLayer, ImageLayer, TextLayer, SubtitleLayer
    # Transform geometry: x, y, width, height, rotation, z_index, opacity, mask (rect, ellipse, lasso)
```

## 4. Daftar Preset Subtitle v2

Lokasi: `apps/api/src/clipforge/subtitles/presets/`
1. `classic_white.yaml` (Default v2)
2. `fire_orange.yaml`
3. `hormozi_bold.yaml`
4. `mrbeast_box.yaml`
5. `neon_glow.yaml`
6. `minimal_clean.yaml`
7. `none.yaml` (Daftar kata kosong, tanpa filter burning)

## 5. Tipe Frontend (`apps/web/src/types.ts`)

- `Job`: `id`, `source_url`, `status`, `stage`, `progress`, `created_at`, `params_json`
- `Candidate`: `id`, `rank`, `start_s`, `end_s`, `peak_s`, `final_score`, `category`, `title`, `hook_text`, `status`, `render_mode`
- `Clip`: `id`, `candidate_id`, `status`, `video_path`, `thumb_path`, `srt_path`, `qa_json`
- `SubtitleWord`: `idx`, `start_s`, `end_s`, `text`, `confidence`, `speaker`, `pos_y`
- `SceneGraph`: `canvas`, `layers`, `subtitles`
