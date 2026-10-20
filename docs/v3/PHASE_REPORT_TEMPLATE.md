# Laporan Fase P{n} — {Nama Fase}

> Salin file ini ke `docs/v3/reports/P{n}-report.md` (revisi: `P{n}-report-r{k}.md`).
> Semua bagian wajib diisi. Tulis "Tidak ada" bila kosong, jangan dihapus.
> Setiap klaim diberi status **VERIFIED / ASSUMED / UNKNOWN** dan bukti (perintah atau path file).

## 0. Identitas

| Item | Isi |
|---|---|
| Fase | P{n} |
| Revisi ke- | 0 |
| Branch / commit SHA | |
| Tag laporan | `v3-p{n}-report` |
| Tanggal | |
| Mesin uji | CPU / RAM / OS / GPU |
| Baseline SHA (`legacy-v2-final`) | |

## 1. Ringkasan Eksekutif (maks. 8 baris)

- Hasil akhir fase dalam 2–3 kalimat.
- Skor acceptance: `{x}/{y}` ✅, `{a}` ⚠️, `{b}` ❌.
- Satu risiko terbesar saat ini.
- Satu keputusan yang dibutuhkan dari user.

## 2. Checklist Task (sesuai PLAN.md, tanpa tambahan)

| # | Task | Status | Catatan / bukti |
|---|---|---|---|
| 1 | | ✅ / ⚠️ / ❌ | |

## 3. Acceptance Criteria

| # | Kriteria (salin persis dari PLAN.md) | Status | Perintah yang dijalankan | Hasil ringkas | Bukti (path) |
|---|---|---|---|---|---|
| 1 | | ✅ / ⚠️ / ❌ | | | `docs/v3/evidence/p{n}/...` |

Legenda: ✅ terpenuhi dan terbukti · ⚠️ sebagian / tidak bisa diverifikasi penuh (jelaskan) · ❌ tidak terpenuhi.

## 4. Hasil Test

| Suite | Perintah | Lulus | Gagal | Di-skip | Catatan |
|---|---|---|---|---|---|
| Backend | | | | | |
| Frontend (typecheck/lint/build) | | | | | |
| Worker | | | | | |
| Regression baseline P0 | | | | | |
| Test baru fase ini | | | | | |

Test yang di-skip atau dimodifikasi dari baseline (wajib dijelaskan alasannya): …

## 5. Metrik

| Metrik | Target | Terukur | Status | Cara ukur |
|---|---|---|---|---|
| Waktu render final 60 s | | | | |
| Puncak RSS (backend + worker + Chromium) | | | | |
| Waktu preview | | | | |
| Lainnya sesuai fase | | | | |

## 6. Perubahan Kode

- Ringkasan `git diff --stat` per direktori (`apps/api`, `apps/web`, worker, `docs`, dll.).
- **Konfirmasi tidak menyentuh area terlarang** (deteksi, fusi, Scout, eval, `legacy/v2`): bukti `git diff --stat <baseline>..HEAD -- <path>`.
- Dependency baru + nomor ADR: …
- Perubahan kontrak (skema/API/state): …

## 7. Deviasi dari Rencana

| Item | Rencana | Yang terjadi | Alasan | Butuh persetujuan? |
|---|---|---|---|---|

Tulis "Tidak ada" jika tidak ada deviasi.

## 8. Konflik & Temuan

- Dokumen vs kode aktual yang bertentangan: …
- Asumsi yang berubah status (ASSUMED → VERIFIED / ditolak): …

## 9. Temuan di Luar Scope (tidak diperbaiki)

| Temuan | Lokasi (file:baris) | Cara reproduksi | Dampak | Saran |
|---|---|---|---|---|

## 10. Change Request yang Diajukan

| CR | Judul | Status |
|---|---|---|

## 11. Risiko & Masalah Terbuka

| Risiko / masalah | Dampak | Mitigasi usulan | Pemilik keputusan |
|---|---|---|---|

## 12. Keamanan & Leak-Guard (jika relevan di fase ini)

- Hasil secret scan: …
- Hasil static check TSX: …
- Dump env worker (tanpa nilai secret): …

## 13. Bahan Penilaian User (jika relevan)

Tautan/path hasil yang perlu dilihat: video preview, frame, screenshot UI.
Pertanyaan penilaian (skor 1–5 atau ya/tidak): …

## 14. Keputusan yang Dibutuhkan dari User

1. …
2. …

## 15. Rencana Fase Berikutnya (pratinjau saja, TIDAK dikerjakan)

Satu paragraf: apa yang akan dikerjakan di P{n+1} dan prasyaratnya.

## 16. Pernyataan Kepatuhan

- [ ] Hanya mengerjakan task fase ini.
- [ ] Tidak ada fitur v2 yang dihapus atau dinonaktifkan.
- [ ] Tidak ada klaim tanpa bukti; semua kegagalan dilaporkan.
- [ ] Tidak ada secret di workspace, log, prompt, atau output.
- [ ] Menunggu perintah user; tidak memulai fase berikutnya.

---

**STATUS: MENUNGGU `APPROVE P{n}` / `REVISI P{n}: ...`**
