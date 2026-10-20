# ClipForge v3 Known Issues & Limitations

This document tracks known architectural, operational, and performance limitations discovered during v3 development and hardening. Issues are prioritized by severity:
- **P1:** Critical / High impact on production reliability.
- **P2:** Moderate impact / Edge-case degradations.
- **P3:** Minor UX or non-critical enhancement.

---

### Priority P1 Issues

1. **Remotion High Concurrency Memory Consumption under Low-RAM Hosts**
   - **Severity:** P1
   - **Description:** Running `renderMedia` with concurrency > 4 on machines with less than 4 GB of free RAM can trigger Linux Out-Of-Memory (OOM) killer on Chromium headless child processes.
   - **Mitigation:** Default concurrency is clamped to 4 (preview) and 3-4 (final). On constrained VPS instances (≤ 4GB RAM), set `CF_EDITORIAL_FINAL_CONCURRENCY=2`.
   - **Tracking:** Planned dynamic RAM headroom detection in v3.1.

2. **Large Asset Upload Latency Without Chunked Streaming**
   - **Severity:** P1
   - **Description:** Video B-roll assets exceeding 500 MB uploaded through `/editorial/sessions/{id}/assets` are buffered in memory before writing to disk, causing transient spikes in API worker RSS.
   - **Mitigation:** Recommend B-roll clips under 100 MB or pre-trimmed segments.
   - **Tracking:** S3 / direct disk streaming multipart upload scheduled for v3.1.

---

### Priority P2 Issues

3. **Loose Mode Script Alignment on Highly Disordered Speeches**
   - **Severity:** P2
   - **Description:** When spoken dialogue jumps erratically between script paragraphs (e.g. non-linear streamer tangents), `align_script_to_transcript` falls back to temporal windowing rather than semantic semantic re-ordering.
   - **Mitigation:** User can review the alignment beat sheet in Studio UI or use Strict ('Ikuti Persis') mode.

4. **Multi-Track Audio Phasing on Overlapping SFX**
   - **Severity:** P2
   - **Description:** When multiple heavy bass SFX (e.g., bass drop + kill sound) trigger within < 100ms, raw summing can occasionally cause minor phase cancellation before EBU R128 limiting.
   - **Mitigation:** Agent AST patcher spaces dramatic SFX by at least 300ms.

---

### Priority P3 Issues

5. **Font Glyph Fallback for Non-Latin Character Sets**
   - **Severity:** P3
   - **Description:** Kinetic captions default to Google OFL fonts (Montserrat / Impact). CJK glyphs fall back to system font if Noto Sans CJK is not pre-installed on the host.
   - **Mitigation:** Packaged in Docker via `fonts-noto-cjk`.
