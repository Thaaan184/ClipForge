# BRIEF TEKNIKAL & ARSITEKTUR LENGKAP: CLIPFORGE v2
> **Dokumen Spesifikasi Sistem, Pipeline AI, dan Fondasi Perubahan Menuju ClipForge v3**  
> **Artefak Repositori**: `Thaaan184/ClipForge` | **Branch**: `legacy/v2` | **Tag**: `legacy-v2-final`  
> **Target Pengguna**: Lead Engineer, AI/ML Specialist, Frontend/UI Engineer, Direksi & Stakeholder Produk

---

## 1. Ringkasan Eksekutif & Status Sistem

ClipForge v2 adalah platform pemotong video vertikal (9:16) mutakhir yang didesain untuk mentransformasi rekaman panjang (*livestream* YouTube VOD, turnamen gaming, dan podcast berdurasi hingga 8 jam) menjadi video pendek siap upload untuk YouTube Shorts, Instagram Reels, dan TikTok.

### Paradigma Inti: *Signal-First, LLM-Last*
Pemrosesan video panjang konvensional sering mengalami kegagalan biaya dan komputasi akibat penggunaan Large Language Model (LLM) atau Speech-to-Text (ASR) di seluruh rekaman video. ClipForge v2 memecahkan masalah ini dengan pendekatan bertahap:
1. **Ekstraksi Sinyal Murah**: Memindai metadata, audio energy surge, onset density, voice activity, YouTube chat replay velocity, dan heatmap penonton secara paralel tanpa decoding video utuh.
2. **Fusi Multi-Modal & NMS**: Menggabungkan seluruh sinyal menjadi satu kurva probabilitas dan menghasilkan kandidat momen terbaik melalui Non-Maximum Suppression (NMS).
3. **Targeted ASR**: Whisper ASR hanya mengekstrak transkrip kata pada potongan audio kandidat terpilih.
4. **Verifikasi LLM Berbasis Bukti**: Model LLM hanya bertindak sebagai verifikator akhir untuk mengevaluasi teks transkrip + bukti sinyal, memutuskan KEEP atau REJECT, serta membuat judul dan teks *hook*.

---

## 2. Topologi Monorepo & Lingkungan Eksekusi

```
ClipForge/
├── apps/
│   ├── api/                      # Backend FastAPI, DSP, ASR, LLM & FFmpeg Engine
│   │   ├── src/clipforge/        # Core business logic (modular Python package)
│   │   │   ├── api/routes/       # REST Endpoints (jobs, clips, health, presets)
│   │   │   ├── asr/              # Faster-Whisper ASR & word timestamp alignment
│   │   │   ├── boundaries/       # Boundary snapping to silence & words
│   │   │   ├── core/             # Pydantic v2 settings, time utilities, logging
│   │   │   ├── db/               # SQLite async connection & SQL schema migrations
│   │   │   ├── eval/             # Evaluation metrics runner (Recall@K, Mean IoU)
│   │   │   ├── fusion/           # Robust Z-score normalization, weights, peak finding, NMS
│   │   │   ├── ingest/           # yt-dlp probing, metadata parser, partial range download
│   │   │   ├── jobs/             # Async pipeline engine, checkpointing, state machine
│   │   │   ├── llm/              # OpenAI-compatible client, prompts, heuristic fallback
│   │   │   ├── qa/               # Automated video QA inspector (resolution, drift, format)
│   │   │   ├── quality/          # Pre-ASR heuristic quality gates
│   │   │   ├── render/           # FFmpeg filtergraph, loudnorm EBU R128, scene graph compiler
│   │   │   ├── signals/          # Audio DSP, Silero VAD, Chat NLP, Heatmap interpolation
│   │   │   ├── subtitles/        # Kinetic chunker, Libass ASS generator, presets
│   │   │   └── timeline/         # Downsampled curve serialization for UI visualizer
│   │   └── tests/                # 79 Unit & Integration Test Suites
│   └── web/                      # Frontend SPA React 18, TypeScript, Tailwind, Zustand
│       └── src/
│           ├── components/       # CandidateCard, TimelineVisualizer, SubtitleEditor, dll.
│           ├── components/freeform/ # Freeform Studio, Canvas Viewport, Transform Gizmo
│           ├── lib/scene/        # Zustand scene graph store & affine transformation math
│           ├── api.ts            # Typed Axios client & thumbnail resolver
│           └── types.ts          # Shared TypeScript domain models
├── docker/                       # Dockerfile.api, Dockerfile.web, nginx.conf
├── docs/                         # ADR, baseline legacy v1, golden set evaluation report
├── eval/                         # Ground truth golden set datasets
└── docker-compose.yml            # Production stack orchestration
```

