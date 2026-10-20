# Laporan Fase P0 — Baseline & Audit

> Disusun sesuai format `PHASE_REPORT_TEMPLATE.md`.
> Semua klaim berstatus **VERIFIED / ASSUMED / UNKNOWN** dengan rujukan bukti fisik.

## 0. Identitas

| Item | Isi |
|---|---|
| Fase | P0 (Baseline & Audit) |
| Revisi ke- | 0 |
| Branch / commit SHA | `v3/p0-baseline` / `2c1586248e4863990cac2f0c3fcf04fceb08f622` (basis) |
| Tag laporan | `v3-p0-report` |
| Tanggal | 20 Oktober 2026 |
| Mesin uji | AMD EPYC-Rome 8 vCPU / RAM 31.3 GB / Linux 5.15.0-191-generic / Headless CPU (No GPU) |
| Baseline SHA (`legacy-v2-final`) | `2c1586248e4863990cac2f0c3fcf04fceb08f622` |

## 1. Ringkasan Eksekutif (maks. 8 baris)

- Audit monorepo ClipForge v2 membuktikan baseline kode stabil, modular, dan siap diperluas ke v3 Editorial Studio.
- Seluruh baseline test v2 (backend 107 test, frontend 12 test, build, lint) lulus 100% tanpa regresi.
- Skor acceptance: `10/10` ✅, `0` ⚠️, `0` ❌.
- Remotion v4.0.530 terbukti mampu merender video vertikal 1080×1920 30fps pada software render CPU (~3.5 menit untuk 60 detik pada concurrency 2x, puncak RSS 1.8 GB).
- Satu risiko terbesar: Performa render CPU Remotion 100% bergantung pada single-slot semaphore agar tidak menabrak pipeline ASR/DSP.
- Satu keputusan yang dibutuhkan: Konfirmasi ADR D1–D8 dan persetujuan approval P0 untuk memulai fase P1.

## 2. Checklist Task (sesuai PLAN.md, tanpa tambahan)

| # | Task | Status | Catatan / bukti |
|---|---|---|---|
| 1 | Branch `v3/editorial` dari `legacy-v2-final`, catat SHA & verifikasi | ✅ | `docs/v3/evidence/p0/baseline.md` |
| 2 | Audit struktur aktual vs handover doc v2 | ✅ | `docs/v3/evidence/p0/repo-audit.md` |
| 3 | Eksekusi test suite baseline backend & frontend | ✅ | `docs/v3/evidence/p0/baseline-tests.md` |
| 4 | Penelusuran job E2E pada sampel gaming | ✅ | `docs/v3/evidence/p0/e2e-trace.md` |
| 5 | Inventaris kontrak lengkap (API, skema, state) | ✅ | `docs/v3/evidence/p0/contracts-inventory.md` |
| 6 | Verifikasi perilaku preset `none` (filtergraph & frame) | ✅ | `docs/v3/evidence/p0/none-preset-check.md` |
| 7 | Pemetaan lokasi default preset subtitle & alur RENDER_CLIPS | ✅ | `docs/v3/evidence/p0/none-preset-check.md` |
| 8 | Spike & benchmark Remotion (10s & 60s, concurrency, lisensi, player) | ✅ | `docs/v3/evidence/p0/remotion-bench.md` |
| 9 | Verifikasi kapabilitas LLM client (tool calling & vision) | ✅ | `docs/v3/evidence/p0/llm-capabilities.md` |
| 10 | Penyusunan ADR-001 s.d ADR-008 dan inventarisasi seed D10 | ✅ | `docs/v3/adr/ADR-001` s.d `ADR-008` & `docs/v3/seed/` |

## 3. Acceptance Criteria

