# Bukti Acceptance Criteria Fase P1: Subtitle Default Mati & Editorial Source

## 1. Verifikasi Preset Subtitle (Default 'none' vs Explicit Preset)
- **Preset Default 'none'**: Filter graph FFmpeg tidak memuat `,ass=` atau filter subtitle apapun. Frame bersih tanpa watermark/teks.
- **Preset Eksplisit (`classic_white`, `hormozi_bold`)**: Teks subtitle dibakar tepat pada rentang kata dengan formatting style masing-masing.
- **Perbedaan Piksel Frame (t=2.5s)**: Perbedaan `none` vs `classic_white` terukur **0.702%**, terisolasi pada bounding box teks subtitle.
- **Bukti Frame Tersimpan**:
  - `docs/v3/evidence/p1/frame_compare_preset_none_t2.5s.png`
  - `docs/v3/evidence/p1/frame_compare_preset_classic_white_t2.5s.png`
  - `docs/v3/evidence/p1/frame_compare_preset_hormozi_bold_t2.5s.png`

## 2. Verifikasi 3 Klip Berbeda untuk Editorial Source (Acceptance Criterion 4)
Tiga klip gameplay berdurasi berbeda di-render dengan mode reframe yang berbeda (`blur`, `center`, `stacked`):

| Klip | Mode | Durasi | Resolusi | FPS | Pix Fmt | A/V Offset | Subtitle Stream | SHA-256 Checksum | QA Gate |
|---|---|---|---|---|---|---|---|---|---|
| `clip_01_early_game` | `blur` | 10.10s | 1080×1920 | 30/1 | `yuv420p` | 0.0 ms | 0 | `0dfce12ea7a68836...` | ✅ LULUS |
| `clip_02_mid_combat` | `center` | 12.10s | 1080×1920 | 30/1 | `yuv420p` | 0.0 ms | 0 | `b5ed3705d176ffa7...` | ✅ LULUS |
| `clip_03_late_clutch` | `stacked` | 10.10s | 1080×1920 | 30/1 | `yuv420p` | 0.0 ms | 0 | `c88f13f8d191a689...` | ✅ LULUS |

### Detail Checksum Lengkap:
- **clip_01_early_game**: `0dfce12ea7a68836ddd7009a7d3823b9aa986b82e96f4ffd260efffc420de087`
- **clip_02_mid_combat**: `b5ed3705d176ffa78db414951e7f7915e641db4292b7cc28ced400f692049331`
- **clip_03_late_clutch**: `c88f13f8d191a689475cf248279fcce801dd479d8dd8cd863225bcf902786cd2`

## 3. Kesimpulan Verifikasi
Semua kriteria acceptance teknis fase P1 telah teruji pada lingkungan nyata tanpa mock FFmpeg:
1. Video output 9:16 (1080×1920) H.264 `yuv420p` konstan 30 fps.
2. Clean cut tanpa subtitle burned-in.
3. Audio AAC 48kHz stereo, dynamic range asli tanpa distorsi loudnorm ganda (ADR-007).
4. QA gate otomatis memvalidasi durasi, stream, dan A/V sync offset < 80 ms.
