# Laporan Fase P1 — Subtitle Default Mati & Editorial Source

## 0. Identitas

| Item | Isi |
|---|---|
| Fase | P1 |
| Revisi ke- | 0 |
| Branch / commit SHA | `v3/p1-editorial-source` |
| Tag laporan | `v3-p1-report` |
| Tanggal | 2026-10-20 |
| Mesin uji | AMD EPYC-Rome (8 vCPU) / 31GB RAM / Ubuntu 22.04 LTS / Tanpa GPU |
| Baseline SHA (`legacy-v2-final`) | `2c1586248e4863990cac2f0c3fcf04fceb08f622` |

## 1. Ringkasan Eksekutif (maks. 8 baris)

- Fase P1 berhasil mengimplementasikan pipeline Editorial Source dan migrasi default subtitle ke `none` (clean cut).
- Pipeline backend memproduksi artefak video 1080×1920 (9:16) 30 fps konstan, H.264 `yuv420p`, AAC 48kHz stereo, tanpa subtitle burned-in, dan audio dynamic range asli tanpa double loudnorm (sesuai ADR-007) siap dikonsumsi Remotion di P2.
- Skor acceptance: 7/7 ✅, 0 ⚠️, 0 ❌.
- Satu risiko terbesar: Beban komputasi CPU rendering pada worker Remotion saat komposisi multi-layer diuji di P2 tanpa GPU hardware.
- Status persetujuan: User telah mengonfirmasi "Approved p1".

## 2. Checklist Task (sesuai PLAN.md, tanpa tambahan)

| # | Task | Status | Catatan / bukti |
|---|---|---|---|
| 1 | Ubah default preset subtitle menjadi `none` di semua titik default hasil audit P0 | ✅ | VERIFIED: `core/config.py`, `jobs/models.py`, `routes/jobs.py`, `jobs/pipeline.py`, `render/scene/` |
| 2 | Pada UI, pilihan `none` tampil terpilih secara default dengan label jelas | ✅ | VERIFIED: `JobForm.tsx`, `AddManualClipModal.tsx`, `App.tsx`, `SubtitleEditor.tsx`, `types.ts` |
| 3 | Pastikan saat `none`: tidak ada generasi/pembakaran ASS | ✅ | VERIFIED: FFmpeg filtergraph bypass `,ass=...`, 0 subtitle stream di media container |
| 4 | Tambahkan mode render `editorial_source`: potong rentang final, reframe 9:16, tanpa subtitle, audio tanpa loudnorm (D7), `yuv420p` | ✅ | VERIFIED: Modul `render/editorial_source.py`, rute `POST /clips/{id}/editorial-source` |
| 5 | Perluas QA untuk editorial_source: resolusi, pixel format, selisih durasi A/V < 80 ms, dan pemeriksaan "tanpa subtitle" | ✅ | VERIFIED: `run_editorial_source_qa()` memvalidasi 7 parameter ketat dan sha256 checksum |
| 6 | Tambahkan test untuk default, preset eksplisit, dan editorial_source | ✅ | VERIFIED: 5 unit test + 1 integration test baru lulus 100% |

## 3. Acceptance Criteria

| # | Kriteria (salin persis dari PLAN.md) | Status | Perintah yang dijalankan | Hasil ringkas | Bukti (path) |
|---|---|---|---|---|---|
| 1 | Job baru tanpa menentukan preset menghasilkan output tanpa subtitle | ✅ | `python scripts/verify_p1_acceptance_suite.py` | Filter ASS ditiadakan total, frame identik tanpa watermark/subtitle | `docs/v3/evidence/p1/frame_compare_preset_none_t2.5s.png` |
| 2 | Memilih preset lain secara eksplisit tetap menghasilkan subtitle | ✅ | `python scripts/verify_p1_acceptance_suite.py` | `classic_white` (diff 0.702%) dan `hormozi_bold` berhasil dibakar tepat sasaran | `docs/v3/evidence/p1/frame_compare_preset_classic_white_t2.5s.png` |
| 3 | Frontend menampilkan `none` sebagai default; typecheck, lint, build lulus | ✅ | `cd apps/web && npm test && npm run build && npm run lint` | 12 vitest passed, Vite build sukses 383kB bundle, ESLint 0 warnings | `apps/web/src/components/JobForm.tsx`, `apps/web/src/types.ts` |
| 4 | `editorial_source` untuk 3 klip berbeda lulus QA (1080×1920, yuv420p, A/V < 80 ms) dengan checksum tercatat | ✅ | `python scripts/verify_p1_acceptance_suite.py` | 3 klip berbeda (`blur`, `center`, `stacked`) lulus QA, A/V offset 0.0 ms, SHA256 tercatat | `docs/v3/evidence/p1/p1-acceptance-evidence.md` |
| 5 | Seluruh baseline test P0 tetap lulus (tidak ada regresi) | ✅ | `cd apps/api && uv run pytest` | 113 passed dalam 33.17s (107 baseline + 6 test baru) | Terminal test log |
| 6 | Tidak ada perubahan pada modul deteksi/fusi/Scout/eval | ✅ | `git diff --stat 2c1586248..HEAD -- apps/api/src/clipforge/signals apps/api/src/clipforge/fusion apps/api/src/clipforge/evaluation` | 0 baris berubah (output kosong bersih) | Git diff verification |
| 7 | Kontrak editorial_source terdokumentasi | ✅ | Inspeksi berkas | Kontrak lengkap memuat spesifikasi video, audio, metadata JSON, dan REST endpoint | `docs/v3/contracts/editorial-source.md` |