### Spesifikasi Runtime & Kebutuhan Hardware
- **CPU**: 2 vCPU minimum (direkomendasikan 4+ vCPU untuk rendering FFmpeg cepat).
- **RAM**: 4 GB minimum (model Faster-Whisper `base` memakan ~500 MB RAM).
- **Storage**: SSD dengan sisa kapasitas minimal 15–20 GB untuk penyimpanan buffer VOD.
- **GPU**: Opsional. Sistem berjalan optimal pada CPU via CTranslate2 (int8) dan libx264 encoder. Mendukung akselerasi CUDA / NVENC jika GPU tersedia.

---

## 3. Pipeline Workflow End-to-End

Pipeline dijalankan sebagai asynchronous state machine dengan penyimpanan checkpoint status di SQLite:

```
[ Input YouTube URL / File VOD ]
               │
               ▼
┌──────────────────────────────────────────────┐
│ Stage 1: VALIDATE                            │
│ - Probe metadata via yt-dlp (durasi, title)  │
│ - Validasi durasi (maksimal 8 jam / 28800s)  │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Stage 2: FETCH_SIGNALS                       │
│ - Ekstraksi stream audio m4a/opus            │
│ - Download YouTube live chat replay (.jsonl) │
│ - Download kurva 'most replayed' heatmap     │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Stage 3: ANALYZE_SIGNALS                     │
│ - FFmpeg streaming pipe -> NumPy/SciPy DSP   │
│ - RMS Loudness, Crest, Flux Onsets, HF Ratio │
│ - Silero Voice Activity Detection (VAD)      │
│ - NLP chat lag-shift (-6s) & hype matching   │
│ - Heatmap interpolation ke grid 1 detik      │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Stage 4: FUSE_CANDIDATES                     │
│ - Robust Z-score normalization               │
│ - Dynamic reweighting & agreement bonus      │
│ - 1D Gaussian smoothing & peak picking       │
│ - Region growing (alpha=0.5) & clamping      │
│ - Non-Maximum Suppression (IoU 0.30, gap 20s)│
│ - Snap boundary ke hening VAD                │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Stage 5: TARGETED_ASR                        │
│ - Heuristic Quality Gate (reject talking)    │
│ - Faster-Whisper transkripsi audio slice     │
│ - Word-level boundary snapping               │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Stage 6: SCOUT_RERANK                        │
│ - LLM mengevaluasi transkrip + bukti sinyal  │
│ - Keputusan KEEP / REJECT, Judul & Hook      │
│ - Re-ranking kandidat berdasarkan skor akhir │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ [ HUMAN-IN-THE-LOOP REVIEW / STUDIO ]        │
│ - Pengguna meninjau kandidat di UI           │
│ - Atur boundary waktu (user_start, user_end) │
│ - Pilih preset subtitle & mode reframe       │
│ - (Opsional) Desain layout Freeform Canvas   │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Stage 7: RENDER_CLIPS                        │
│ - Download range video HD (raw.mp4)          │
│ - Transkripsi ulang media untuk paritas kata │
│ - Generate skrip Libass subtitle kinetik     │
│ - FFmpeg 9:16 Reframe / Freeform Canvas      │
│ - Audio Loudnorm 2-Pass (EBU R128)           │
│ - Automated QA Inspector (drift, resolution) │
└──────────────────────────────────────────────┘
```

---

## 4. Deep-Dive Sinyal & Machine Learning

### 4.1. Ekstraksi Fitur Audio Streaming (`signals/audio.py`)
Pemrosesan dilakukan langsung dari stdout FFmpeg pipe tanpa pernah memuat seluruh file audio ke RAM:
- **Format**: 16.000 Hz, 1 channel mono, 32-bit float LE (`f32le`).
- **Ukuran Chunk**: 60 detik per iterasi buffer.
- **Metrik Per Detik**:
  - **RMS Loudness**: $L_{\text{dB}} = 20 \log_{10}(\sqrt{\frac{1}{N}\sum x^2} + 10^{-12})$.
  - **Loud Surge**: Selisih nilai $L_{\text{dB}}$ terhadap median bergerak 45 detik (`scipy.ndimage.median_filter`).
  - **Crest Factor**: Indikator letupan suara mendadak (teriakan/tembakan) terhadap baseline: $\text{Peak}_{\text{dB}} - L_{\text{dB}}$.
  - **Onset Density**: Transformasi Fourier Waktu Singkat (STFT, $N_{\text{fft}}=512$, hop=256), menghitung perubahan spektral positif (*spectral flux*), dan menghitung jumlah peak flux di atas ambang batas $\mu + 1.2\sigma$.
  - **High-Frequency Ratio**: Proporsi energi pada rentang 2 kHz – 8 kHz terhadap total spektrum.

