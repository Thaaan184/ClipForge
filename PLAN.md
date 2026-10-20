# PLAN.md — ClipForge v3 "Editorial Studio" (Remotion + AI Chat)

> Rencana utama. Perubahan isi dokumen ini hanya lewat persetujuan user.
> Aturan kerja: `RULES.md`. Format laporan: `PHASE_REPORT_TEMPLATE.md`.

---

## 1. Visi

Setelah klip dipotong oleh pipeline v2, pengguna dapat membuka **Editorial Studio**: panel chat tipis tempat pengguna menambah asset (foto, musik/SFX, video b-roll), opsional mengirim script, atau membiarkan AI "memasak sendiri". AI menulis komposisi **Remotion (TSX)** untuk menghasilkan video vertikal yang matang. Render final Remotion dilakukan **paling akhir** setelah semua keputusan editorial.

Alur target:

`... → Human Review → [Editorial Source: cut + reframe, tanpa subtitle] → Editorial Studio (chat + Remotion) → Render Final → Loudnorm → QA → Export`

Alur v2 tanpa editorial tetap berfungsi sebagai jalur alternatif.

## 2. Prinsip

1. **Pertahankan baseline v2.** Pipeline deteksi, fusi, Scout, dan evaluasi tidak disentuh.
2. **Subtitle default mati.** Preset `none` menjadi default; preset lain tetap bisa dipilih.
3. **TSX buatan AI adalah jalur utama** (terbukti berhasil secara manual). Pengaman: static check, leak-guard, typecheck, versioning. Bukan sandbox ketat.
4. **Data ClipForge adalah keunggulan.** Agent menerima manifest (transkrip kata, puncak sinyal, jeda VAD, metadata Scout) sehingga efek tepat pada momen puncak.
5. **Render di akhir.** Iterasi memakai preview resolusi rendah.
6. **Terukur per fase.** Tiap fase punya acceptance criteria dan berhenti di gate.
7. **Genre MVP: gaming/esports.** Style pack awal `gaming_hype`.

## 3. Target Lingkungan

Host pribadi (self-host), minimum **4 vCPU / 8 GB RAM**, SSD. Satu job CPU-berat pada satu waktu (lihat RULES §8). Semua target performa di bawah bertanda *provisional* dan dikalibrasi ulang di P0.

## 4. Keputusan & Asumsi (dikonfirmasi user pada gate yang disebut)

| ID | Keputusan / Asumsi | Usulan default | Dikonfirmasi di |
|---|---|---|---|
| D1 | Strategi branch | `v3/editorial` dari tag `legacy-v2-final` | P0 |
| D2 | Versi Remotion | Versi stabil terbaru saat P0, dipin eksak; lisensi dicek user | P0 |
| D3 | Reframe 9:16 | Tetap di FFmpeg saat membuat Editorial Source; Remotion menerima klip 9:16 siap pakai | P0 |
| D4 | FPS composition | 30 fps (ikut ADR bila sumber berbeda) | P0 |
| D5 | LLM untuk agent | Klien OpenAI-compatible v2, dengan tool/function calling | P0 (diverifikasi) |
| D6 | Deskripsi asset visual | Vision LLM bila model multimodal; fallback metadata `ffprobe` + label pengguna | P0 |
| D7 | Audio di Editorial Source | **Tanpa loudnorm** (loudnorm dilakukan sekali di akhir, setelah musik dicampur) | P0 |
| D8 | Mode preview | **Preview = video low-res hasil render worker** (+ still pada timestamp). Live `@remotion/player` untuk kode dinamis hasil AI dinilai sulit; hanya dispike di P0, bukan syarat MVP | P0 |
| D9 | Safe zone awal (rasio terhadap 1080×1920) | top 0,12 · bottom 0,20 · left 0,06 · right 0,12. Nilai awal usulan, wajib dikonfirmasi user, disimpan di config | P2 |
| D10 | Seed gaya | `prompt.md` dan contoh `Composition.tsx` milik user yang sudah terbukti, diletakkan di `docs/v3/seed/` | P0 (harus ada sebelum P4) |

## 5. Arsitektur Target

