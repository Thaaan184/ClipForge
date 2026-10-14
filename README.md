# ClipForge v2

> **High-Performance Video Clipper: Signal-First AI Scout & Multi-Segment Manual Cutting for 9:16 Shorts**

ClipForge v2 adalah platform pemotong video vertikal (9:16) mutakhir untuk gaming highlight, podcast, dan livestream VOD YouTube. Mengusung arsitektur **Signal-First, LLM-Last**, ClipForge memproses rekaman panjang (hingga 8 jam) secara efisien tanpa pembengkakan biaya token atau latensi tinggi.

Dilengkapi studio editing subtitle interaktif per kata (*kinetic typography*), visualisasi kurva sinyal multi-lane, serta manajemen proyek berbasis URL video sumber tunggal.

---

## ⚡ Fitur Utama

### 1. Dual Mode Pemotongan
* **Auto Clipper (AI Highlight Scout)**: Deteksi otomatis berbasis fusi sinyal audio energy surge, onset density, voice activity (Silero VAD), chat velocity, dan replay heatmap. Transkripsi Whisper ASR dan verifikasi LLM hanya dieksekusi pada kandidat momen terbaik.
* **Manual Multi-Clip Batch**: Potong beberapa segmen sekaligus dalam 1 input dengan format timestamp fleksibel (`MM:SS`, `HH:MM:SS`, atau detik).

### 2. Manajemen Proyek Terpusat (1 Video, Banyak Klip)
* **Single Project Instance**: Tidak perlu membuat job baru untuk video yang sama. Tambahkan baris klip manual baru kapan saja ke proyek yang sudah berjalan melalui tombol *+ Tambah Klip ke Proyek*.
* **Thumbnail Video Sumber**: Daftar proyek di dashboard langsung menampilkan thumbnail resolusi tinggi dari video YouTube sumber.

### 3. Reframe Vertikal 9:16 Adaptif
* **Blur Pillarbox (Lanczos)**: Background video diburamkan secara artistik dengan rasio aspek asli tetap proporsional di tengah.
* **Center Crop**: Fokus langsung ke bagian tengah video secara dinamis.
* **Stacked Cam/Game**: Tata letak vertikal bertumpuk untuk konten reaksi streaming (facecam atas, gameplay bawah).

### 4. Engine Subtitle Kinetic & Presets
* **Rendering Subtitle Libass**: Subtitle dibakar langsung (*hardcode*) ke video dengan presisi *sub-pixel* dan *frame-accurate*.
* **Pilihan Preset Visual Populer**:
  * `Classic White`: Teks putih bersih dengan drop-shadow solid.
  * `Hormozi Bold`: Tipografi tebal warna kuning kontras tinggi dengan aksen hijau/putih.
  * `Fire Orange`: Aksen oranye menyala untuk momen intens.
  * `MrBeast Box`: Banner teks punchy ala konten viral YouTube Shorts.
  * `Neon Glow`: Nuansa futuristik cyan/magenta.
  * `Minimal Clean`: Gaya minimalis modern tanpa bayangan berlebih.
  * `None (Tanpa Subtitle)`: Ekspor klip mentah ekstra cepat.
* **Posisi Subtitle Fleksibel**: Pilihan lokasi Bawah (`Y=1680`) atau Atas (`Y=420`, YT Shorts Safe Area).

### 5. Studio Editor Subtitle Interaktif
* Koreksi teks dan timing per-kata (*word-level timestamps*).
* Preview frame langsung (*live ASS render preview*).
* Re-render instan dengan proteksi timeout koneksi dan sinkronisasi otomatis ke repositori klip final.

### 6. QA Otomatis & Normalisasi Audio EBU R128
* **Loudnorm 2-Pass**: Menjamin volume suara konsisten dan standar broadcast tanpa distorsi clipping.
* **Strict QA Gate**: Verifikasi otomatis resolusi (1080x1920), format warna `yuv420p`, sinkronisasi A/V (<80ms), dan toleransi durasi frame.

---

## 🏛️ Arsitektur Pipeline

```
[ YouTube VOD / Link Sumber ]
              │
              ├── [ Ingest & Probe Metadata ]
              │
    ┌─────────┴────────────────────────────────┐
    ▼                                          ▼
[ Mode Auto AI Scout ]              [ Mode Manual Multi-Clip ]
    │                                          │
    ├─ Extract Cheap Signals                   ├─ Parse Timestamps (Batch)
    │  (Audio Surge, VAD, Heatmap, Chat)       │
    ├─ Signal Normalization & Window Fusion    │
    ├─ Targeted Whisper ASR                    │
    ├─ LLM Verification & Hook Ranking         │
    └──────────────────┬───────────────────────┘
                       ▼
       [ Tahap Review & Kurasi Kandidat ]
         - Atur batas waktu (start/end)
         - Tentukan preset subtitle & reframe
         - Toggle status: Keep / Reject
                       ▼
            [ FFmpeg 9:16 Render Engine ]
              ├─ Video Crop / Blur Reframe (veryfast)
              ├─ 2-Pass Audio Loudnorm
              ├─ Kinetic Subtitle Burning
              └─ Automated QA Gate Check
                       ▼
         [ Studio Editing / Klip Siap Unduh ]
```