### 4.2. Voice Activity Detection (`signals/vad.py`)
- **Silero VAD**: Menggunakan implementasi ONNX dari `faster-whisper.vad.get_speech_timestamps`.
- **Parameter**: `threshold=0.5`, `min_speech_duration_ms=250`, `min_silence_duration_ms=2000`, `speech_pad_ms=400`.
- **Fallback**: Jika terjadi kegagalan modul Silero, sistem otomatis beralih ke Energy VAD dengan hysteresis threshold $-38\text{ dBFS}$.

### 4.3. Natural Language Processing & Kompensasi Jeda Chat (`signals/chat.py`)
- Penonton live streaming YouTube memiliki keterlambatan respons rata-rata 4–8 detik terhadap kejadian di layar.
- **Kompensasi Jeda**: Seluruh event chat dimajukan $\Delta t = -6.0\text{ detik}$.
- **Fitur Chat**:
  - `chat_rate`: Kerapatan pesan per detik.
  - `chat_hype`: Rasio pesan yang mengandung leksikon tertawa (`wkwk`, `haha`, `lol`, `ngakak`, `anjir`) atau hype (`gg`, `pog`, `clutch`, `mati`).
  - `clip_intent`: Rasio pesan penonton yang meminta klip (`clip it`, `potong`, `masuk clip`).

### 4.4. Normalisasi & Fusi Multi-Modal (`fusion/fuse.py`)
- **Robust Z-Score Normalization**:
  $$Z_i = \frac{x_i - \text{median}(x)}{\text{IQR}(x) + 10^{-6}}$$
  Dipetakan ke rentang $[0.0, 1.0]$ menggunakan batas persentil $Z_{\text{lo}}=0.5$ dan $Z_{\text{hi}}=4.0$.
- **Dynamic Weighting**: Bobot sinyal dikalkulasi ulang otomatis bila modalitas chat atau heatmap tidak tersedia pada video sumber.
- **Cross-Modality Agreement Bonus**: Masking dilasi waktu ($\pm 5\text{s}$) yang memberikan injeksi skor $+0.10$ saat $\ge 3$ modalitas berbeda aktif serentak pada interval waktu yang sama.

### 4.5. Deteksi Window Kandidat & NMS (`fusion/candidates.py`)
- **Smoothing**: 1D Gaussian Filter ($\sigma = 2.0\text{ detik}$).
- **Adaptive Threshold**: Menggunakan batas tertinggi antara `abs_floor` ($0.35$) dan persentil-90 ($P_{90}$) kurva.
- **Region Growing**: Window direntangkan ke kiri dan kanan dari puncak sampai skor turun di bawah $\alpha \times \text{Peak}$ ($\alpha = 0.50$).
- **Clamping**: Rentang dibatasi antara 15 detik sampai 90 detik, dengan prioritas *setup* momen (70% pre-roll, 30% post-roll).
- **Non-Maximum Suppression (NMS)**: Mengeliminasi duplikasi kandidat dengan batasan $\text{IoU} \le 0.30$ dan jarak minimum antar puncak $\ge 20\text{ detik}$.

### 4.6. Targeted Speech Recognition (`asr/whisper.py`)
- **Engine**: `faster-whisper` (CTranslate2 backend).
- **Akurasi Dua Tahap**:
  1. *Tahap Kandidat*: Transkripsi audio slice dengan padding 1.0 detik untuk kebutuhan scoring LLM dan snapping batas ke jeda kata.
  2. *Tahap Render*: Transkripsi ulang langsung pada file video terpotong (`raw.mp4`) agar timing kata pada subtitle 100% presisi terhadap file video output (mencegah desinkronisasi milidetik akibat keyframe boundary FFmpeg).

---

## 5. Prompt Engineering & LLM Scout