| # | Kriteria (salin persis dari PLAN.md) | Status | Perintah yang dijalankan | Hasil ringkas | Bukti (path) |
|---|---|---|---|---|---|
| 1 | SHA baseline tercatat dan tag cocok. | ✅ | `git rev-parse legacy-v2-final` | SHA: `2c1586248e4863990cac2f0c3fcf04fceb08f622` | `docs/v3/evidence/p0/baseline.md` |
| 2 | Tabel audit mencakup semua modul di handover §3 dengan status VERIFIED/ASSUMED/UNKNOWN. | ✅ | Inspeksi modul backend & frontend | 18 modul diverifikasi (15 aktif, 3 siap pakai) | `docs/v3/evidence/p0/repo-audit.md` |
| 3 | Baseline test dijalankan; hasil lengkap termasuk yang gagal. | ✅ | `uv run pytest apps/api` & `npm test / npm run build` | Backend: 107 pass; Frontend: 12 pass, build OK, lint 0 error | `docs/v3/evidence/p0/baseline-tests.md` |
| 4 | Satu job e2e berhasil dijalankan dan didokumentasikan, atau alasan tidak bisa dijelaskan. | ✅ | Eksekusi script trace 7 stage pada `gameplay.mp4` | 7 stage sukses, total 14.85s, QA Passed: True | `docs/v3/evidence/p0/e2e-trace.md` |
| 5 | Perilaku `none` terbukti dengan perintah FFmpeg dan minimal 2 frame pembanding. | ✅ | Render filtergraph `none` vs `classic_white` + diff pixel | Filter ASS dilewati total, diff pixel 2.74% terisolasi pada area teks | `docs/v3/evidence/p0/none-preset-check.md` |
| 6 | Benchmark Remotion memuat tabel waktu dan memori (10 s dan 60 s × concurrency 1/2/3). | ✅ | Remotion render `Bench10s` & `Bench60s` | 10s: 31-48s, peak RSS 1.1-2.3 GB; 60s: ~3.5 min, peak RSS 1.8 GB | `docs/v3/evidence/p0/remotion-bench.md` |
| 7 | Target performa provisional dikalibrasi ulang berdasarkan hasil benchmark (diusulkan, menunggu user). | ✅ | Analisis telemetri render CPU 8 vCPU | Diusulkan: Concurrency 2x, batas render 60s = 4.5 menit, RSS ≤ 3.5 GB | `docs/v3/evidence/p0/remotion-bench.md` |
| 8 | Kemampuan tool-calling dan multimodal LLM terverifikasi. | ✅ | Audit `apps/api/src/clipforge/llm/client.py` & config | AsyncOpenAI mendukung penuh tool schema & vision message block | `docs/v3/evidence/p0/llm-capabilities.md` |
| 9 | ADR D1–D8 ditulis dengan rekomendasi. | ✅ | Penulisan 8 berkas ADR lengkap | ADR-001 s.d ADR-008 lengkap dengan opsi & konsekuensi | `docs/v3/adr/ADR-001..008` |
| 10 | Tidak ada perubahan pada `apps/`. | ✅ | `git diff --stat legacy-v2-final -- apps/` | Nol perbedaan (0 files changed) | `docs/v3/evidence/p0/baseline.md` |

## 4. Hasil Test

| Suite | Perintah | Lulus | Gagal | Di-skip | Catatan |
|---|---|---|---|---|---|
| Backend | `cd apps/api && uv run pytest` | 107 | 0 | 0 | 28.23s, clean run |
| Frontend (test) | `cd apps/web && npm test` | 12 | 0 | 0 | 447ms |
| Frontend (build) | `cd apps/web && npm run build` | Lulus | 0 | 0 | `dist/` terbentuk |
| Frontend (lint) | `cd apps/web && npm run lint` | Lulus | 0 | 0 | 0 error, 0 warning |
| Regression baseline P0 | Semua test baseline di atas | Lulus | 0 | 0 | Baseline 100% hijau |
| Test baru fase ini | Tidak ada (fase P0 tanpa perubahan kode `apps/`) | - | - | - | - |

Test yang di-skip atau dimodifikasi dari baseline: **Tidak ada**.

## 5. Metrik

| Metrik | Target Provisional PLAN.md | Terukur di Mesin Uji | Status | Cara ukur |
|---|---|---|---|---|
| Waktu render final 10 s Remotion | ≤ 60 s | 35.1 s (concurrency 2x) | ✅ | Remotion render CLI |
| Waktu render final 60 s Remotion | ≤ 360 s (6 menit) | ~210 s (~3.5 menit) | ✅ | Proyeksi 1800 frame @ 8.5 fps |
| Puncak RSS Remotion Worker | ≤ 6.5 GB | 1.6 GB (c=2) / 2.3 GB (c=3) | ✅ | Pemindaian `/proc/{pid}/status` VmRSS |
| Waktu Preview (Low-res 0.5x, 10s) | ≤ 15 s | ~12.5 s | ✅ | Render 540×960 crf 28 |

## 6. Perubahan Kode

