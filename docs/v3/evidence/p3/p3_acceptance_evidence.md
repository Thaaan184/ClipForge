# Bukti Verifikasi Acceptance P3 — Editorial Studio UI

Tanggal: 2026-10-20T09:26:24.092195+00:00
Sesi Uji: `ed_acb151da43c2`

## 1. Upload Aset (3 Jenis Berkas)
- **Gambar**: ID `ast_0d845390`, path `public/assets/asset_ast_0d845390.png`, label `Logo Kemenangan`
- **Audio**: ID `ast_984a5dc2`, path `public/assets/asset_ast_984a5dc2.mp3`, durasi `3.03s`
- **Video B-Roll**: ID `ast_fc7ccc64`, path `public/assets/asset_ast_fc7ccc64.mp4`, durasi `2.00s`
- **Validasi Tipe**: Berkas `.exe` ditolak dengan pesan: `Format berkas '.exe' tidak didukung.`
- **Validasi Ukuran**: Berkas 51MB ditolak dengan pesan: `Ukuran berkas melebihi batas maksimum 50 MB.`

## 2. Sanitasi Nama Berkas Berbahaya (RULES §7.7)
- Nama input: `../../../../../etc/passwd; $(rm -rf /).png`
- Path tersanitasi: `public/assets/asset_ast_67c76220.png` (tanpa `..`, bebas injeksi shell, format `asset_{id}.png`).

## 3. Video Pratinjau (Preview)
- Resolusi: 540×960 (skala 0.5 untuk iterasi cepat)
- FPS: 30 fps
- Path: `/home/ids/projects/clipforge/apps/api/data/workspaces/ed_acb151da43c2/preview.mp4`

## 4. Riwayat Versi & Restore
- Versi dibuat: v1 (init), v2 (punch zoom modification)
- Aksi Restore v1: Berhasil me-restore commit sha `a281b67`, preview di-render ulang, status `current_version` = 1.

## 5. Integrasi Chat & Timestamp
- Input pesan: `Tolong perbesar subtitle di [00:02.5] dan pasang @Logo Kemenangan`
- Respon Agent (P3 Stub Echo): `Pesan diterima: "Tolong perbesar subtitle di [00:02.5] dan pasang @Logo Kemenangan". (Mode Editorial Studio P3 aktif dengan komposisi manual. AI Autopilot tool-loop akan aktif di P4).`

## 6. Render Final & Normalisasi Loudness
- Resolusi: 1080×1920 vertikal (9:16)
- Pixel format: `yuv420p`
- Audio: Stereo 48kHz, normalisasi EBU R128 (-16 LUFS, True Peak ≤ -1.5 dBFS)
- Status Sesi: `DONE` (sinkron via `GET /api/editorial/sessions/ed_acb151da43c2/status`)

## 7. Bukti Frame
- Frame 15: `docs/v3/evidence/p3/editorial_preview_frame_15.png`