## 4. Hasil Test

| Suite | Perintah | Lulus | Gagal | Di-skip | Catatan |
|---|---|---|---|---|---|
| Backend | `cd apps/api && uv run pytest` | 113 | 0 | 0 | 100% lulus |
| Frontend (typecheck/lint/build) | `cd apps/web && npm test && npm run build && npm run lint` | 12 | 0 | 0 | 100% lulus, 0 warning |
| Worker | Belum aktif di P1 | — | — | — | Dikerjakan di P2 |
| Regression baseline P0 | `uv run pytest tests/` | 107 | 0 | 0 | Tidak ada regresi |
| Test baru fase ini | `pytest tests/unit/test_editorial_source_contract.py tests/integration/test_editorial_source_pipeline.py` | 6 | 0 | 0 | 5 unit + 1 integration test baru |

Test yang di-skip atau dimodifikasi dari baseline: Tidak ada.

## 5. Metrik

| Metrik | Target | Terukur | Status | Cara ukur |
|---|---|---|---|---|
| Waktu render editorial source 10 s | < 20 s | 12.19 s | ✅ | `scripts/verify_p1_editorial_e2e.py` |
| Resolusi editorial source | 1080×1920 | 1080×1920 | ✅ | ffprobe JSON stream parsing |
| Framerate konstan | 30.0 fps | 30/1 (30.0 fps) | ✅ | ffprobe `r_frame_rate` |
| A/V Sync offset | < 80 ms | 0.0 ms | ✅ | ffprobe start_time delta |
| Audio Channels & Sample Rate | Stereo 48kHz | 2ch / 48000 Hz | ✅ | ffprobe audio stream specs |
| Puncak RSS selama render FFmpeg | < 1 GB | ~180 MB | ✅ | Resource monitoring during subprocess run |

## 6. Perubahan Kode

- `apps/api`:
  - `src/clipforge/render/editorial_source.py`: Generator video clean cut 9:16 30fps dan QA validator.
  - `src/clipforge/db/migrations/0006_editorial_source.sql`: Kolom `editorial_source_path` dan `editorial_source_meta_json` di tabel `clips` dan `finished_clips`.
  - `src/clipforge/core/config.py`: Penambahan opsi konfigurasi `default_subtitle_preset = "none"`.
  - `src/clipforge/jobs/models.py`: Fallback `subtitle_style` ke `"none"`.
  - `src/clipforge/jobs/pipeline.py`: Eksekusi pembuatan `editorial_source` di stage `RENDER_CLIPS`.
  - `src/clipforge/api/routes/clips.py`: Endpoint `POST /{id}/editorial-source`, `GET /{id}/editorial-source`, `GET /{id}/editorial-source/meta`, serta sinkronisasi ke `finished_clips`.
  - `src/clipforge/api/routes/jobs.py`: Fallback default preset `none`.
  - `src/clipforge/render/scene/legacy.py` & `schema.py`: Default subtitle disabled & preset `"none"`.
  - `tests/unit/test_editorial_source_contract.py`: 5 unit tests validasi kontrak dan QA.
  - `tests/integration/test_editorial_source_pipeline.py`: Integration test siklus hidup editorial source di DB dan REST API.
- `apps/web`:
  - `src/types.ts`: Menempatkan opsi "none" di posisi teratas dengan label "Tanpa Subtitle (Default)".
  - `src/components/JobForm.tsx`: Default state `subtitleStyle = "none"`.
  - `src/components/AddManualClipModal.tsx`: Default state `subtitleStyle = "none"`.
  - `src/components/SubtitleEditor.tsx`: Fallback preset "none".
  - `src/App.tsx`: Default state `renderSubtitleStyle = "none"`.
  - `src/api.ts`: Helper `getEditorialSourceUrl()`, `getEditorialSourceMeta()`, `requestEditorialSource()`.
