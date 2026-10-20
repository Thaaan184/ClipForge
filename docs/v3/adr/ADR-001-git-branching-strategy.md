# ADR-001: Strategi Percabangan Git untuk ClipForge v3

## Status
Diterima (D1)

## Konteks
ClipForge v2 telah selesai dan stabil pada tag `legacy-v2-final` (commit `2c1586248e4863990cac2f0c3fcf04fceb08f622`). Versi v3 "Editorial Studio" menambahkan layer interaktif di atas v2 tanpa boleh merusak atau mengubah pipeline deteksi, fusi, dan baseline evaluasi v2. Perlu strategi git yang mengisolasi pengembangan v3 dan melindungi integritas riwayat v2.

## Keputusan
1. Membuat branch utama v3 bernama `v3/editorial` langsung dari commit tag `legacy-v2-final`.
2. Setiap fase P{n} dikerjakan pada branch terisolasi `v3/p{n}-<slug>` yang dicabangkan dari `v3/editorial`.
3. Branch `legacy/v2` dan tag `legacy-v2-final` dibekukan total (read-only). Dilarang keras push atau force-push ke branch tersebut.
4. Merge dari branch fase ke `v3/editorial` hanya dilakukan setelah fase mendapatkan `APPROVE P{n}` dari pengguna.

## Konsekuensi
- **Positif**: Isolasi total antara v2 dan v3; memudahkan audit regresi dan git bisect jika terjadi deviasi.
- **Negatif**: Memerlukan disiplin tinggi dalam sinkronisasi branch kerja ke remote origin.
