# End-to-End Job Trace pada Sampel Gaming — ClipForge v3 P0

Hasil penelusuran nyata pipeline v2 end-to-end pada klip rekaman gaming (`gameplay.mp4`).

## 1. Diagram Urutan Eksekusi Pipeline

```
[User Input VOD URL/File]
           │
           ▼
[Stage 1: VALIDATE] ── (0.00s) ── Probe metadata & validasi format
           │
           ▼
[Stage 2: FETCH_SIGNALS] ── (0.12s) ── Ekstraksi stream audio 16kHz PCM
           │
           ▼
[Stage 3: ANALYZE_SIGNALS] ── (0.61s) ── DSP Audio RMS, spectral flux, Silero VAD
           │
           ▼
[Stage 4: FUSE_CANDIDATES] ── (0.001s) ── Robust Z-Score, peak picking, NMS (2 kandidat)
           │
           ▼
[Stage 5: TARGETED_ASR] ── (0.85s) ── Faster-Whisper slice audio & word timestamps
           │
           ▼
[Stage 6: SCOUT_RERANK] ── (0.35s) ── LLM Scout rerank & hook generation
           │
           ▼
[Stage 7: RENDER_CLIPS] ── (12.93s) ── FFmpeg 9:16 reframe (blur mode) & EBU R128 loudnorm
           │
           ▼
[QA Inspector Engine] ── Passed: True (1080x1920, yuv420p, A/V sync OK)
```

## 2. Tabel Telemetri Waktu per Stage

| Stage | Durasi Terukur | Input Utama | Output Utama | Status |
|---|---|---|---|---|
| Stage 1: VALIDATE | 0.001 s | `gameplay.mp4` | Validasi path & metadata video | **VERIFIED** |
| Stage 2: FETCH_SIGNALS | 0.119 s | Video input | `audio_16k.wav` (16kHz mono) | **VERIFIED** |
| Stage 3: ANALYZE_SIGNALS | 0.611 s | `audio_16k.wav` | `loud_db`, `onset_density`, `speech_segments` | **VERIFIED** |
| Stage 4: FUSE_CANDIDATES | 0.001 s | Sinyal DSP ternormalisasi | 2 kandidat momen (10.0s – 40.0s) | **VERIFIED** |
| Stage 5: TARGETED_ASR | 0.850 s | Slice audio kandidat | Transkrip kata ber-timestamp | **VERIFIED** |
| Stage 6: SCOUT_RERANK | 0.350 s | Transkrip + bukti sinyal | Skor rerank, title, hook text | **VERIFIED** |
| Stage 7: RENDER_CLIPS | 12.925 s | Klip 10s raw.mp4 | `final.mp4` (8.02 MB) | **VERIFIED** |

**Total Waktu Proses**: ~14.85 detik untuk klip 10 detik.

## 3. Hasil Verifikasi QA Output Video

Output artefak: `docs/v3/evidence/p0/e2e_trace_output/clip_0/final.mp4`
Hasil pengecekan `run_clip_qa`:
- `passed`: `true`
- `errors`: `[]`
- `dimensions_1080x1920`: `true`
- `pix_fmt_yuv420p`: `true`
- `duration_tolerance`: `true` (target 10.0s, actual 10.1s, diff < 0.2s)
- `av_sync`: `true` (selisih stream video/audio < 80ms)
- `filesize`: 8,025,088 bytes (8.02 MB)
- `bitrate`: 6,356,505 bps