```
FastAPI (apps/api)                          Editorial Worker (Node, 127.0.0.1)
 ├─ pipeline v2 (tidak berubah)              ├─ POST /typecheck
 ├─ export: editorial_source (baru)          ├─ POST /still     (1 frame)
 ├─ editorial/                               ├─ POST /preview   (low-res mp4)
 │   ├─ sessions, versions, assets (SQLite)  ├─ POST /render    (final)
 │   ├─ manifest builder                     └─ progress via polling/SSE
 │   ├─ agent runtime (tool loop, LLM)
 │   ├─ leak-guard (static check + secret scan)
 │   ├─ heavy-job semaphore
 │   └─ final pipeline: render → loudnorm → QA
 └─ REST + SSE untuk frontend

Frontend (apps/web)
 └─ Editorial Studio: preview, asset tray, chat, versions, render final

Workspace per klip: workspaces/{session_id}/
 ├─ public/   clip_source.mp4, assets/asset_{id}.*
 ├─ context/  manifest.json, style.md, script.md (opsional)
 ├─ src/      Composition.tsx (+ file tambahan dari agent)
 ├─ kit/      komponen bersama (read-only bagi agent)
 └─ .git      riwayat versi
```

Nama folder aktual (`apps/editorial-worker`, dll.) MUST diselaraskan dengan struktur repo hasil audit P0.

## 6. Peta Fase

| Fase | Nama | Output utama | Bergantung pada |
|---|---|---|---|
| P0 | Baseline & Audit | Peta repo aktual, baseline test, benchmark Remotion, ADR keputusan | — |
| P1 | Subtitle Default Mati & Editorial Source | Default `none`, ekspor editorial_source | P0 |
| P2 | Editorial Engine (tanpa UI, tanpa AI) | Worker, workspace, manifest, pipeline render akhir | P1 |
| P3 | Editorial Studio UI (tanpa AI) | UI studio, asset tray, versi, preview, render final | P2 |
| P4 | AI Agent + Autopilot | Agent loop, indeks asset, chat autopilot, style pack v0 | P3 |
| P5 | Iterasi, Script, Musik, B-roll | Chat-edit patch, mode script, beat/ducking, style pack tersimpan | P4 |
| P6 | Hardening & Acceptance Akhir | Recovery, cleanup, QA diperluas, docker, dokumen, regression penuh | P5 |

Setiap fase diakhiri laporan dan gate (RULES §3).

---

## P0 — Baseline & Audit

**Tujuan:** memahami v2 sebagaimana adanya, membuktikan baseline bisa dijalankan, dan mengunci keputusan teknis. **Tidak ada perubahan kode di `apps/`.**

**Task**
1. Buat branch `v3/editorial` dari tag `legacy-v2-final`; catat SHA dan verifikasi tag cocok dengan `legacy/v2`.
2. Audit struktur aktual vs handover doc: tabel modul (ada/tidak, lokasi, catatan), dependency, endpoint, skema database, konfigurasi, Docker.
3. Jalankan aplikasi dan test suite yang ada; simpan hasil sebagai `baseline-tests.md` (lulus/gagal/di-skip beserta alasan).
4. Telusuri satu job end-to-end pada sampel gaming; simpan diagram urutan, log, waktu tiap stage, dan artefak output.
5. Inventaris kontrak: endpoint, model Pydantic, status job, daftar preset, skema scene graph, skema output LLM Scout, tipe frontend.
6. Verifikasi perilaku preset `none`: render klip dengan `none` dan dengan satu preset lain; periksa perintah FFmpeg/filtergraph dan frame. Laporkan apakah ada subtitle terbakar dan apakah ada efek samping (misalnya re-ASR yang tetap berjalan).
7. Telusuri di kode: lokasi default preset subtitle (backend dan frontend), dan alur `RENDER_CLIPS` (reframe, subtitle, loudnorm) untuk merancang Editorial Source.
8. Spike Remotion di folder buangan `spikes/remotion-bench/` (di luar `apps/`):
   - Komposisi 1080×1920, 30 fps, memakai `<OffthreadVideo>` dari klip sampel + satu `<Audio>`.
   - Ukur render 10 detik dan 60 detik: waktu, puncak RSS, concurrency 1 vs 2 vs 3. Catat spesifikasi mesin.
   - Catat kebutuhan instalasi (Node, Chromium, library sistem) dan implikasi Docker.
   - Uji kelayakan memuat komposisi dinamis ke `@remotion/player` di frontend (hanya hasil ya/tidak + alasan).
   - Catat ketentuan lisensi Remotion dari sumber resminya untuk dikonfirmasi user. Agent tidak menyimpulkan sendiri.
