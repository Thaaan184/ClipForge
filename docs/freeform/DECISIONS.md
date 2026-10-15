# DECISIONS: Keputusan Arsitektur Freeform Canvas Studio

Dokumen ini mencatat keputusan desain teknis sederhana yang diambil selama implementasi fitur Freeform Canvas Studio.

---

1. **Format Koordinat Shape vs Proxy**:
   - Seluruh koordinat shape (`bbox`, `points`) disimpan dalam ruang koordinat resolusi sumber asli (`full.mp4`).
   - Frontend memetakan skala koordinat antara display video/proxy dan koordinat asli menggunakan rasio `full_w / display_w`. Dengan cara ini, preview proxy 720p menghasilkan rendering akhir FFmpeg yang presisi di full resolution tanpa translasi ulang.

2. **State Manager Frontend**:
   - Menambahkan `zustand` ke `apps/web/package.json` untuk state store Freeform Studio yang terisolasi dan performant (undo/redo snapshot stack, active layer selection, gizmo transform state).

3. **Masking & Frame Generation**:
   - Menggunakan Pillow dengan antialiasing 4x supersampling (downscale via LANCZOS) untuk menghasilkan `mask.png`, `ring.png` (border stroke di dalam), dan `shadow.png` (drop shadow simetris).
   - Menghindari filter `geq` di FFmpeg untuk menjamin render berkecepatan tinggi.

4. **Kompensasi Poros Rotasi di FFmpeg**:
   - Menggunakan rumus `ow = rotw(angle)`, `oh = roth(angle)` dengan offset kompensasi translasi `overlay=round(cx - ow/2):round(cy - oh/2)` sehingga pusat rotasi tepat di titik tengah layer (`cx, cy`).

5. **Penanganan Kandidat Belum Diedit**:
   - Jika kandidat Keep diatur ke mode Freeform tapi belum memiliki layer di scene graph, sistem tidak akan merendernya dan memunculkan peringatan eksplisit di UI (tidak fallback diam-diam ke preset).

6. **Test Runner Frontend**:
   - Menambahkan `vitest` (^2.1.0) ke `apps/web/package.json` untuk pengujian unit matematika transformasi afin matriks, inverse mapping, hit-testing polygon/ellipse/rect, Douglas-Peucker simplification, dan Zustand undo/redo stack.

7. **Garansi Kebersihan Aset Sementara**:
   - Direktori `_scene_tmp` dan seluruh file `mask.png`, `ring.png`, `shadow.png` dihapus pada blok `finally` di `engine.py`, baik saat proses render FFmpeg berhasil maupun gagal.

8. **Paritas Resolusi Subtitle ASS (PlayRes)**:
   - Header `PlayResX: 1080` dan `PlayResY: 1920` dipaksakan ke script ASS saat rendering layer kanvas bebas agar rendering font karaoke tidak mengecil saat di-burn ke output 9:16.

