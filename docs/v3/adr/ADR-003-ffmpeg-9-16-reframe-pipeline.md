# ADR-003: Pipeline Reframe 9:16 di FFmpeg

## Status
Diterima (D3)

## Konteks
Video masukan VOD umumnya horizontal (16:9, 1920×1080). Remotion composition vertikal memerlukan feed video 1080×1920 (9:16). Dua opsi pemrosesan reframe:
1. Reframe dinamis di Remotion (menggunakan CSS scale/blur canvas per frame).
2. Reframe di FFmpeg saat ekspor `editorial_source`.

## Keputusan
Melakukan reframe 9:16 secara deterministik di FFmpeg saat pembuatan `editorial_source`:
1. FFmpeg menerapkan filter blur background + fit foreground (`[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`).
2. Remotion menerima file `clip_source.mp4` yang sudah berdimensi 1080×1920.

## Konsekuensi
- **Positif**: Beban rendering Remotion turun drastis karena Chromium tidak perlu merender efek blur berat berbasis web-canvas di setiap frame; Remotion cukup meletakkan `<OffthreadVideo>` ukuran 100% fill.
- **Negatif**: Mengubah mode reframe setelah sesi editorial dibuka memerlukan render ulang `editorial_source`.
