# ADR-004: Standardisasi Frame Rate Komposisi 30 FPS

## Status
Diterima (D4)

## Konteks
Video gameplay sering direkam pada 60 FPS, sedangkan platform short-form (Reels/TikTok/Shorts) umum menggunakan 30 FPS atau 60 FPS. Merender 60 FPS pada Remotion software rendering berbasis CPU memerlukan 2x lipat frame decoding (3600 frame untuk 60s), yang berpotensi melipatgandakan waktu render melebihi batas 6 menit.

## Keputusan
1. Menetapkan 30 FPS sebagai standar default komposisi Remotion di ClipForge v3.
2. File `clip_source.mp4` dikonversi ke 30 FPS saat pembuatan `editorial_source`.
3. Seluruh kalkulasi durasi frame di manifest dan Remotion menggunakan basis `30 fps` (`durationInFrames = Math.round(duration_s * 30)`).

## Konsekuensi
- **Positif**: Waktu rendering terkendali (~3.5 menit untuk 60s pada concurrency 2x), konsumsi memori stabil di bawah 2 GB.
- **Negatif**: Animasi sangat cepat (misal fast camera shake 60fps) dikonversi ke 30fps.