- **Infrastruktur**: Mengakses endpoint OpenAI API-compatible (default: `http://localhost:20128/v1` via 9Router, model `gemini-2.5-flash` atau `gpt-4o-mini`).
- **Prompt System (`scout_v1.md`)**:
  ```markdown
  Kamu adalah Senior Short-Form Video Scout & Editor untuk YouTube Shorts, Instagram Reels, dan TikTok.
  Tugasmu adalah menganalisis bukti (evidence) kandidat klip video dari livestream VOD dan memutuskan apakah klip ini layak dipertahankan (KEEP) atau dibuang (REJECT).

  Kriteria Klip Bagus (KEEP):
  - Gameplay Highlight: Sustained combat, multi-kill, squad wipe, clutch, objective capture, aksi berintensitas tinggi.
  - Funny Moment / Fail: Momen lucu, aim fail, blunder kocak, lelucon streamer yang mengundang tawa penonton (wkwk/lol di chat).
  - High Drama / Tension: Situasi kritis dengan payoff jelas.

  Kriteria Klip Ditolak (REJECT):
  - Talking-only: Mengobrol santai tanpa payoff aksi atau komedi (terutama untuk genre gaming).
  - Idle / Loading / Menu: Karakter diam, respawn screen, loot tanpa bahaya.
  - False Positive: Teriakan acak sesaat tanpa konteks yang jelas.

  Format Output WAJIB berupa JSON persis:
  {
    "verdict": "KEEP" | "REJECT",
    "category": "gameplay_highlight" | "funny_fail" | "clutch" | "reaction" | "talking_only",
    "title": "<Judul singkat menarik 3-7 kata>",
    "hook_text": "<Kalimat hook pembuka 4-10 kata untuk teks layar awal>",
    "reason": "<Alasan penilaian dalam 1-2 kalimat berbasis bukti>",
    "confidence": <float antara 0.0 sampai 1.0>,
    "flags": [<daftar flag string jika ada>]
  }
  ```
- **Fallback Deterministic Heuristic**: Jika API LLM tidak dapat dihubungi atau timeout, sistem mengevaluasi metrik numerik lonjakan audio ($>0.35$), kerapatan onset ($>1.0$), dan pencarian kata kunci regex (`mati`, `clutch`, `wkwk`, `ngakak`, `squad`) tanpa membatalkan pipeline.

---

## 6. Subtitle Engine & Kinetika Tipografi

- **Renderer**: Libass via FFmpeg filter `subtitles=subs.ass`.
- **Chunking Kinetik (`subtitles/chunker.py`)**: Memecah kalimat transkrip menjadi grup 1–3 kata dengan penonjolan warna kata aktif (*karaoke-style highlighting*).
- **Preset Gaya Visual (`subtitles/presets/`)**:
  - `classic_white`: Teks putih bersih dengan drop-shadow solid.
  - `hormozi_bold`: Tipografi tebal warna kuning kontras tinggi dengan aksen hijau/putih ala Alex Hormozi.
  - `fire_orange`: Aksen oranye menyala untuk momen intens.
  - `mrbeast_box`: Banner teks punchy ala konten YouTube viral.
  - `neon_glow`: Nuansa futuristik cyan/magenta.
  - `minimal_clean`: Desain elegan minimalis tanpa border tebal.
  - `none`: Mode ekspor video mentah tanpa pembakaran subtitle.
- **Safe Area Subtitle**:
  - *Bottom Position*: Posisi standar $Y=1680$ (di atas bar navigasi sosial media).
  - *Top Position*: Posisi aman $Y=420$ (menghindari UI deskripsi dan tombol interaksi Shorts/Reels).

---

## 7. Arsitektur Freeform Canvas Studio

ClipForge v2 menyertakan studio canvas parametrik multi-layer untuk tata letak bebas 9:16 (1080x1920):

### 7.1. Skema Scene Graph v1.1 (`render/scene/schema.py`)
- Koordinat seluruh shape (`rect`, `ellipse`, `lasso`) disimpan dalam ruang koordinat resolusi video sumber asli (`full.mp4`).
- Memisahkan definisi kanvas, layer susunan, transformasi matriks, dan efek visual:
  ```json
  {
    "version": "1.1",
    "canvas": { "width": 1080, "height": 1920, "fps": 30 },
    "background": { "type": "blur_source", "blur_sigma": 20.0, "color": "#0D0D0D" },
    "layers": [
      {
        "id": "layer_facecam",
        "source_id": "source_main",
        "shape": {
          "type": "ellipse",
          "bbox": { "x": 1400, "y": 80, "w": 450, "h": 450 }
        },
        "transform": { "cx": 540, "cy": 480, "w": 450, "h": 450, "rotation": 0.0, "z": 1 },
        "style": { "border_width": 4.0, "border_color": "#00FFCC", "corner_radius": 0.0 }
      }
    ]
  }
  ```

