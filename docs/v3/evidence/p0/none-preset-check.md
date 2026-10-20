# Verifikasi Perilaku Preset `none` — ClipForge v3 P0

Eksperimen pembuktian perilaku preset `none` vs preset teks (`classic_white`) pada pipeline render FFmpeg baseline v2.

## 1. Analisis Filtergraph FFmpeg

Diverifikasi langsung melalui fungsi `build_reframe_filtergraph(mode='blur', ass_file=...)`:

### Dengan Preset `classic_white` (`ass_file='subs.ass'`):
```
[0:v]split=2[bg_src][fg_src];[bg_src]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30,eq=brightness=-0.08[bg];[fg_src]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p,ass=subs.ass:fontsdir=fonts[v]
```
- Terdapat filter `,ass=subs.ass:fontsdir=fonts` yang membakar subtitle ke dalam stream video.

### Dengan Preset `none` (`ass_file=None`):
```
[0:v]split=2[bg_src][fg_src];[bg_src]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30,eq=brightness=-0.08[bg];[fg_src]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]
```
- Filter `ass` ditiadakan seluruhnya. Stream video bersih dari teks subtitle.

## 2. Bukti Artefak Frame Pembanding

Klip 5 detik diekstrak dari rekaman gameplay dan dirender dengan kedua preset:
- Output `classic_white`: `docs/v3/evidence/p0/frames/clip_white/final.mp4`
- Output `none`: `docs/v3/evidence/p0/frames/clip_none/final.mp4`
- Frame snapshot pada `t=2.0s`:
  - `docs/v3/evidence/p0/frames/frame_classic_white_2s.jpg` (60,557 bytes)
  - `docs/v3/evidence/p0/frames/frame_none_2s.jpg` (55,655 bytes)

### Hasil Pengukuran Piksel Diferensial:
- **Total Piksel**: 2,073,600 (1080 × 1920)
- **Piksel Berbeda (>20 delta)**: 56,927 piksel
- **Rasio Selisih**: 2.7453% (terlokalisasi 100% pada area teks subtitle di bagian bawah frame).
- **Kesimpulan**: Preset `none` menghasilkan video 9:16 bersih tanpa teks terbakar (**VERIFIED**).

## 3. Efek Samping: Re-ASR Pipeline v2

Pada implementasi v2 (`apps/api/src/clipforge/jobs/pipeline.py:700`):
- Saat `RENDER_CLIPS` berjalan dengan `subtitle_style="none"`, `has_subtitles` bernilai `False` sehingga file ASS tidak di-passing ke FFmpeg.
- **Namun**, proses `transcribe_clip_media` (re-ASR) pada `raw_video` tetap dipanggil dan kata-kata transkrip tetap disimpan ke tabel `subtitle_words`.
- **Dampak untuk v3 Editorial**: Re-ASR yang tetap berjalan ini justru menguntungkan karena menyediakan transkrip kata presisi tinggi yang dibutuhkan oleh `manifest.json` Remotion di P2.
