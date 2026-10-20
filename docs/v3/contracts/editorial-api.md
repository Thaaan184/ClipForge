# Kontrak Komponen: Editorial API & Worker Service

## 1. REST Endpoints Backend (`/api/editorial`)

### 1.1. Sesi Editorial
- `POST /api/editorial/sessions`:
  - Request: `{ "clip_id": "string", "style_pack": "gaming_hype" }`
  - Response `201 Created`: Detail sesi editorial dan URL workspace.
- `GET /api/editorial/sessions/{id}`:
  - Response `200 OK`: Data sesi, clip info, active version, status, manifest path.
- `GET /api/editorial/sessions/{id}/status`:
  - Response `200 OK`: `{ "session_id": "...", "status": "...", "progress": 0.5, "stage": "..." }`

### 1.2. Aset Pengguna
- `POST /api/editorial/sessions/{id}/assets`:
  - Request: `multipart/form-data` (file, label?, hint?).
  - Validasi: Format diizinkan (PNG, JPG, WEBP, MP3, WAV, MP4), ukuran maks 50MB.
  - Response `201 Created`: Metadata aset (id, type, ffprobe resolution/duration, path).
- `PATCH /api/editorial/sessions/{id}/assets/{asset_id}`:
  - Request: `{ "label": "string", "hint": "string" }`
- `DELETE /api/editorial/sessions/{id}/assets/{asset_id}`:
  - Menghapus aset dari database dan filesystem workspace.

### 1.3. Versi & Render
- `GET /api/editorial/sessions/{id}/versions`:
  - Response `200 OK`: Riwayat snapshot commit, ringkasan perubahan, preview path.
- `POST /api/editorial/sessions/{id}/versions/{version_num}/restore`:
  - Mengembalikan workspace ke commit SHA versi tersebut dan render preview ulang.
- `POST /api/editorial/sessions/{id}/preview`:
  - Memicu pembuatan video preview low-res (540×960, 30fps).
- `POST /api/editorial/sessions/{id}/render-final`:
  - Memicu render full resolution Remotion -> Loudnorm EBU R128 -> QA.
- `GET /api/editorial/sessions/{id}/preview.mp4`:
  - Streaming video preview low-res.
- `GET /api/editorial/sessions/{id}/final.mp4`:
  - Unduhan berkas video final selesai.

---

## 2. Worker HTTP Service (Internal `127.0.0.1:8765`)

Worker Node.js berjalan di localhost internal dan hanya dapat diakses oleh FastAPI backend (tidak terekspos ke publik).

| Endpoint | Method | Payload | Deskripsi |
|---|---|---|---|
| `/health` | `GET` | — | Memeriksa ketersediaan Chromium headless shell dan Remotion |
| `/typecheck` | `POST` | `{ "workspace_dir": "string" }` | Menjalankan `tsc --noEmit` pada kode TSX workspace |
| `/still` | `POST` | `{ "workspace_dir": "string", "frame": 60, "output_path": "string" }` | Render satu still frame (PNG) |
| `/preview` | `POST` | `{ "workspace_dir": "string", "output_path": "string", "concurrency": 2 }` | Render video preview low-res MP4 |
| `/render` | `POST` | `{ "workspace_dir": "string", "output_path": "string", "concurrency": 2 }` | Render full 1080×1920 30fps raw video Remotion |

### Format Respon Worker
```json
{
  "success": true,
  "elapsed_s": 14.2,
  "output_path": "/path/to/output.mp4",
  "error": null
}
```
Jika gagal:
```json
{
  "success": false,
  "elapsed_s": 2.1,
  "output_path": null,
  "error": "TS2304: Cannot find name 'foo' in Composition.tsx:42"
}
```
