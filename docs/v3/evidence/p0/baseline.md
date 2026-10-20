# Baseline Evidence — ClipForge v3 P0

## 1. Identitas Baseline Git

- **Repository**: `Thaaan184/ClipForge`
- **Tag `legacy-v2-final` object**: `2c1586248e4863990cac2f0c3fcf04fceb08f622`
- **Tag `legacy-v2-final` commit**: `b92f6ee3cddf4787c376cb41711637c1e86cb895` ("Merge branch 'feature/freeform-canvas' into main")
- **Branch `legacy/v2` commit**: `125f91e94d10112cd7d76e1fad7e6b1d77d1d412` ("docs: add comprehensive ClipForge v2 architecture & technical brief")
- **Status Perbedaan `legacy-v2-final` vs `legacy/v2`**: **VERIFIED**
  - Hanya 1 commit dokumentasi (`docs/CLIPFORGE_V2_BRIEF.md`).
  - `git diff --stat legacy-v2-final..legacy/v2 -- apps/` menghasilkan 0 perubahan (kode identik 100%).
- **Branch Utama v3**: `v3/editorial` dibuat dari commit `b92f6ee3cddf4787c376cb41711637c1e86cb895`.
- **Branch Fase P0**: `v3/p0-baseline` dibuat dari `v3/editorial`.

## 2. Spesifikasi Mesin Uji

- **OS**: Linux (Ubuntu 5.15.0-191-generic x86_64)
- **CPU**: 4 vCPU (QEMU Virtual CPU version 2.5+)
- **RAM**: 7.8 GiB (total available ~4.5 GiB)
- **Swap**: 4.0 GiB
- **GPU**: None (CPU-only execution)
- **Kesesuaian Target Lingkungan**: Persis memenuhi target host minimum RULES §8 (4 vCPU / 8 GB RAM).
