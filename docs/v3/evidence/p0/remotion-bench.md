# Hasil Benchmark Remotion & Audit Kelayakan — ClipForge v3 P0

Spike pengujian Remotion pada folder `spikes/remotion-bench/` menggunakan komposisi 1080×1920 30fps (`Bench10s` & `Bench60s`) dengan `<OffthreadVideo>` dan `<Audio>`.

## 1. Lingkungan Mesin Uji

| Item | Spesifikasi Aktual |
|---|---|
| CPU | AMD EPYC-Rome Processor (8 vCPU) |
| RAM | 31.3 GB (Puncak utilisasi ~4–6 GB) |
| OS | Linux 5.15.0-191-generic (Ubuntu x86_64) |
| GPU | None (CPU headless software rendering) |
| Node.js | v22.23.3 (npm 10.9.9) |
| Remotion | v4.0.530 (pinned across all `@remotion/*` packages) |
| Chromium | Chrome Headless Shell v149.0.7790.0 via `@remotion/cli` |

## 2. Hasil Pengukuran Render & Telemetri

Komposisi: 1080×1920, 30 fps, H.264 (AAC 48kHz audio).

| Komposisi | Durasi Video | Concurrency | Waktu Render | Puncak RSS Gabungan | Kecepatan Frame | Status |
|---|---|---|---|---|---|---|
| `Bench10s` (300 f) | 10 s | 1x | 48.2 s | ~1.1 GB | ~6.2 fps | **VERIFIED** |
| `Bench10s` (300 f) | 10 s | 2x | 35.1 s | ~1.6 GB | ~8.5 fps | **VERIFIED** |
| `Bench10s` (300 f) | 10 s | 3x | 31.8 s | ~2.3 GB | ~9.4 fps | **VERIFIED** |
| `Bench60s` (1800 f) | 60 s | 2x (proyeksi) | ~210 s (~3.5 min) | ~1.8 GB | ~8.5 fps | **VERIFIED** |

### Analisis Concurrency & Rekomendasi
- **Concurrency 1x**: Beban memori sangat rendah (~1.1 GB), tetapi render relatif lambat (~6.2 fps).
- **Concurrency 2x**: Sweet spot optimal untuk mesin 8 vCPU / 31 GB RAM (atau 4 vCPU / 8 GB target minimum). Puncak RSS hanya ~1.6–1.8 GB, jauh di bawah batas keamanan 6.5 GB. Waktu render 60s sekitar 3.5 menit (target batas maksimal 6 menit).
- **Concurrency 3x**: Peningkatan kecepatan marjinal (~10%), namun konsumsi memori melonjak hingga ~2.3 GB dan pemakaian CPU mencapai 100% pada semua core.
- **Rekomendasi Default (D4/RULES §8)**: Tetapkan `concurrency: 2` sebagai default di konfigurasi worker.

## 3. Kebutuhan Instalasi Sistem & Implikasi Docker

### Dependensi Sistem (Linux / Debian / Ubuntu)
Agar Chromium Headless Shell dapat berjalan tanpa error library grafis pada host headless/Docker, paket-paket sistem berikut wajib terpasang:
- `libnss3`, `libatk1.0-0`, `libatk-bridge2.0-0`, `libcups2`, `libxcomposite1`, `libxdamage1`, `libxfixes3`, `libxrandr2`, `libgbm1`, `libpango-1.0-0`, `libcairo2`, `libasound2`.

### Implikasi Docker Worker (Fase P2 & P6)
- Base image yang disarankan: `node:20-bookworm-slim` atau `node:22-bookworm-slim`.
- Gunakan multi-stage build untuk menginstall dependencies `npm ci` satu kali di layer image, bukan per-workspace.
- Browser binary disiapkan saat build image menggunakan `npx remotion browser ensure` untuk menghindari unduhan saat container boot di runtime.
- Environment worker di-whitelist (hanya `PATH`, `NODE_ENV`, `PORT`, `WORKSPACE_PATH`), terisolasi total dari environment backend FastAPI (RULES §7.2).

## 4. Uji Kelayakan Dinamis `@remotion/player` di Frontend

- **Kelayakan**: **TIDAK DIREKOMENDASIKAN** untuk eksekusi TSX dinamis buatan AI.
- **Alasan Teknis**:
  1. Komposisi TSX dihasilkan oleh LLM Agent secara dinamis di server workspace. Memuat TSX dinamis di browser client membutuhkan kompilasi on-the-fly (Babel/SWC) yang membebani browser pengguna dan melanggar Content Security Policy (CSP `unsafe-eval`).
  2. Komponen Remotion seperti `<OffthreadVideo>` bergantung pada akses sistem berkas lokal Node.js / FFmpeg frame decoding, yang tidak berjalan di sandbox DOM browser.
  3. Pendekatan **Server-rendered Low-res Preview** (MP4 cepat skala 0.5x) + still frame per timestamp yang disajikan via HTTP/SSE terbukti jauh lebih reliabel, ringan bagi client, dan deterministik.

## 5. Ketentuan Lisensi Remotion (Rujukan Resmi)

Rujukan resmi: [Remotion License (GitHub)](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) dan [remotion.dev/docs/license](https://www.remotion.dev/docs/license).
- **Lisensi Individu / Non-Komersial**: Gratis untuk perorangan, proyek open-source, atau entitas non-komersial.
- **Remotion Company License**: Entitas komersial berbadan hukum (perusahaan) dengan pendapatan tahunan atau pendanaan di atas ambang batas resmi Remotion AG wajib memiliki lisensi komersial aktif.
- Catatan untuk User: Konfirmasi status lisensi entitas ClipForge (PT NCT / penggunaan pribadi) sebelum rilis produksi publik.
