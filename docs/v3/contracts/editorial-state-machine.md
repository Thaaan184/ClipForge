# Kontrak Komponen: Editorial State Machine

## 1. Definisi & Siklus Hidup
State machine sesi editorial terisolasi dari siklus hidup job v2. State disimpan pada tabel `editorial_sessions`.

### State Diagram
```text
[POST /sessions]
       │
       ▼
EDITORIAL_DRAFT
       │
       ├─────────────────────────────────┐
       ▼ (Start Agent)                   ▼ (Manual Preview)
 AGENT_WORKING                     RENDERING_PREVIEW
       │                                 │
       ▼                                 ▼
 PREVIEW_READY ◄─────────────────────────┘
       │ ▲
       │ │ (Iterasi Edit / Komentar)
       │ └─────────── AGENT_WORKING
       ▼
 RENDERING_FINAL (Worker Render Video Mentah)
       │
       ▼
 AUDIO_NORMALIZING (FFmpeg EBU R128 loudnorm -c:v copy)
       │
       ▼
       QA (Strict 1080x1920, 30fps, Loudness Check)
       │
       ├────────────────────────┐
       ▼ (Lulus)                ▼ (Gagal QA)
      DONE                    FAILED
```

### Jalur Kegagalan (Failure Transition)
Setiap state kerja (`AGENT_WORKING`, `RENDERING_PREVIEW`, `RENDERING_FINAL`, `AUDIO_NORMALIZING`, `QA`) jika mengalami crash atau error akan bertransisi ke:
- **`FAILED`**
- Kolom yang dicatat:
  - `failed_stage`: string stage terakhir yang gagal.
  - `error_message`: detail pesan error atau traceback tersanitasi.
  - `retryable`: boolean (`true` jika kegagalan bersifat transien seperti timeout render/semaphore).

## 2. Definisi State

| State | Deskripsi | Aksi yang Diizinkan |
|---|---|---|
| `EDITORIAL_DRAFT` | Sesi baru dibuat, workspace diinisialisasi, manifest di-generate | Upload asset, ubah script/style pack, trigger agent/render |
| `AGENT_WORKING` | Agent AI sedang menjalankan tool loop dan menyusun komposisi | Polling SSE, batalkan (abort) |
| `RENDERING_PREVIEW` | Worker sedang me-render low-res MP4 preview | Tunggu hasil |
| `PREVIEW_READY` | Pratinjau siap diputar, snapshot versi dicatat | Tonton preview, beri komentar bertimestamp, trigger render final |
| `RENDERING_FINAL` | Worker sedang me-render video Remotion resolusi penuh 1080×1920 30fps | Polling progress |
| `AUDIO_NORMALIZING` | FFmpeg menerapkan EBU R128 two-pass loudnorm pada track audio hasil render Remotion (`-c:v copy`) | Pemrosesan background backend |
| `QA` | Otomasi QA memeriksa stream video, audio compliance, frame drop, dan sinkronisasi | Validasi final |
| `DONE` | Video final telah disinkronkan ke `finished_clips` dan siap diunduh | Download final video, buka sesi baru |
| `FAILED` | Terjadi kesalahan fatal pada salah satu tahap | Retry idempotent, lihat error log |

## 3. Idempotensi & Retry
- Permintaan retry pada state `FAILED` akan membersihkan berkas temporer yang rusak dan mengembalikan state ke state stabil sebelumnya (`EDITORIAL_DRAFT` atau `PREVIEW_READY`) tanpa membuat duplikasi session ID atau mengorbankan riwayat git commit workspace.