9. Verifikasi klien LLM v2: dukungan tool/function calling dan input gambar.
10. Tulis ADR untuk D1–D8 dengan rekomendasi. Periksa keberadaan seed D10; jika belum ada, minta ke user.

**Deliverables**
`docs/v3/evidence/p0/` (baseline.md, baseline-tests.md, repo-audit.md, e2e-trace.md, contracts-inventory.md, none-preset-check.md, remotion-bench.md, llm-capabilities.md), `docs/v3/adr/ADR-001..008`, laporan P0.

**Acceptance Criteria**
- [ ] SHA baseline tercatat dan tag cocok.
- [ ] Tabel audit mencakup semua modul di handover §3 dengan status VERIFIED/ASSUMED/UNKNOWN.
- [ ] Baseline test dijalankan; hasil lengkap termasuk yang gagal.
- [ ] Satu job e2e berhasil dijalankan dan didokumentasikan, atau alasan tidak bisa dijelaskan.
- [ ] Perilaku `none` terbukti dengan perintah FFmpeg dan minimal 2 frame pembanding.
- [ ] Benchmark Remotion memuat tabel waktu dan memori (10 s dan 60 s × concurrency 1/2/3).
- [ ] Target performa provisional dikalibrasi ulang berdasarkan hasil benchmark (diusulkan, menunggu user).
- [ ] Kemampuan tool-calling dan multimodal LLM terverifikasi.
- [ ] ADR D1–D8 ditulis dengan rekomendasi.
- [ ] Tidak ada perubahan pada `apps/`.

**Pertanyaan ke user di gate:** konfirmasi D1–D8, penyediaan seed D10, sampel gaming untuk uji (minimal 5 klip beragam), konfirmasi lisensi Remotion.

---

## P1 — Subtitle Default Mati & Editorial Source

**Tujuan:** pipeline v2 menghasilkan klip tanpa subtitle secara default, dan tersedia ekspor "editorial source" sebagai bahan masukan Remotion.

**Task**
1. Ubah default preset subtitle menjadi `none` di semua titik default hasil audit P0 (model API, konfigurasi, pembuatan job, request render, frontend). Preset lain tetap dapat dipilih.
2. Pada UI, pilihan `none` tampil terpilih secara default dengan label jelas.
3. Pastikan saat `none`: tidak ada generasi/pembakaran ASS. Re-ASR yang khusus untuk timestamp subtitle dilewati **hanya jika** terbukti tidak dipakai komponen lain (verifikasi di kode).
4. Tambahkan mode render **`editorial_source`**: potong rentang final, reframe 9:16 sesuai pengaturan pengguna (D3), tanpa subtitle, audio tanpa loudnorm (D7), `yuv420p`. Simpan path dan metadata (durasi, fps, resolusi, checksum) pada rekaman clip/job. Ikuti konvensi penamaan route dan skema yang ada.
5. Perluas QA untuk editorial_source: resolusi, pixel format, selisih durasi A/V < 80 ms, dan pemeriksaan "tanpa subtitle".
6. Tambahkan test untuk default, preset eksplisit, dan editorial_source.

**Workstream:** WS-A (backend), WS-C (frontend default), WS-D (test).

**Deliverables:** perubahan kode, test, `docs/v3/contracts/editorial-source.md`, bukti frame, laporan P1.

**Acceptance Criteria**
- [ ] Job baru tanpa menentukan preset menghasilkan output tanpa subtitle (bukti: perintah render tidak memuat filter subtitle + frame pembanding dengan render preset `classic_white` pada timestamp yang sama).
- [ ] Memilih preset lain secara eksplisit tetap menghasilkan subtitle (smoke test minimal `classic_white` dan `hormozi_bold`).
- [ ] Frontend menampilkan `none` sebagai default; typecheck, lint, build lulus.
- [ ] `editorial_source` untuk 3 klip berbeda lulus QA (1080×1920, yuv420p, A/V < 80 ms) dengan checksum tercatat.
- [ ] Seluruh baseline test P0 tetap lulus (tidak ada regresi).
- [ ] Tidak ada perubahan pada modul deteksi/fusi/Scout/eval (dibuktikan dengan `git diff --stat` per direktori).
- [ ] Kontrak editorial_source terdokumentasi.

