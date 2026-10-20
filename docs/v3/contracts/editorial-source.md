# Kontrak Komponen: Editorial Source

## 1. Definisi & Tujuan
`editorial_source` adalah artefak video masukan standar untuk engine Remotion (Editorial Studio v3). Video ini telah dipotong sesuai rentang kandidat dan di-reframe ke format vertikal 9:16 (1080×1920), namun **tanpa subtitle** (preset `none`) dan **tanpa normalisasi audio loudnorm** (mempertahankan dynamic range asli untuk mixing musik/SFX di Remotion).

## 2. Spesifikasi Teknis Video & Audio

| Atribut | Nilai Wajib | Keterangan |
|---|---|---|
| Resolusi | 1080 × 1920 | Format vertikal 9:16 |
| Pixel Format | `yuv420p` | Kompatibilitas browser & Chromium headless |
| Frame Rate | 30.0 fps | Pinned frame rate (ADR-004) |
| Video Codec | H.264 (`libx264`) | CRF 18, preset veryfast, `-movflags +faststart` |
| Audio Codec | AAC (`aac`) | Stereo, sample rate 48000 Hz, bitrate 192 kbps |
| Audio Loudnorm | **NONAKTIF** | Loudnorm dilewati total (ADR-007) |
| Subtitle Burn-in | **NONAKTIF** | Filter ASS dilewati total (preset `none`) |
| Lokasi Berkas | `{clip_dir}/editorial_source.mp4` | Tersimpan di subfolder klip |

## 3. Metadata Kontrak (`editorial_source_meta_json`)

Format JSON yang disimpan pada tabel `clips` dan `finished_clips`:

```json
{
  "path": "/absolute/or/relative/path/to/editorial_source.mp4",
  "filename": "editorial_source.mp4",
  "width": 1080,
  "height": 1920,
  "fps": 30.0,
  "duration_s": 15.2,
  "pix_fmt": "yuv420p",
  "video_codec": "h264",
  "audio_codec": "aac",
  "audio_sample_rate": 48000,
  "size_bytes": 12450890,
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "created_at": "2026-10-20T06:00:00Z",
  "qa": {
    "passed": true,
    "checks": {
      "video_stream": true,
      "audio_stream": true,
      "dimensions_1080x1920": true,
      "pix_fmt_yuv420p": true,
      "duration_tolerance": true,
      "av_sync": true,
      "no_subtitles": true
    },
    "errors": []
  }
}
```

## 4. API Endpoints

### 4.1. Ekspor / Render Editorial Source
- **Route**: `POST /clips/{clip_id}/editorial-source`
- **Payload** (opsional):
  ```json
  {
    "reframe_mode": "blur"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "clip_id": "c_123",
    "status": "ready",
    "editorial_source_path": ".../editorial_source.mp4",
    "metadata": { ... }
  }
  ```

### 4.2. Stream Video Editorial Source
- **Route**: `GET /clips/{clip_id}/editorial-source`
- **Response**: `video/mp4` stream dengan dukungan `Accept-Ranges: bytes`.

### 4.3. Metadata Editorial Source
- **Route**: `GET /clips/{clip_id}/editorial-source/meta`
- **Response**: `200 OK` (JSON metadata).

## 5. Skema Database

Migration `0006_editorial_source.sql`:
```sql
ALTER TABLE clips ADD COLUMN editorial_source_path TEXT DEFAULT NULL;
ALTER TABLE clips ADD COLUMN editorial_source_meta_json TEXT DEFAULT NULL;

ALTER TABLE finished_clips ADD COLUMN editorial_source_path TEXT DEFAULT NULL;
ALTER TABLE finished_clips ADD COLUMN editorial_source_meta_json TEXT DEFAULT NULL;
```
