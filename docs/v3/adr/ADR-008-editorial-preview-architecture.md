# ADR-008: Arsitektur Pratinjau Editorial Studio

## Status
Diterima (D8)

## Konteks
Pada saat pengguna berinteraksi dengan AI di panel chat, sistem harus menyajikan hasil komposisi secara cepat agar pengguna dapat meninjau tata letak visual, teks hook, animasi zoom, dan sinkronisasi audio. Pemilihan metode pratinjau antara live-player browser vs server-rendered low-res video menentukan kompleksitas dan keandalan sistem.

## Keputusan
1. Mengadopsi arsitektur **Server-Rendered Low-Resolution Video (0.5x Scale MP4)** sebagai mekanisme pratinjau utama:
   - Worker merender video beresolusi 540×960 dengan preset cepat (`--scale=0.5 --crf=28`).
   - Waktu render pratinjau klip 10–30 detik dapat selesai dalam waktu di bawah 15 detik.
2. Menyediakan endpoint pengambilan still-frame (`/still?t={timestamp}`) untuk inspeksi frame instan tanpa merender video utuh.
3. Menolak opsi `@remotion/player` dinamis di browser klien karena risiko kegagalan kompilasi klien, CSP violation, dan ketidakmampuan membaca modul video off-thread.

## Konsekuensi
- **Positif**: Pemutaran video 100% stabil di semua peramban (termasuk mobile/Safari) menggunakan tag standar HTML5 `<video>`; tidak ada beban kompilasi di browser.
- **Negatif**: Setiap preview memerlukan jeda antre beberapa detik pada worker server.