---

## P2 — Editorial Engine (tanpa UI, tanpa AI)

**Tujuan:** membuktikan jalur teknis dari editorial source sampai video final berjalan, memakai komposisi yang ditulis manual.

**Task**
1. **Kontrak dulu (WS-D):** skema `manifest.json` (versi, Pydantic + JSON Schema + tipe TS), state machine editorial, daftar endpoint, format progres. Lihat Lampiran A–C sebagai draf awal.
2. **Worker Node (WS-B):** paket Remotion terpin (D2); endpoint `/typecheck`, `/still`, `/preview`, `/render`; env bersih; bind 127.0.0.1; pelaporan progres; instalasi dependency bersama (hindari `npm install` per workspace).
3. **Workspace (WS-B/WS-A):** template workspace, pembuatan dari klip, git init per workspace, pembuatan versi.
4. **Manifest builder (WS-A):** dari data job v2 membuat manifest berwaktu clip-relative: kata transkrip, puncak sinyal, jeda VAD, metadata Scout, info klip. Jika transkrip belum tersedia untuk klip (karena `none` melewati re-ASR), manifest builder memakai transkrip kandidat dari TARGETED_ASR atau menjalankan ASR terarah sesuai temuan P0; keputusan dicatat di ADR.
5. **Tabel & orkestrasi (WS-A):** `editorial_sessions`, `editorial_versions`, `editorial_assets`, `editorial_messages` (terpisah dari job v2); semaphore global; pipeline akhir: render Remotion → loudnorm audio saja (video `-c:v copy`) → QA → hasil.
6. **Leak-guard (WS-A):** static check dan secret scan sesuai RULES §7.
7. **`kit/` minimal (WS-B):** `safezone.ts`, `KineticCaptions` (dari kata + timestamp), `PunchZoom`, `DuckedMusic`, `SourceVideo`. Dengan test render sederhana.
8. **Skrip bukti:** `scripts/editorial_e2e.py <clip_id>` menjalankan seluruh jalur dengan komposisi manual (dari seed D10 bila ada; jika tidak, komposisi sederhana buatan sendiri dan ditandai).

**Deliverables:** kode, kontrak, test, skrip e2e, tabel metrik, laporan P2.

**Acceptance Criteria**
- [ ] Skrip e2e menghasilkan video final dari 3 klip berbeda tanpa intervensi manual.
- [ ] Output final lulus: 1080×1920, yuv420p, LUFS −16 ± 1, true peak ≤ −1,5 dBFS, A/V < 80 ms.
- [ ] Timestamp kata di manifest sesuai klip: sampel 20 kata, deviasi ≤ 50 ms terhadap transkrip sumber setelah konversi.
- [ ] Dua permintaan render final berurutan dijalankan serial oleh semaphore (bukti log waktu).
- [ ] Render final tidak berjalan bersamaan dengan job ASR/DSP (bukti test).
- [ ] Mematikan worker saat render: sesi berstatus FAILED yang jelas, retry berhasil tanpa menggandakan versi atau file.
- [ ] Leak-guard: test menolak komposisi berisi `process.env`, `child_process`, `fetch` ke host eksternal; secret scan menemukan kunci dummy yang sengaja ditanam.
- [ ] Env worker terbukti tidak memuat variabel secret backend (bukti: dump env proses worker).
- [ ] Metrik puncak RSS dan waktu render 60 detik dilaporkan dan dibandingkan dengan target (provisional: render final 60 s ≤ 6 menit, puncak RSS ≤ 6,5 GB).
- [ ] Seluruh baseline test dan test P1 lulus.

---

## P3 — Editorial Studio UI (tanpa AI)

**Tujuan:** pengalaman pengguna studio berjalan end-to-end dengan komposisi manual; chat masih stub.