---

## 💻 Spesifikasi Minimum & Kebutuhan Hardware

ClipForge dioptimalkan agar dapat berjalan pada infrastruktur hemat biaya tanpa ketergantungan wajib pada GPU.

| Komponen | Spesifikasi Minimum (Budget/Cloud VM) | Rekomendasi (High-Throughput) |
| :--- | :--- | :--- |
| **CPU** | 2 vCPU / 2 Core (x86_64) | 4 vCPU / 4+ Core |
| **RAM** | 4 GB (+ minimal 2 GB Swap File) | 8 GB – 16 GB |
| **Penyimpanan** | 25 GB SSD (ruang kosong minimal 15 GB) | 50+ GB NVMe SSD |
| **GPU** | Tidak wajib (Jalan via CPU CTranslate2) | NVIDIA GPU (opsional, NVENC) |
| **Jaringan** | 20+ Mbps | 100+ Mbps (unduh VOD cepat) |
| **Sistem Operasi**| Ubuntu 22.04 / 24.04 LTS, Debian 12 | Ubuntu 22.04 / 24.04 LTS |

> **Catatan Penggunaan Resource**:
> * **RAM**: Model Whisper `base` mengonsumsi ~500 MB RAM runtime. Container Web Nginx mengonsumsi < 50 MB.
> * **CPU**: Filtergraph FFmpeg (blur pillarbox + libass burning) akan memaksimalkan penggunaan core saat rendering. Preset `veryfast` memangkas waktu render hingga ~30-40 detik untuk klip 2-3 menit.
> * **Disk**: Pastikan ruang kosong mencukupi untuk menyimpan file unduhan video mentah sebelum proses pemotongan segmen.

---

## 🚀 Panduan Menjalankan

### Opsi 1: Menggunakan Docker Compose (Produksi / VM)

1. **Clone repositori**:
   ```bash
   git clone https://github.com/Thaaan184/Clipper.git clipforge
   cd clipforge
   ```

2. **Salin dan sesuaikan file environment**:
   ```bash
   cp .env.example .env
   ```

3. **Jalankan container**:
   ```bash
   docker compose up -d --build
   ```

4. **Akses antarmuka**:
   * **Web Dashboard**: `http://localhost:8080` (atau IP server Anda)
   * **Backend API Swagger**: `http://localhost:8000/docs`
   * **Health Check**: `http://localhost:8000/healthz`

---

### Opsi 2: Menjalankan Lokal untuk Development