- `docs/v3`:
  - `contracts/editorial-source.md`: Kontrak teknis artefak editorial source.
  - `evidence/p1/editorial-source-e2e.md`: Laporan bukti eksekusi E2E pipeline.
  - `evidence/p1/p1-acceptance-evidence.md`: Laporan bukti perbandingan 3 klip dan preset subtitle.
  - `evidence/p1/*.png`: Bukti tangkapan frame.
- **Konfirmasi tidak menyentuh area terlarang**: `git diff --stat 2c1586248e4863990cac2f0c3fcf04fceb08f622..HEAD -- apps/api/src/clipforge/signals apps/api/src/clipforge/fusion apps/api/src/clipforge/evaluation` menghasilkan 0 baris modifikasi.

## 7. Deviasi dari Rencana

| Item | Rencana | Yang terjadi | Alasan | Butuh persetujuan? |
|---|---|---|---|---|
| Tidak ada | Sesuai PLAN.md | Sesuai PLAN.md | Implementasi berjalan tepat sesuai spesifikasi | Tidak |

## 8. Konflik & Temuan

- **Temuan Re-ASR**: Kode ASR v2 pada stage `TARGETED_ASR` tetap dijalankan untuk mengekstrak word-level timing dan transkripsi ke database SQLite (`subtitle_words`). Ini adalah keputusan yang benar karena data transkripsi tersebut dibutuhkan oleh manifest builder worker Remotion di Fase P2+. Preset `none` hanya menonaktifkan pembuatan file `.ass` dan filter FFmpeg subtitle burn-in.

## 9. Temuan di Luar Scope (tidak diperbaiki)

Tidak ada.

## 10. Change Request yang Diajukan

Tidak ada (seluruh task sesuai PLAN.md P1).

## 11. Risiko & Masalah Terbuka

| Risiko / masalah | Dampak | Mitigasi usulan | Pemilik keputusan |
|---|---|---|---|
| Render time Remotion CPU di P2 | Komposisi Remotion kompleks membutuhkan waktu render lebih lama di CPU 8-core tanpa GPU | Concurrency 2x dipatok sesuai temuan benchmark P0, rendering preview low-res diutamakan | Tim Dev |

## 12. Keamanan & Leak-Guard

- Secret scan: Tidak ada API key atau kredensial yang tersimpan di dalam kode, git diff, atau artefak evidence.
- Path traversal check: Route `GET /{id}/editorial-source` menggunakan path terverifikasi dari database SQLite dan validasi UUID clip_id.

## 13. Bahan Penilaian User

- Artefak Bukti Frame:
  - `docs/v3/evidence/p1/frame_compare_preset_none_t2.5s.png` (Frame bersih tanpa subtitle)
  - `docs/v3/evidence/p1/frame_compare_preset_classic_white_t2.5s.png` (Frame dengan subtitle Classic White)
  - `docs/v3/evidence/p1/frame_compare_preset_hormozi_bold_t2.5s.png` (Frame dengan subtitle Hormozi Bold)
  - `docs/v3/evidence/p1/editorial_source_frame_t2s.png` (Frame hasil E2E pipeline 9:16)
- Dokumen Kontrak Teknis: `docs/v3/contracts/editorial-source.md`

## 14. Keputusan yang Dibutuhkan dari User

User telah memberikan persetujuan via pesan `Approved p1`. Persetujuan ini memvalidasi:
1. Merge branch `v3/p1-editorial-source` ke `v3/editorial`.
2. Pembuatan tag `v3-p1-approved`.
3. Kesiapan membuka fase berikutnya: **P2 — Editorial Engine (tanpa UI, tanpa AI)**.

## 15. Rencana Fase Berikutnya (pratinjau saja, TIDAK dikerjakan)

Pada fase P2, akan diimplementasikan Editorial Engine standalone: worker Node.js (`apps/editorial-worker` atau struktur monorepo yang sesuai) yang mengekspos endpoint `/typecheck`, `/still`, `/preview`, dan `/render`; sistem workspace per klip dengan isolasi git lokal; manifest builder yang mengonversi transkripsi ASR dan sinyal klip v2 ke `manifest.json`; kit komponen Remotion dasar (`safezone.ts`, `KineticCaptions`, `PunchZoom`, `SourceVideo`); serta pipeline final audio loudnorm EBU R128 (-16 LUFS, TP -1.5 dBFS) pasca render Remotion.

## 16. Pernyataan Kepatuhan

- [x] Hanya mengerjakan task fase ini (P1).
- [x] Tidak ada fitur v2 yang dihapus atau dinonaktifkan.
- [x] Tidak ada klaim tanpa bukti; semua kegagalan dilaporkan.
- [x] Tidak ada secret di workspace, log, prompt, atau output.
- [x] Menunggu perintah user sebelum memulai pengerjaan kode P2.

---

**STATUS: P1 SELESAI & TELAH DISETUJUI USER (`Approved p1`)**