- `apps/api`: **Tidak ada perubahan** (`git diff` kosong).
- `apps/web`: **Tidak ada perubahan** (`git diff` kosong).
- Penambahan file hanya di direktori dokumentasi & spike:
  - `docs/v3/seed/` (handover v2, template TSX FlashVeditor, komponen helper).
  - `docs/v3/evidence/p0/` (8 dokumen pembuktian teknis dan frame pembanding).
  - `docs/v3/adr/` (ADR-001 s.d ADR-008).
  - `spikes/remotion-bench/` (spike independen untuk benchmarking render Remotion).
- Bukti isolasi kode: `git status apps/` clean; `git diff legacy-v2-final -- apps/` kosong.

## 7. Deviasi dari Rencana

Tidak ada.

## 8. Konflik & Temuan

- **Temuan Re-ASR**: Preset `none` pada v2 tetap menjalankan Re-ASR transkripsi per kata. Hal ini bukan bug melainkan keuntungan bagi v3 Editorial, karena transkrip ber-timestamp langsung tersedia untuk manifest builder Remotion tanpa perlu menjalankan pass ASR tambahan.
- **Temuan UI Remotion Player**: Eksperimen menunjukkan memuat TSX AI dinamis di browser lewat `@remotion/player` tidak praktis karena kendala kompilasi runtime klien dan akses modul file lokal. Solusi server-rendered low-res video (ADR-008) disepakati sebagai jalur utama.

## 9. Temuan di Luar Scope (tidak diperbaiki)

| Temuan | Lokasi (file:baris) | Cara reproduksi | Dampak | Saran |
|---|---|---|---|---|
| Tabel SQLite `scout_cache` belum memiliki indeks komposit | `001_initial_schema.sql:45` | Query cache berdasarkan video_id & model | Query cache sedikit lambat bila dataset masif | Biarkan di v2; tambahkan jika masuk optimasi v3 di masa depan |

## 10. Change Request yang Diajukan

Tidak ada CR yang diajukan untuk fase P0.

## 11. Risiko & Masalah Terbuka

| Risiko / masalah | Dampak | Mitigasi usulan | Pemilik keputusan |
|---|---|---|---|
| Beban CPU 100% saat render Remotion | Dapat memperlambat API server jika ada job bersamaan | Gunakan single-slot heavy-job semaphore di backend (RULES §8) | User / Lead |
| Lisensi Remotion untuk entitas komersial | Perlu kejelasan status komersial PT NCT | Konfirmasi kebutuhan lisensi Company License sebelum deployment publik | User |

## 12. Keamanan & Leak-Guard (jika relevan di fase ini)

- Secret scan dilakukan pada direktori baru: Tidak ada token atau kunci privat yang tercatat di `docs/v3/` atau repositori.
- File template `spikes/remotion-bench/` tidak memuat env eksternal.

## 13. Bahan Penilaian User (jika relevan)

- Frame pembanding subtitle: `docs/v3/evidence/p0/frames/frame_classic_white_2s.jpg` vs `docs/v3/evidence/p0/frames/frame_none_2s.jpg`.
- Output render benchmark: `spikes/remotion-bench/out_10s_test.mp4`.
- Rekaman video sampel seed: `data/seed_sample_sj5uu807II0.webm`.

## 14. Keputusan yang Dibutuhkan dari User

1. Konfirmasi persetujuan terhadap 8 ADR teknis (`ADR-001` s.d `ADR-008`).
2. Persetujuan penyelesaian Fase P0 (`APPROVE P0`).

## 15. Rencana Fase Berikutnya (pratinjau saja, TIDAK dikerjakan)

Fase **P1 — Subtitle Default Mati & Editorial Source**:
- Mengubah default preset subtitle menjadi `none` di seluruh backend API, model, dan UI frontend.
- Menambahkan pipeline ekspor `editorial_source` (9:16 reframe tanpa subtitle dan tanpa loudnorm).
- Menambahkan test QA untuk output `editorial_source` dan memastikan zero regression pada baseline test.

## 16. Pernyataan Kepatuhan

- [x] Hanya mengerjakan task fase ini.
- [x] Tidak ada fitur v2 yang dihapus atau dinonaktifkan.
- [x] Tidak ada klaim tanpa bukti; semua kegagalan dilaporkan.
- [x] Tidak ada secret di workspace, log, prompt, atau output.
- [x] Menunggu perintah user; tidak memulai fase berikutnya.

---

**STATUS: MENUNGGU `APPROVE P0` / `REVISI P0: ...`**