#### Prasyarat
* Python 3.11+
* Node.js 20+
* FFmpeg terpasang di sistem (`--enable-libass`)
* [`uv`](https://github.com/astral-sh/uv) (Package manager Python berkecepatan tinggi)

#### 1. Backend (FastAPI)
```bash
cd apps/api

# Setup virtual environment & instalasi dependensi
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]"

# Jalankan server API
uvicorn clipforge.api.app:app --reload --port 8000
```

#### 2. Frontend (React + Vite)
```bash
cd apps/web

# Instalasi paket & jalankan dev server
npm install
npm run dev
```
Buka browser di `http://localhost:5173`.

---

## ⚙️ Variabel Konfigurasi (`.env`)

| Variabel | Default | Keterangan |
| :--- | :--- | :--- |
| `CF_DATA_DIR` | `./data` | Direktori penyimpanan file video, cache klip, dan DB |
| `CF_DB_PATH` | `./data/clipforge.db` | Lokasi database SQLite |
| `CF_PORT` | `8000` | Port listen API server |
| `CF_CORS_ORIGINS` | `["http://localhost:5173","http://localhost:8080"]` | Domain frontend yang diizinkan |
| `CF_MAX_VOD_SECONDS` | `28800` | Batas durasi video input (28800s = 8 jam) |
| `CF_MAX_CONCURRENT_JOBS` | `1` | Maksimal job pipeline yang diproses serentak |
| `CF_MAX_CONCURRENT_FFMPEG`| `2` | Batas proses encoding FFmpeg paralel |
| `CF_WHISPER_MODEL` | `base` | Model Whisper: `tiny`, `base`, `small`, `medium` |
| `CF_WHISPER_DEVICE` | `auto` | `auto`, `cpu`, atau `cuda` |
| `CF_WHISPER_COMPUTE` | `auto` | `int8`, `float16`, atau `auto` |
| `CF_LLM_BASE_URL` | `http://localhost:20128/v1` | URL endpoint LLM kompatibel OpenAI |
| `CF_LLM_MODEL` | `gemini-2.5-flash` | Nama model LLM untuk review kandidat |
| `CF_FFMPEG_ENCODER` | `libx264` | Encoder video: `libx264` (CPU) atau `h264_nvenc` |
| `CF_COOKIES_FILE` | - | Lokasi file `cookies.txt` YouTube (opsional) |

---

## 🔌 Ringkasan API Endpoints

### Jobs & Pipeline
* `POST /api/jobs` : Membuat job pemrosesan otomatis (AI Scout).
* `POST /api/jobs/manual` : Membuat job baru berbasis klip manual langsung masuk tahap review.
* `POST /api/jobs/{job_id}/manual-clips` : Menambahkan segmen klip manual baru ke proyek eksisting.
* `GET /api/jobs` : Mengambil daftar proyek terakhir beserta metadata thumbnail sumber.
* `GET /api/jobs/{job_id}` : Memeriksa status, tahapan, dan progress job.
* `GET /api/jobs/{job_id}/timeline` : Mengambil kurva sinyal multi-modal dan boundary kandidat.
* `GET /api/jobs/{job_id}/candidates` : Mengambil daftar kandidat momen hasil deteksi sinyal.
* `PATCH /api/jobs/candidates/{cand_id}` : Memperbarui kurasi status (kept/rejected) atau timing segmen.
* `POST /api/jobs/{job_id}/render` : Memicu batch rendering klip vertikal untuk kandidat terpilih.

### Clips & Studio Editing
* `GET /api/jobs/{job_id}/clips` : Mengambil daftar klip yang berhasil dirender dalam suatu job.
* `GET /api/clips/{clip_id}` : Mengambil detail metadata file video dan QA satu klip.
* `GET /api/clips/{clip_id}/thumb` : Stream thumbnail gambar JPEG dari klip vertikal.
* `GET /api/clips/{clip_id}/subtitles` : Mengambil word-level subtitle track dan preset aktif.
* `PUT /api/clips/{clip_id}/subtitles` : Memperbarui teks dan timing kata subtitle.
* `POST /api/clips/{clip_id}/rerender` : Me-render ulang video dengan revisi subtitle/reframe terbaru.
* `POST /api/clips/{clip_id}/save` : Menyimpan klip ke galeri *Finished Clips*.
* `GET /api/clips/finished` : Mengambil seluruh koleksi klip final siap publikasi.

---

## 🧪 Pengujian & Standar Kualitas

Eksekusi seluruh unit test dan integrasi untuk memastikan stabilitas sistem:

```bash
# Pengujian Backend (79 Test Suite)
cd apps/api
uv run pytest -v

# Type-checking & Linter
uv run ruff check .
uv run mypy src/clipforge

# Build Frontend Web
cd apps/web
npm run build
```

---

## 📦 Struktur Monorepo

```
.
├── apps/
│   ├── api/                              # Backend FastAPI
│   │   ├── src/clipforge/
│   │   │   ├── api/routes/               # REST API Endpoints (jobs, clips, health)
│   │   │   ├── asr/                      # Whisper ASR Engine & Word Alignment
│   │   │   ├── core/                     # Konfigurasi Pydantic & Logging
│   │   │   ├── db/                       # Koneksi SQLite & Skema Migrasi
│   │   │   ├── ingest/                   # Download Video, yt-dlp, Metadata Probe
│   │   │   ├── jobs/                     # Pipeline Engine, Stage Runners, State
│   │   │   ├── qa/                       # Strict Video QA Inspector
│   │   │   ├── render/                   # FFmpeg Filtergraph, Loudnorm, Subtitle Burn
│   │   │   ├── signals/                  # Audio Energy, VAD, Heatmap, Chat Scout
│   │   │   ├── subtitles/                # Kinetic Generator, Presets & Chunker
│   │   │   └── timeline/                 # Signal Downsampling & Curve Serialization
│   │   └── tests/                        # 79 Unit & Integration Pytest Suites
│   └── web/                              # Frontend React 18 + TypeScript + Vite
│       └── src/
│           ├── components/               # UI: JobForm, CandidateCard, TimelineVisualizer,
│           │                             # SubtitleEditor, AddManualClipModal, ClipPlayer
│           ├── api.ts                    # Typed API Client & Thumbnail Resolver
│           └── types.ts                  # Shared Interface Types
├── docker/                               # Konfigurasi Dockerfile.api, web & Nginx
├── docs/                                 # ADR, Baseline Legacy v1, & Analisis
├── docker-compose.yml                    # Stack Orkestrasi Produksi
├── .env.example                          # Template Variabel Lingkungan
└── README.md                             # Dokumentasi Teknis Utama
```

---

## 📄 Lisensi & Riwayat

* **Lisensi**: MIT License.
* **Riwayat Legacy**: Kode v1 diarsipkan secara permanen pada branch `legacy/v1` dan tag `legacy-v1-final`. Audit perbandingan arsitektur tersimpan di `docs/legacy/LEGACY_AUDIT.md`.