**Task**
1. Tombol **"Editorial"** di layar review klip (di samping Export biasa). Tanpa klik, alur v2 tidak berubah.
2. Halaman studio tiga area: preview 9:16 (video preview low-res), panel chat (stub echo), asset tray.
3. **Asset tray:** drag-drop upload foto/audio/video; validasi tipe dan ukuran; thumbnail; metadata `ffprobe` (durasi, resolusi, dll.); edit label dan hint; hapus; mention `@nama` di input chat.
4. **Daftar versi:** riwayat dengan ringkasan, tombol restore (menghasilkan preview versi tersebut).
5. **Preview:** tombol "Render preview" memakai komposisi manual saat ini; tombol **"Komentar di detik ini"** menyisipkan timestamp ke input chat.
6. **Render Final:** tombol dengan progres, ETA, dan unduhan hasil; sinkron dengan state sesi (tetap benar setelah refresh halaman).
7. Penanganan error berbahasa Indonesia untuk kegagalan typecheck/render/upload.
8. Tipe TS dan klien API sinkron dengan kontrak P2.

**Workstream:** WS-C (frontend) utama, WS-A (endpoint upload/asset/versi/SSE), WS-D (test).

**Acceptance Criteria**
- [ ] Upload 3 jenis asset muncul dengan thumbnail dan metadata benar; file di luar tipe/ukuran ditolak dengan pesan jelas.
- [ ] Preview ter-render dan dapat diputar; restore versi lama menghasilkan preview versi itu.
- [ ] Tombol timestamp menyisipkan format `[mm:ss.s]` yang sesuai posisi pemutaran (uji manual + bukti).
- [ ] Render final selesai dari UI; refresh halaman saat render menampilkan status yang benar.
- [ ] Nama file asset berbahaya (`../../x`, spasi, karakter shell) tidak merusak sistem (uji).
- [ ] Typecheck, lint, build frontend lulus; halaman v2 yang ada tidak berubah perilaku (smoke test).
- [ ] Screenshot tiap state utama dilampirkan.
- [ ] Seluruh test sebelumnya lulus.

---

## P4 — AI Agent + Autopilot

**Tujuan:** AI "memasak sendiri": dari manifest dan asset menjadi preview yang valid tanpa campur tangan manusia.

**Task**
1. **Agent runtime (WS-A):** tool-calling loop dengan tool `read_file`, `write_file`, `edit_file`, `list_assets`, `typecheck`, `render_still`, `render_preview`; scoped ke workspace (RULES §7.3); batas iterasi/token/waktu (RULES §10.2); commit versi per giliran.
2. **System prompt runtime** (`prompts/editorial_agent.md`): dibangun dari seed `prompt.md` (D10). Bagian wajib: peran, format manifest, aturan Remotion (RULES §9), safe zone, aturan data tidak tepercaya, urutan kerja, format ringkasan ke chat. Seed MUST dipakai sebagai dasar; agent MUST NOT menggantinya dengan prompt karangan sendiri.
3. **Indeks asset (WS-A):** foto/video → keyframe + deskripsi (D6); video → deteksi pergantian shot sederhana; audio → durasi, BPM, energi. Pakai dependency yang sudah ada (NumPy/SciPy/FFmpeg); dependency baru hanya lewat ADR.
4. **Autopilot UX (WS-C):** pesan pembuka konteks klip + tiga tombol (`Masak otomatis`, `Kirim script` (nonaktif sampai P5), `Tambah asset dulu`); toggle "Review rencana dulu"; progres satu baris per langkah via SSE; ringkasan hasil; `Lihat kode`.
5. **Style pack v0 `gaming_hype`:** disalin dari seed; disimpan sebagai berkas terstruktur (`style.md` + parameter), dimuat otomatis ke workspace.
6. Leak-guard dijalankan sebelum setiap compile/render.
7. Pencatatan metrik run: iterasi, token, durasi, hasil typecheck/render.

**Acceptance Criteria**
- [ ] Pada 5 klip gaming (minimal 3 kategori Scout berbeda), autopilot menghasilkan preview yang lolos typecheck dan ter-render tanpa intervensi pada ≥ 4/5 klip, dalam ≤ 8 iterasi tool-loop per klip (angka provisional).
- [ ] Tiap hasil memuat caption dari timestamp kata manifest dan ≥ 1 efek tersinkron dengan puncak sinyal (|t_efek − t_puncak| ≤ 150 ms, diukur dari kode/manifest).
- [ ] Asset yang diberi hint pengguna muncul sesuai hint pada ≥ 80% kasus uji (minimal 5 skenario).
- [ ] Semua teks berada dalam safe zone (cek otomatis pada frame sampel atau metadata komposisi).
- [ ] Tidak ada secret pada prompt (bukti: log prompt tersanitasi), workspace, atau output; secret scan lulus.
- [ ] Tool agent menolak path di luar workspace (test traversal dan symlink).
- [ ] Kegagalan (iterasi habis, typecheck gagal) tampil sebagai pesan jelas di chat, tidak menggantung.
- [ ] Laporan memuat tabel per klip: iterasi, token, durasi, hasil, dan tautan preview untuk dinilai user (skor 1–5; menjadi baseline kualitas).
- [ ] Seluruh test sebelumnya lulus.

