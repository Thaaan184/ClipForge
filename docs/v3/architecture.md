# ClipForge v3 System Architecture

## 1. Overview & High-Level Topology
ClipForge v3 introduces an **Editorial Composition Engine** on top of the established v2 AI Highlight Detection pipeline. While v2 extracts high-energy game segments and produces fast cutdowns, v3 transforms those raw clips into fully styled, kinetic short-form videos (9:16) with script alignment, dynamic punch zooms, animated captions, sound effects, and automated EBU R128 loudness normalization.

```
┌────────────────────────────────────────────────────────┐
│               ClipForge Web (React 19 / Vite)          │
│   - Editorial Studio Workspace                         │
│   - 9:16 Canvas Preview Player                         │
│   - Asset Tray (Audio/Video/Image)                     │
│   - Multi-Turn Natural Language Chat & Script Input    │
└───────────────────────────┬────────────────────────────┘
                            │ REST / SSE
┌───────────────────────────▼────────────────────────────┐
│             ClipForge API (FastAPI / Python 3.11)       │
│   - Session & Version Lifecycle (Git-backed workspaces)│
│   - Static Leak-Guard AST Scanner                      │
│   - Autopilot Editorial Agent & Chat Patcher           │
│   - Script Aligner & B-Roll Planner                    │
│   - EBU R128 Loudnorm & Extended QA Engine             │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP Internal (8765)
┌───────────────────────────▼────────────────────────────┐
│         Remotion Worker Sandbox (Node 20 / Chromium)   │
│   - Strict Whitelisted Environment (No Host Secrets)   │
│   - Typechecking via TypeScript Compiler CLI           │
│   - Fast Still Frame Generation (JPEG/PNG)             │
│   - Low-Res Preview Rendering                          │
│   - Full-Res 1080x1920 30fps Final Video Rendering     │
└────────────────────────────────────────────────────────┘
```

## 2. Core Architectural Principles
1. **Zero Regression Guarantee:**
   Modules under `clipforge/signals`, `clipforge/fusion`, and `clipforge/eval` remain 100% byte-for-byte identical to `legacy-v2-final`.
2. **Deterministic Sandboxed Execution:**
   The Remotion rendering worker operates in an isolated environment with a strict environment variable whitelist (`PATH`, `NODE_PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_ALL`, `NODE_ENV`, `PORT`, `HOST`, `TSC_PATH`, `PUPPETEER_EXECUTABLE_PATH`, `REMOTION_CHROMIUM_EXECUTABLE_PATH`). Host credentials (`CF_LLM_API_KEY`, etc.) are stripped on worker boot.
3. **Static Leak-Guard AST Security:**
   Before any TSX composition is saved, previewed, or rendered, it passes through static AST security scanning. The scanner strictly forbids `process.env`, `child_process`, `eval`, `Function()`, dynamic `import()`, `fetch()`, `XMLHttpRequest`, and high-entropy secret patterns.
4. **Git-Backed Non-Destructive Versioning:**
   Each editorial session operates in its own isolated workspace folder backed by a lightweight Git repository. Every agent pass, chat edit, or style application creates a new atomic commit, enabling instant point-in-time rollbacks.
5. **Two-Stage Audio Pipeline:**
   Music ducking and SFX mixing happen in Remotion with raw floating-point headroom, followed by a post-render two-pass FFmpeg EBU R128 loudness normalization targeting -16.0 ± 1.0 LUFS with True Peak ≤ -1.5 dBFS.

## 3. Data Flow & State Machine
The editorial lifecycle transitions deterministically across 7 stages:
```
[EDITORIAL_DRAFT]
       │ (Init Workspace & Manifest)
       ▼
[AGENT_WORKING] ◄───────────────┐
       │ (Synthesize Composition)│
       ▼                         │ (Iterative Chat Edit)
[PREVIEW_READY] ────────────────┘
       │ (Trigger Final Export)
       ▼
[RENDERING_FINAL] (Remotion Worker 1080x1920)
       │
       ▼
[AUDIO_NORMALIZING] (FFmpeg EBU R128 Two-Pass)
       │
       ▼
      [QA] (Extended QA: Black frames, Clipping, Safezone)
       │
       ▼
     [DONE]
```
If an unhandled exception or process termination occurs at any stage, the session transitions to `FAILED` with failure context `[FAILED_STAGE] <error>`. The idempotent `recover_session()` engine automatically resumes or rolls back to the nearest safe state.
