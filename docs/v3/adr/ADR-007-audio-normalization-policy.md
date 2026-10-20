# ADR-007: Kebijakan Normalisasi Audio Editorial

## Status
Diterima (D7)

## Konteks
Pipeline v2 menerapkan EBU R128 two-pass loudnorm pada setiap potongan klip. Pada v3 Editorial Studio, pengguna dapat menambahkan background music (BGM) dan sound effect (SFX) yang di-ducking terhadap vokal ucapan. Jika audio sumber sudah dinormalisasi di awal, proses mixing musik di Remotion berpotensi mendistorsi dynamic range atau memicu clipping audio.

## Keputusan
1. File audio pada `editorial_source` diekspor **tanpa loudnorm** (hanya level asli yang dipotong).
2. Ducking audio musik dilakukan di Remotion Composition berdasarkan kurva probabilitas VAD yang tercatat di `manifest.json`.
3. Normalisasi EBU R128 (target −16 LUFS, LRA 11 LU, True Peak −1.5 dBFS) dilakukan **satu kali saja di akhir** pipeline setelah render Remotion selesai, dengan opsi video stream di-copy (`-c:v copy`) demi efisiensi.

## Konsekuensi
- **Positif**: Mencegah degradasi kualitas akibat double-loudnorm; menjamin video hasil akhir memenuhi standar siaran digital tanpa re-encoding video.
- **Negatif**: Membutuhkan satu sub-langkah FFmpeg terpisah setelah worker Remotion menghasilkan video mentah.