---

## P5 — Iterasi, Script, Musik, B-roll

**Tujuan:** pengalaman chat lengkap: revisi, script, sinkron musik, b-roll, dan penyimpanan gaya.

**Task**
1. **Chat-edit patch:** instruksi bebas dan chip cepat (`Lebih rame`, `Lebih clean`, `Ganti musik`, `Caption lebih besar`) menghasilkan patch minimal dan versi baru; komentar bertimestamp diterjemahkan menjadi jendela perubahan.
2. **Mode script:** input teks/`.md`; toggle `ikuti persis` / `jadikan panduan`; alignment script ke transkrip memakai pencocokan teks terhadap kata ber-timestamp (tanpa model baru); beat sheet dengan skor keyakinan; baris yang tidak cocok ditandai dan ditampilkan ke pengguna.
3. **Musik:** BPM dan beat grid masuk manifest; ducking di bawah suara berdasarkan VAD; opsi sinkron efek ke beat; loudness final tetap lulus.
4. **B-roll:** pencocokan deskripsi asset dengan segmen transkrip; durasi tidak melebihi segmen; tidak menutupi momen puncak kecuali diminta.
5. **Style pack:** tombol "Simpan gaya ini" dari sesi; terapkan style pack ke klip baru dengan satu klik (autopilot memakai gaya itu).
6. Toggle "Review rencana dulu" berfungsi penuh (persetujuan beat sheet sebelum menulis kode).

**Acceptance Criteria**
- [ ] 10 instruksi uji terskrip (termasuk "zoom lebih sering", "ganti musik", "caption lebih besar", "hapus b-roll di 00:20") menghasilkan versi yang lolos typecheck dan render pada 10/10.
- [ ] Untuk instruksi bertimestamp, frame di luar jendela ±3 detik tidak berubah (SSIM ≥ 0,98 pada sampel frame).
- [ ] Mode `ikuti persis`: ≥ 90% baris script ter-align atau ditandai jelas; teks caption mengikuti script (uji pada 3 script).
- [ ] BPM terdeteksi dengan toleransi ±3 BPM pada 3 musik uji yang BPM-nya diketahui user.
- [ ] Ducking: level musik turun terukur saat ada suara (bukti pengukuran), LUFS final −16 ± 1.
- [ ] B-roll tidak melebihi durasi segmen dan tidak menutupi puncak tanpa permintaan (uji pada 3 klip).
- [ ] Simpan dan terapkan style pack berfungsi pada klip kedua tanpa input tambahan.
- [ ] Seluruh test sebelumnya lulus.

---

## P6 — Hardening & Acceptance Akhir

**Tujuan:** stabil, bisa dioperasikan, dan terbukti tidak merusak v2.

**Task**
1. **Recovery:** skenario crash backend/worker pada tiap state; status konsisten; resume atau retry aman.
2. **Cleanup & disk:** kebijakan retensi workspace/preview/final; tampilan penggunaan disk.
3. **Docker:** layanan worker di `docker-compose.yml` (termasuk dependensi Chromium), start bersih dari clone baru.
4. **Pengaturan:** konfigurasi concurrency, batas agent, safe zone, retensi; terdokumentasi.
5. **QA diperluas:** deteksi frame hitam, clipping audio, teks di luar safe zone, durasi tidak cocok.
6. **Regression penuh:** seluruh test, evaluasi deteksi v2 (Recall@K dan Mean IoU) dijalankan ulang dan dibandingkan dengan baseline P0.
7. **Dokumen:** runbook operasional, arsitektur terbaru, troubleshooting, daftar known issues.
8. **Benchmark akhir:** tabel waktu dan memori pada 4 vCPU/8 GB.

