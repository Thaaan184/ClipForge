# AUDIT: Arsitektur & Kesiapan Fitur Freeform Canvas Studio

Dokumen ini mencatat audit arsitektur ClipForge v2 sebelum implementasi Freeform Canvas Studio.

---

## 1. Modul Backend Yang Dipakai Ulang & Diintegrasikan

### `apps/api/src/clipforge/render/`
- **`engine.py`**:
  - `render_single_clip`: Titik eksekusi rendering utama. Mengatur pembuatan folder, penyalinan font (`ASSETS_FONTS_DIR`), eksekusi loudnorm 2-pass (`measure_loudnorm_pass1`, `build_loudnorm_af`), pemanggilan FFmpeg (`veryfast`, CRF 18, `yuv420p`), dan integrasi QA via `run_clip_qa`.
  - Integrasi: Dispatcher render akan menambahkan opsi `scene_graph: SceneGraph | None`. Jika ada, panggil `FFmpegSceneCompiler` dari `clipforge.render.scene.compiler` alih-alih `build_reframe_filtergraph`.
- **`reframe.py`**:
  - Berisi logika filtergraph legacy: `blur` (gblur sigma 30, eq brightness -0.08), `center` (crop 1080x1920), `stacked` (split 2, game_roi + face_roi vstack).
  - Dipakai sebagai referensi konverter `legacy_reframe_to_scene` di `render/scene/legacy.py`.
- **`loudnorm.py` & `qa/inspector.py`**:
  - `loudnorm.py`: Tetap dipakai langsung untuk 2-pass EBU R128 audio normalization.
  - `qa/inspector.py`: Validasi durasi (toleransi ±1.5s), dimensi (1080x1920), pixel format (`yuv420p`), dan stream video/audio.

### `apps/api/src/clipforge/ingest/`
- **`download.py`**:
  - `download_video_range`: Mendukung download parsial menggunakan yt-dlp `--download-sections "*START-END"` atau potongan video lokal dengan padding.
  - Dipakai ulang untuk implementasi `prepare_segment(job_id, start, end, pad_s=1.0)`: menghasilkan `full.mp4` (kualitas sumber) dan `proxy.mp4` (720p H.264, GOP `-g 30`, `+faststart`).
- **`probe.py`**:
  - `probe_video`: Mendapatkan metadata video sumber (width, height, fps, duration).

### `apps/api/src/clipforge/subtitles/`
- **`ass_builder.py`**:
  - `generate_ass_script`: Generator script ASS word-level karaoke.
  - Untuk Freeform Studio, pastikan script ASS memiliki header resolusi eksplisit:
    `PlayResX: 1080` dan `PlayResY: 1920` agar ukuran font dan posisi tidak bergeser saat di-burn ke kanvas 1080×1920.

### `apps/api/src/clipforge/jobs/`
- **`pipeline.py` (`stage_render_clips`)**:
  - Mengambil kandidat terpilih (`status = 'kept'` atau `candidate_ids`), download rentang video ke `raw.mp4`, transkripsi audio Whisper lokal, buat file ASS, lalu panggil `render_single_clip`.
  - Dispatcher per kandidat: Cek apakah kandidat memiliki `render_mode == 'freeform'` dan ada data scene graph. Jika ya, compile via scene graph; jika tidak, gunakan reframe preset lama.
- **`models.py` & `core/config.py`**:
  - Pengaturan `CF_*` (`CF_DATA_DIR`, `CF_MAX_CONCURRENT_JOBS`, `CF_MAX_CONCURRENT_FFMPEG`, `CF_FFMPEG_ENCODER`, `CF_COOKIES_FILE`).
  - Mengikuti pola BaseSettings pydantic v2.

---

## 2. Pola Migrasi Database SQLite

- Migrasi menggunakan file SQL berurutan di `apps/api/src/clipforge/db/migrations/`:
  - `0001_initial.sql`
  - `0002_finished_clips.sql`
  - `0003_subtitle_speaker_position.sql`
- File migrasi baru: `0004_freeform_scene_graphs.sql`:
  1. Tambah kolom `render_mode TEXT NOT NULL DEFAULT 'preset'` ke tabel `candidates`.
  2. Buat tabel `scene_graphs`:
     - `candidate_id TEXT PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE`
     - `job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE`
     - `scene_json TEXT NOT NULL`
     - `created_at TEXT NOT NULL`
     - `updated_at TEXT NOT NULL`
  3. Tambah kolom `scene_json TEXT DEFAULT NULL` ke tabel `clips` dan `finished_clips` untuk snapshot hasil render (agar re-render dari Subtitle Studio tidak kehilangan layout).

---

## 3. Pola Route & Alur Pemanggilan Render

- Prefix API: `/api/jobs/...` dan `/api/clips/...`.
- Alur kandidat:
  - `GET /api/jobs/{job_id}/candidates`: Mengambil kandidat.
  - `PATCH /api/jobs/candidates/{candidate_id}`: Mengubah review status (`kept`/`rejected`/`proposed`), start/end time, dan kini `render_mode` (`preset` | `freeform`).
  - Route baru:
    - `POST /api/jobs/{job_id}/segments`: Membuat segmen proxy untuk preview.
    - `GET /api/segments/{segment_id}`: Cek status segmen.
    - `GET /api/segments/{segment_id}/proxy`: Streaming video proxy dengan HTTP Range.
    - `GET /api/jobs/candidates/{cand_id}/scene` & `PUT /api/jobs/candidates/{cand_id}/scene`: Mengambil & menyimpan scene graph.
    - `POST /api/jobs/candidates/{cand_id}/scene/preview-frame`: Render 1 frame PNG untuk verifikasi.
- Eksekusi render:
  - Tetap melalui `POST /api/jobs/{job_id}/render`.
  - Dispatcher di `stage_render_clips` membaca `render_mode` per kandidat dan `scene_graphs` dari DB.

---

## 4. Arsitektur Frontend & Desain Sistem

- **Stack**: React 18, TypeScript, Tailwind CSS, `@tanstack/react-query`, `lucide-react`.
- **Desain Sistem & Styling Baseline**:
  - Tema: Industrial Film Brutalist Console (`bg-bg #0A0A0A`, `bg-card #141414`, `border-line #232634`, aksen `action #FF6A00`, font sans/mono).
  - Utility CSS: `.marked-card`, `.marked-frame`, `.crop-mark`, `.film-perfs`, `.btn-action`.
- **State Management**:
  - `zustand` akan ditambahkan untuk store Freeform Studio (scene graph, selection, active tool, draft shape, undo/redo stack, autosave debouncing).
- **Integrasi di Siap Review (`CandidateCard.tsx` & `App.tsx`)**:
  - Di kartu kandidat tahap 7: Selector mode render `[Preset] | [Freeform Canvas]`.
  - Tombol "Buka Studio Freeform" membuka modal `FreeformStudio`.
  - Badge status: `Belum diedit` (merah/kuning) vs `Sudah diedit (N layer)` (hijau).
  - Peringatan di tombol render batch jika ada kandidat Keep + Freeform yang belum diedit.