### 7.2. Rasterizer Mask & Shadow Berkecepatan Tinggi
- Menggunakan library Python Pillow dengan teknik antialiasing 4x supersampling (downscale Lanczos) untuk menghasilkan `mask.png`, `ring.png` (border stroke), dan `shadow.png`.
- Menghindari filter berat FFmpeg `geq` sehingga proses rendering tetap berjalan cepat.

### 7.3. Transformasi Matriks Afin & Kompensasi Poros Rotasi
- Frontend menghitung rotasi dan bounding box menggunakan matriks afin di `lib/scene/geometry.ts`.
- Kompilasi FFmpeg menggunakan rumus rotasi dinamis `ow = rotw(angle)`, `oh = roth(angle)` dengan offset translasi pusat `overlay=round(cx - ow/2):round(cy - oh/2)` untuk memastikan pusat rotasi tepat di titik tengah layer.

---

## 8. Quality Assurance & Normalisasi Audio

- **Audio Loudnorm EBU R128 (`render/loudnorm.py`)**:
  - Menjalankan 2-Pass Loudnorm FFmpeg dengan parameter target broadcast: Integrated Loudness `I=-16 LUFS`, Loudness Range `LRA=11 LU`, True Peak `TP=-1.5 dBFS`.
- **Strict Video QA Gate (`qa/inspector.py`)**:
  - Resolusi wajib tepat $1080 \times 1920$.
  - Pixel format wajib `yuv420p`.
  - Sinkronisasi Audio/Video: Toleransi drift $| \text{durasi}_{\text{video}} - \text{durasi}_{\text{audio}} | < 80\text{ ms}$.

---

## 9. Evaluasi & Golden Set Benchmark

Metodologi evaluasi formal tersedia di `eval/evaluate.py`:
- **Recall@K**: Proporsi highlight ground truth yang tertangkap dalam $K$ kandidat teratas:
  $$\text{Recall@K} = \frac{\sum_{i=1}^{M} \mathbb{I}(\text{hit in top } K)}{M}$$
  Kriteria hit: $\text{IoU} \ge 0.30$ terhadap segmen ground truth.
- **Mean IoU**: Rata-rata persentase irisan temporal terhadap ground truth yang terdeteksi.
- **Hasil Benchmark v2**:
  - `cLhVLsius9w` (Apex Legends): Recall@3 = 100%, Mean IoU = 1.000.
  - `RRJ2XZOkUOU` (Valorant): Presisi deteksi start boundary terverifikasi pada incomplete labels.

---

## 10. Gap Analysis & Rekomendasi Titik Ubah untuk ClipForge v3

Sebagai panduan perancangan ClipForge v3, berikut adalah batasan teknis v2 dan area yang direkomendasikan untuk dirombak:

| Komponen | Status ClipForge v2 | Rekomendasi Titik Ubah di ClipForge v3 |
| :--- | :--- | :--- |
| **Speaker Diarization** | Hanya mengandalkan Silero VAD (tidak membedakan siapa yang bicara). | Integrasikan PyAnnote Audio untuk multi-speaker tracking (Streamer vs Teman Discord vs Guest Podcast). |
| **Face Tracking Reframe** | Statis center crop atau manual freeform bounding box. | Implementasikan YOLOv8-Face / MediaPipe face tracking adaptif agar kamera otomatis mengikuti pergerakan wajah streamer. |
| **Subtitle Styling** | Berbasis file static ASS Libass. | Migrasi ke skema Motion Graphics berbasis WebGL / Remotion / Canvas DAG pipeline untuk animasi transisi teks yang lebih hidup. |
| **B2B / Multi-Genre Scout** | Bobot preset didominasi gaming (`gaming.yaml`, `podcast.yaml`). | Tambahkan preset B2B Webinar, Edukasi, dan Pitching Sales dengan kamus intent khusus. |
| **Render Orchestration** | Subprocess FFmpeg lokal satu per satu. | Bangun sistem antrean terdistribusi (Redis / Celery / BullMQ) dengan segmentasi render paralel. |
| **AI B-Roll Insertion** | Belum ada fitur B-Roll. | Penambahan auto-scout untuk kata kunci yang membutuhkan visualisasi B-Roll / gambar pelengkap secara otomatis. |

---

*Dokumen ini merupakan artefak resmi penutupan arsitektur ClipForge v2.*