**Stretch (hanya dengan persetujuan user, lewat CR):** loop kritik visual (agent menilai still hasil render dan memperbaiki diri), live `@remotion/player`.

**Acceptance Criteria**
- [ ] 10 klip diproses end-to-end (autopilot lalu final) dengan keberhasilan ≥ 90% tanpa perbaikan manual.
- [ ] Skenario crash di tiap state (minimal 6 skenario) pulih dengan benar.
- [ ] `docker compose up` dari clone bersih menjalankan seluruh layanan; bukti log.
- [ ] Metrik evaluasi deteksi v2 identik dengan baseline P0 (atau selisih dijelaskan; pipeline deteksi tidak berubah).
- [ ] Target performa akhir tercapai atau deviasi dijelaskan: render final 60 s dan puncak RSS vs target hasil kalibrasi P0.
- [ ] QA diperluas berjalan di pipeline dan menangkap kasus uji yang sengaja dirusak (minimal 4 jenis).
- [ ] Dokumentasi lengkap dan diuji oleh langkah-langkah di runbook.
- [ ] Daftar known issues jujur dan terprioritas.

---

## 7. Lampiran A — Draf Skema Manifest (v1)

Semua waktu: detik relatif awal klip. Draf; final ditetapkan di P2.

```json
{
  "manifest_version": 1,
  "clip": { "id": "", "source_job_id": "", "duration": 0.0, "fps": 30, "width": 1080, "height": 1920,
            "source_file": "public/clip_source.mp4" },
  "transcript": { "language": "id", "words": [ { "w": "", "start": 0.0, "end": 0.0, "conf": 0.0 } ] },
  "signals": {
    "peaks": [ { "t": 0.0, "score": 0.0, "kinds": ["loudness", "onset", "chat"] } ],
    "vad_silences": [ { "start": 0.0, "end": 0.0 } ]
  },
  "scout": { "category": "", "title": "", "hook": "", "reason": "", "confidence": 0.0 },
  "assets": [ { "id": "", "type": "image|audio|video", "path": "public/assets/asset_x.ext",
                "label": "", "hint": "", "description": "", "duration": 0.0, "bpm": null } ],
  "style_pack": "gaming_hype",
  "script": { "mode": "none|strict|guide", "text": "" },
  "safe_zone": { "top": 0.12, "bottom": 0.20, "left": 0.06, "right": 0.12 }
}
```

## 8. Lampiran B — State Machine Editorial (terpisah dari job v2)

`EDITORIAL_DRAFT → AGENT_WORKING → PREVIEW_READY ⇄ AGENT_WORKING → RENDERING_FINAL → AUDIO_NORMALIZING → QA → DONE`
Jalur kegagalan: setiap state → `FAILED` (dengan `failed_stage`, `error`, `retryable`). Retry harus idempotent.

## 9. Lampiran C — Draf Endpoint (diselaraskan dengan konvensi route aktual di P0)

```
POST   /editorial/sessions                 {clip_id, style_pack?}
GET    /editorial/sessions/{id}
POST   /editorial/sessions/{id}/assets     (multipart)
PATCH  /editorial/sessions/{id}/assets/{a} {label, hint}
DELETE /editorial/sessions/{id}/assets/{a}
POST   /editorial/sessions/{id}/messages   {text, mode, timestamps?}  → SSE progres
GET    /editorial/sessions/{id}/versions
POST   /editorial/sessions/{id}/versions/{v}/restore
POST   /editorial/sessions/{id}/preview
POST   /editorial/sessions/{id}/render-final
GET    /editorial/sessions/{id}/status
```

## 10. Struktur Dokumen di Repo

```
docs/v3/
  seed/            00-handover-v2.md, prompt.md (milik user), contoh Composition.tsx
  adr/             ADR-001-*.md ...
  contracts/       manifest.md, state-machine.md, api.md, editorial-source.md
  change-requests/ CR-001.md ...
  evidence/p0..p6/
  reports/         P0-report.md ...
```

## 11. Di Luar Scope (seluruh proyek ini)

Speaker diarization, face tracking, multi-genre selain gaming, render terdistribusi/cloud, B-roll dari stok eksternal, akun multi-pengguna, penggantian SQLite, perubahan pipeline deteksi. Ide-ide ini hanya masuk lewat Change Request.
