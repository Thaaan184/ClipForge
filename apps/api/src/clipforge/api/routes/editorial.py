"""REST API routes for Editorial Studio v3 (/api/editorial)."""

import json
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import aiosqlite
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from clipforge.core.config import settings
from clipforge.db.connection import get_db
from clipforge.editorial.agent_runtime import run_autopilot_agent
from clipforge.editorial.asset_indexer import index_asset
from clipforge.editorial.leak_guard import audit_workspace_security, scan_code_string
from clipforge.editorial.manifest import build_editorial_manifest, save_manifest
from clipforge.editorial.models import (
    EditorialAssetResponse,
    EditorialAssetUpdate,
    EditorialMessageCreate,
    EditorialMessageResponse,
    EditorialSessionCreate,
    EditorialSessionResponse,
    EditorialStatusResponse,
    EditorialVersionResponse,
    ManifestAsset,
)
from clipforge.editorial.pipeline import (
    RENDER_SEMAPHORE,
    normalize_editorial_audio,
    run_editorial_final_qa,
)
from clipforge.editorial.worker_client import worker_client
from clipforge.editorial.workspace import (
    commit_workspace_version,
    get_workspace_dir,
    init_workspace,
    restore_workspace_version,
)

router = APIRouter(prefix="/api/editorial", tags=["editorial"])


@router.post("/sessions", response_model=EditorialSessionResponse, status_code=201)
async def create_editorial_session(
    payload: EditorialSessionCreate,
    db: aiosqlite.Connection = Depends(get_db),
) -> EditorialSessionResponse:
    """Initialize a new editorial workspace session for a clip."""
    # Verify clip exists
    async with db.execute(
        "SELECT id, editorial_source_path, video_path FROM clips WHERE id = ?",
        (payload.clip_id,),
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Clip not found")
        clip_id, ed_path, v_path = row[0], row[1], row[2]

    source_path = Path(ed_path) if ed_path else (Path(v_path) if v_path else Path("missing.mp4"))
    session_id = f"ed_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(UTC).isoformat()

    # Build manifest
    manifest = await build_editorial_manifest(
        db=db,
        clip_id=clip_id,
        session_id=session_id,
        style_pack=payload.style_pack,
    )

    # Initialize workspace
    ws_meta = init_workspace(
        session_id=session_id,
        clip_id=clip_id,
        editorial_source_path=source_path,
        manifest=manifest,
    )

    # Save to database
    await db.execute(
        """
        INSERT INTO editorial_sessions (
            id, clip_id, status, current_version, style_pack,
            workspace_dir, manifest_path, created_at, updated_at
        ) VALUES (?, ?, 'EDITORIAL_DRAFT', 1, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            clip_id,
            payload.style_pack,
            ws_meta["workspace_dir"],
            ws_meta["manifest_path"],
            now_iso,
            now_iso,
        ),
    )

    # Create initial version record
    v_id = f"v_{uuid.uuid4().hex[:8]}"
    await db.execute(
        """
        INSERT INTO editorial_versions (
            id, session_id, version_num, commit_sha, summary, created_at
        ) VALUES (?, ?, 1, ?, 'Initial editorial workspace', ?)
        """,
        (v_id, session_id, ws_meta["commit_sha"], now_iso),
    )
    await db.commit()

    return EditorialSessionResponse(
        id=session_id,
        clip_id=clip_id,
        status="EDITORIAL_DRAFT",
        current_version=1,
        style_pack=payload.style_pack,
        workspace_dir=ws_meta["workspace_dir"],
        manifest_path=ws_meta["manifest_path"],
        created_at=now_iso,
        updated_at=now_iso,
    )


@router.get("/sessions/{session_id}", response_model=EditorialSessionResponse)
async def get_editorial_session(
    session_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> EditorialSessionResponse:
    """Retrieve editorial session state."""
    async with db.execute(
        """
        SELECT id, clip_id, status, current_version, style_pack,
               workspace_dir, manifest_path, error_message, failed_stage,
               created_at, updated_at
        FROM editorial_sessions
        WHERE id = ?
        """,
        (session_id,),
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Editorial session not found")

    return EditorialSessionResponse(
        id=row[0],
        clip_id=row[1],
        status=row[2],
        current_version=row[3],
        style_pack=row[4],
        workspace_dir=row[5],
        manifest_path=row[6],
        error_message=row[7],
        failed_stage=row[8],
        created_at=row[9],
        updated_at=row[10],
    )


@router.get("/sessions/{session_id}/versions", response_model=list[EditorialVersionResponse])
async def list_editorial_versions(
    session_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> list[EditorialVersionResponse]:
    """Retrieve all snapshot versions for an editorial session."""
    async with db.execute(
        """
        SELECT id, session_id, version_num, commit_sha, summary,
               preview_path, final_path, qa_json, created_at
        FROM editorial_versions
        WHERE session_id = ?
        ORDER BY version_num ASC
        """,
        (session_id,),
    ) as cur:
        rows = await cur.fetchall()

    return [
        EditorialVersionResponse(
            id=r[0],
            session_id=r[1],
            version_num=r[2],
            commit_sha=r[3],
            summary=r[4],
            preview_path=r[5],
            final_path=r[6],
            qa_json=json.loads(r[7]) if r[7] else None,
            created_at=r[8],
        )
        for r in rows
    ]


@router.post("/sessions/{session_id}/preview")
async def trigger_preview_render(
    session_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Render fast low-res MP4 preview using Remotion worker."""
    ws_dir = get_workspace_dir(session_id)
    if not ws_dir.exists():
        raise HTTPException(status_code=404, detail="Workspace directory not found")

    # Security scan before compile
    sec = audit_workspace_security(ws_dir)
    if not sec["passed"]:
        raise HTTPException(status_code=400, detail=f"Security violation: {sec['errors']}")

    # Typecheck
    tc = await worker_client.typecheck(ws_dir)
    if not tc.get("success"):
        raise HTTPException(status_code=400, detail=f"TypeScript typecheck failed: {tc.get('errors')}")

    out_preview = ws_dir / "preview.mp4"
    res = await worker_client.render_preview(
        workspace_dir=ws_dir,
        output_path=out_preview,
        concurrency=2,
    )
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=f"Worker preview render failed: {res.get('error')}")

    # Commit snapshot
    commit_sha = commit_workspace_version(ws_dir, summary="Render preview update")

    # Update session state to PREVIEW_READY
    now_iso = datetime.now(UTC).isoformat()
    await db.execute(
        """
        UPDATE editorial_sessions
        SET status = 'PREVIEW_READY', updated_at = ?
        WHERE id = ?
        """,
        (now_iso, session_id),
    )
    # Update active version record preview path
    await db.execute(
        """
        UPDATE editorial_versions
        SET preview_path = ?, commit_sha = ?
        WHERE session_id = ? AND version_num = (SELECT current_version FROM editorial_sessions WHERE id = ?)
        """,
        (str(out_preview), commit_sha, session_id, session_id),
    )
    await db.commit()

    return {
        "success": True,
        "session_id": session_id,
        "preview_path": str(out_preview),
        "elapsed_s": res.get("elapsed_s", 0),
    }


@router.post("/sessions/{session_id}/render-final")
async def trigger_final_render(
    session_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Render full resolution 1080x1920 video, normalize audio EBU R128, and run strict QA."""
    ws_dir = get_workspace_dir(session_id)
    if not ws_dir.exists():
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Acquire semaphore to guarantee serial rendering
    async with RENDER_SEMAPHORE:
        now_iso = datetime.now(UTC).isoformat()
        await db.execute(
            "UPDATE editorial_sessions SET status = 'RENDERING_FINAL', updated_at = ? WHERE id = ?",
            (now_iso, session_id),
        )
        await db.commit()

        # Step 1: Security Scan
        sec = audit_workspace_security(ws_dir)
        if not sec["passed"]:
            await db.execute(
                "UPDATE editorial_sessions SET status = 'FAILED', failed_stage = 'SECURITY', error_message = ? WHERE id = ?",
                (str(sec["errors"]), session_id),
            )
            await db.commit()
            raise HTTPException(status_code=400, detail=f"Security check failed: {sec['errors']}")

        # Step 2: Remotion Raw Render
        raw_final = ws_dir / "raw_final.mp4"
        res = await worker_client.render_final(
            workspace_dir=ws_dir,
            output_path=raw_final,
            concurrency=2,
        )
        if not res.get("success"):
            err_msg = res.get("error", "Remotion render error")
            await db.execute(
                "UPDATE editorial_sessions SET status = 'FAILED', failed_stage = 'RENDERING_FINAL', error_message = ? WHERE id = ?",
                (err_msg, session_id),
            )
            await db.commit()
            raise HTTPException(status_code=500, detail=f"Render final failed: {err_msg}")

        # Step 3: Audio Normalization (EBU R128 Loudnorm -c:v copy)
        await db.execute(
            "UPDATE editorial_sessions SET status = 'AUDIO_NORMALIZING', updated_at = ? WHERE id = ?",
            (datetime.now(UTC).isoformat(), session_id),
        )
        await db.commit()

        final_out = ws_dir / "final_editorial.mp4"
        norm_ok = normalize_editorial_audio(
            input_video=raw_final,
            output_video=final_out,
            target_i=-16.0,
            target_tp=-1.5,
            target_lra=11.0,
        )
        if not norm_ok:
            await db.execute(
                "UPDATE editorial_sessions SET status = 'FAILED', failed_stage = 'AUDIO_NORMALIZING', error_message = 'FFmpeg loudnorm failed' WHERE id = ?",
                (session_id,),
            )
            await db.commit()
            raise HTTPException(status_code=500, detail="Audio normalization failed")

        # Step 4: Strict QA
        await db.execute(
            "UPDATE editorial_sessions SET status = 'QA', updated_at = ? WHERE id = ?",
            (datetime.now(UTC).isoformat(), session_id),
        )
        await db.commit()

        qa_res = run_editorial_final_qa(final_out)
        if not qa_res["passed"]:
            err_str = "; ".join(qa_res.get("errors", ["QA validation failed"]))
            await db.execute(
                "UPDATE editorial_sessions SET status = 'FAILED', failed_stage = 'QA', error_message = ? WHERE id = ?",
                (err_str, session_id),
            )
            await db.commit()
            raise HTTPException(status_code=500, detail=f"QA check failed: {err_str}")

        # Step 5: Mark DONE and commit version
        commit_sha = commit_workspace_version(ws_dir, summary="Final editorial render completed")
        finish_iso = datetime.now(UTC).isoformat()
        await db.execute(
            """
            UPDATE editorial_sessions
            SET status = 'DONE', error_message = NULL, failed_stage = NULL, updated_at = ?
            WHERE id = ?
            """,
            (finish_iso, session_id),
        )
        await db.execute(
            """
            UPDATE editorial_versions
            SET final_path = ?, qa_json = ?, commit_sha = ?
            WHERE session_id = ? AND version_num = (SELECT current_version FROM editorial_sessions WHERE id = ?)
            """,
            (str(final_out), json.dumps(qa_res), commit_sha, session_id, session_id),
        )
        await db.commit()

        return {
            "success": True,
            "session_id": session_id,
            "final_path": str(final_out),
            "qa": qa_res,
        }


@router.get("/sessions/{session_id}/preview.mp4")
async def stream_preview_video(session_id: str) -> FileResponse:
    """Stream low-res preview MP4 for web player."""
    ws_dir = get_workspace_dir(session_id)
    preview_file = ws_dir / "preview.mp4"
    if not preview_file.exists():
        raise HTTPException(status_code=404, detail="Preview video not found")
    return FileResponse(preview_file, media_type="video/mp4")


@router.get("/sessions/{session_id}/status", response_model=EditorialStatusResponse)
async def get_editorial_status(
    session_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> EditorialStatusResponse:
    """Retrieve lightweight status of an editorial session for UI polling."""
    async with db.execute(
        """
        SELECT id, status, current_version, error_message, failed_stage
        FROM editorial_sessions
        WHERE id = ?
        """,
        (session_id,),
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Sesi editorial tidak ditemukan")

    status = row[1]
    is_rendering = status in ("RENDERING_FINAL", "AUDIO_NORMALIZING", "QA", "AGENT_WORKING")

    return EditorialStatusResponse(
        session_id=row[0],
        status=status,
        current_version=row[2],
        error_message=row[3],
        failed_stage=row[4],
        is_rendering=is_rendering,
    )


ALLOWED_ASSET_EXTS = {
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
    ".mp3": "audio",
    ".wav": "audio",
    ".m4a": "audio",
    ".aac": "audio",
    ".mp4": "video",
    ".webm": "video",
    ".mov": "video",
}
MAX_ASSET_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


def probe_asset_metadata(file_path: Path) -> dict[str, Any]:
    """Run ffprobe on uploaded asset to extract technical properties."""
    import subprocess
    cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(file_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return {"valid": False, "error": "Berkas media rusak atau format tidak didukung"}

    try:
        data = json.loads(proc.stdout)
        duration_s = float(data.get("format", {}).get("duration", 0.0))
        streams = data.get("streams", [])
        v_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
        a_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
        width = int(v_stream.get("width", 0)) if v_stream else None
        height = int(v_stream.get("height", 0)) if v_stream else None
        return {
            "valid": True,
            "duration_s": duration_s,
            "width": width,
            "height": height,
            "has_audio": a_stream is not None,
            "has_video": v_stream is not None,
        }
    except Exception as exc:
        return {"valid": False, "error": str(exc)}


async def reload_and_sync_manifest_assets(session_id: str, ws_dir: Path, db: aiosqlite.Connection) -> None:
    """Fetch all active assets from DB and write to context/manifest.json."""
    async with db.execute(
        """
        SELECT id, type, path, label, hint, duration_s, bpm, meta_json
        FROM editorial_assets
        WHERE session_id = ?
        ORDER BY created_at ASC
        """,
        (session_id,),
    ) as cur:
        rows = await cur.fetchall()

    manifest_path = ws_dir / "context" / "manifest.json"
    if manifest_path.exists():
        try:
            m_data = json.loads(manifest_path.read_text(encoding="utf-8"))
            asset_items = []
            for r in rows:
                meta = json.loads(r[7]) if r[7] else {}
                desc = meta.get("description", "")
                asset_items.append({
                    "id": r[0],
                    "type": r[1],
                    "path": r[2],
                    "label": r[3] or "",
                    "hint": r[4] or "",
                    "description": desc,
                    "duration": float(r[5] or 0.0),
                    "bpm": float(r[6]) if r[6] is not None else None,
                })
            m_data["assets"] = asset_items
            manifest_path.write_text(json.dumps(m_data, indent=2), encoding="utf-8")
        except Exception:
            pass


@router.get("/sessions/{session_id}/assets", response_model=list[EditorialAssetResponse])
async def list_editorial_assets(
    session_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> list[EditorialAssetResponse]:
    """List all assets uploaded to this editorial session."""
    async with db.execute(
        """
        SELECT id, session_id, filename, type, path, label, hint, duration_s, bpm, created_at
        FROM editorial_assets
        WHERE session_id = ?
        ORDER BY created_at ASC
        """,
        (session_id,),
    ) as cur:
        rows = await cur.fetchall()

    return [
        EditorialAssetResponse(
            id=r[0],
            session_id=r[1],
            filename=r[2],
            type=r[3],
            path=r[4],
            label=r[5],
            hint=r[6],
            duration_s=r[7] or 0.0,
            bpm=r[8],
            created_at=r[9],
        )
        for r in rows
    ]


@router.post("/sessions/{session_id}/assets", response_model=EditorialAssetResponse, status_code=201)
async def upload_editorial_asset(
    session_id: str,
    file: UploadFile = File(...),
    label: str = Form(""),
    hint: str = Form(""),
    db: aiosqlite.Connection = Depends(get_db),
) -> EditorialAssetResponse:
    """Upload photo/audio/video asset with validation, sanitization, and metadata indexing."""
    ws_dir = get_workspace_dir(session_id)
    if not ws_dir.exists():
        raise HTTPException(status_code=404, detail="Sesi atau direktori workspace tidak ditemukan")

    raw_filename = file.filename or "uploaded_asset"
    ext = Path(raw_filename).suffix.lower()
    if ext not in ALLOWED_ASSET_EXTS:
        allowed_list = ", ".join(ALLOWED_ASSET_EXTS.keys())
        raise HTTPException(
            status_code=400,
            detail=f"Format berkas '{ext}' tidak didukung. Format yang diizinkan: {allowed_list}",
        )

    asset_type = ALLOWED_ASSET_EXTS[ext]
    asset_id = f"ast_{uuid.uuid4().hex[:8]}"
    # RULES §7.7: Always sanitize to asset_{id}.{ext} to prevent directory traversal & shell injection
    sanitized_filename = f"asset_{asset_id}{ext}"
    assets_dir = ws_dir / "public" / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    target_path = assets_dir / sanitized_filename

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_ASSET_SIZE_BYTES:
        max_mb = MAX_ASSET_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"Ukuran berkas melebihi batas maksimum {max_mb} MB (terbaca {len(content) / (1024*1024):.1f} MB)",
        )

    target_path.write_bytes(content)

    # Validate with ffprobe (RULES §7.8)
    probe = probe_asset_metadata(target_path)
    if not probe["valid"]:
        target_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=probe.get("error", "Validasi media gagal"))

    # Run asset indexer (NumPy / SciPy / FFmpeg)
    index_res = index_asset(target_path, asset_type)
    bpm = index_res.get("bpm")
    duration_s = index_res.get("duration", probe.get("duration_s", 0.0))
    probe.update(index_res)
    meta_json = json.dumps(probe)
    clean_label = label.strip() or Path(raw_filename).stem
    rel_manifest_path = f"public/assets/{sanitized_filename}"
    now_iso = datetime.now(UTC).isoformat()

    await db.execute(
        """
        INSERT INTO editorial_assets (
            id, session_id, filename, type, path, label, hint, duration_s, bpm, meta_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            asset_id,
            session_id,
            raw_filename,
            asset_type,
            rel_manifest_path,
            clean_label,
            hint.strip(),
            duration_s,
            bpm,
            meta_json,
            now_iso,
        ),
    )
    await db.commit()

    # Sync manifest.json
    await reload_and_sync_manifest_assets(session_id, ws_dir, db)

    return EditorialAssetResponse(
        id=asset_id,
        session_id=session_id,
        filename=raw_filename,
        type=asset_type,
        path=rel_manifest_path,
        label=clean_label,
        hint=hint.strip(),
        duration_s=duration_s,
        bpm=bpm,
        created_at=now_iso,
    )


@router.patch("/sessions/{session_id}/assets/{asset_id}", response_model=EditorialAssetResponse)
async def update_editorial_asset(
    session_id: str,
    asset_id: str,
    payload: EditorialAssetUpdate,
    db: aiosqlite.Connection = Depends(get_db),
) -> EditorialAssetResponse:
    """Update label or hint for an asset."""
    ws_dir = get_workspace_dir(session_id)
    async with db.execute(
        "SELECT id, session_id, filename, type, path, label, hint, duration_s, bpm, created_at FROM editorial_assets WHERE id = ? AND session_id = ?",
        (asset_id, session_id),
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Aset tidak ditemukan")

    new_label = payload.label.strip() if payload.label is not None else row[5]
    new_hint = payload.hint.strip() if payload.hint is not None else row[6]

    await db.execute(
        "UPDATE editorial_assets SET label = ?, hint = ? WHERE id = ?",
        (new_label, new_hint, asset_id),
    )
    await db.commit()

    await reload_and_sync_manifest_assets(session_id, ws_dir, db)

    return EditorialAssetResponse(
        id=row[0],
        session_id=row[1],
        filename=row[2],
        type=row[3],
        path=row[4],
        label=new_label,
        hint=new_hint,
        duration_s=row[7] or 0.0,
        bpm=row[8],
        created_at=row[9],
    )


@router.delete("/sessions/{session_id}/assets/{asset_id}")
async def delete_editorial_asset(
    session_id: str,
    asset_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Delete asset from workspace filesystem and database."""
    ws_dir = get_workspace_dir(session_id)
    async with db.execute(
        "SELECT path FROM editorial_assets WHERE id = ? AND session_id = ?",
        (asset_id, session_id),
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Aset tidak ditemukan")
        asset_rel_path = row[0]

    # Delete physical file
    phys_file = ws_dir / asset_rel_path
    phys_file.unlink(missing_ok=True)

    await db.execute("DELETE FROM editorial_assets WHERE id = ?", (asset_id,))
    await db.commit()

    await reload_and_sync_manifest_assets(session_id, ws_dir, db)

    return {"success": True, "asset_id": asset_id}


@router.get("/sessions/{session_id}/assets/{asset_id}/file")
async def get_editorial_asset_file(
    session_id: str,
    asset_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> FileResponse:
    """Serve asset media file for browser preview or audio player."""
    ws_dir = get_workspace_dir(session_id)
    async with db.execute(
        "SELECT path, type FROM editorial_assets WHERE id = ? AND session_id = ?",
        (asset_id, session_id),
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Aset tidak ditemukan")
        rel_path = row[0]

    target_file = ws_dir / rel_path
    if not target_file.exists():
        raise HTTPException(status_code=404, detail="Berkas aset tidak ditemukan di disk")
    return FileResponse(target_file)


@router.post("/sessions/{session_id}/versions/{version_num}/restore")
async def restore_editorial_version(
    session_id: str,
    version_num: int,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Restore workspace git state to target version and generate fresh preview."""
    ws_dir = get_workspace_dir(session_id)
    if not ws_dir.exists():
        raise HTTPException(status_code=404, detail="Workspace tidak ditemukan")

    async with db.execute(
        "SELECT commit_sha, summary FROM editorial_versions WHERE session_id = ? AND version_num = ?",
        (session_id, version_num),
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Versi {version_num} tidak ditemukan")
        commit_sha, summary = row[0], row[1]

    # Restore workspace to git commit SHA
    restore_workspace_version(ws_dir, commit_sha)

    # Re-render preview for this version
    out_preview = ws_dir / "preview.mp4"
    res = await worker_client.render_preview(
        workspace_dir=ws_dir,
        output_path=out_preview,
        concurrency=2,
    )
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=f"Render preview untuk versi {version_num} gagal: {res.get('error')}")

    now_iso = datetime.now(UTC).isoformat()
    await db.execute(
        """
        UPDATE editorial_sessions
        SET current_version = ?, status = 'PREVIEW_READY', updated_at = ?
        WHERE id = ?
        """,
        (version_num, now_iso, session_id),
    )
    await db.commit()

    return {
        "success": True,
        "session_id": session_id,
        "restored_version": version_num,
        "commit_sha": commit_sha,
        "preview_path": str(out_preview),
    }


@router.get("/sessions/{session_id}/messages", response_model=list[EditorialMessageResponse])
async def list_editorial_messages(
    session_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> list[EditorialMessageResponse]:
    """Retrieve chat message history for an editorial session."""
    async with db.execute(
        """
        SELECT id, session_id, sender, text, mode, meta_json, created_at
        FROM editorial_messages
        WHERE session_id = ?
        ORDER BY created_at ASC
        """,
        (session_id,),
    ) as cur:
        rows = await cur.fetchall()

    return [
        EditorialMessageResponse(
            id=r[0],
            session_id=r[1],
            sender=r[2],
            text=r[3],
            mode=r[4],
            metadata=json.loads(r[5]) if r[5] else None,
            created_at=r[6],
        )
        for r in rows
    ]


@router.post("/sessions/{session_id}/messages", response_model=EditorialMessageResponse, status_code=201)
async def send_editorial_message(
    session_id: str,
    payload: EditorialMessageCreate,
    db: aiosqlite.Connection = Depends(get_db),
) -> EditorialMessageResponse:
    """Send a user message in editorial studio. P3 stub echoes response."""
    now_iso = datetime.now(UTC).isoformat()
    msg_id = f"msg_{uuid.uuid4().hex[:8]}"

    meta = {"timestamps": payload.timestamps} if payload.timestamps else {}

    # 1. Record user message
    await db.execute(
        """
        INSERT INTO editorial_messages (id, session_id, sender, text, mode, meta_json, created_at)
        VALUES (?, ?, 'user', ?, ?, ?, ?)
        """,
        (msg_id, session_id, payload.text, payload.mode, json.dumps(meta), now_iso),
    )

    # 2. Record agent stub echo response (P3 requirement: stub echo)
    agent_msg_id = f"msg_{uuid.uuid4().hex[:8]}"
    reply_text = f"Pesan diterima: \"{payload.text}\". (Mode Editorial Studio P3 aktif dengan komposisi manual. AI Autopilot tool-loop akan aktif di P4)."
    await db.execute(
        """
        INSERT INTO editorial_messages (id, session_id, sender, text, mode, meta_json, created_at)
        VALUES (?, ?, 'agent', ?, ?, '{}', ?)
        """,
        (agent_msg_id, session_id, reply_text, payload.mode, now_iso),
    )
    await db.commit()

    return EditorialMessageResponse(
        id=agent_msg_id,
        session_id=session_id,
        sender="agent",
        text=reply_text,
        mode=payload.mode,
        metadata={},
        created_at=now_iso,
    )


@router.post("/sessions/{session_id}/autopilot")
async def run_editorial_autopilot(
    session_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Execute Autopilot AI tool-loop: compiles manifest, synthesizes Remotion TSX, typechecks, renders still & preview."""
    ws_dir = get_workspace_dir(session_id)
    if not ws_dir.exists():
        raise HTTPException(status_code=404, detail="Workspace direktori tidak ditemukan")

    # Set status to AGENT_WORKING
    now_iso = datetime.now(UTC).isoformat()
    await db.execute(
        "UPDATE editorial_sessions SET status = 'AGENT_WORKING', updated_at = ? WHERE id = ?",
        (now_iso, session_id),
    )
    await db.commit()

    # Run agent loop
    result = await run_autopilot_agent(workspace_dir=ws_dir, session_id=session_id)

    if not result.get("success"):
        err = result.get("error", "Autopilot gagal dijalankan")
        stage = result.get("stage", "AGENT_WORKING")
        await db.execute(
            """
            UPDATE editorial_sessions
            SET status = 'FAILED', failed_stage = ?, error_message = ?, updated_at = ?
            WHERE id = ?
            """,
            (stage, err, datetime.now(UTC).isoformat(), session_id),
        )
        # Record failure message
        msg_id = f"msg_{uuid.uuid4().hex[:8]}"
        await db.execute(
            """
            INSERT INTO editorial_messages (id, session_id, sender, text, mode, meta_json, created_at)
            VALUES (?, ?, 'agent', ?, 'autopilot', '{}', ?)
            """,
            (msg_id, session_id, f"⚠️ Autopilot gagal pada tahap {stage}: {err}", datetime.now(UTC).isoformat()),
        )
        await db.commit()
        raise HTTPException(status_code=500, detail=err)

    # Success: record new version and update session
    commit_sha = result["commit_sha"]
    async with db.execute(
        "SELECT MAX(version_num) FROM editorial_versions WHERE session_id = ?",
        (session_id,),
    ) as cur:
        row = await cur.fetchone()
        next_ver = (row[0] or 1) + 1

    ver_id = f"ver_{commit_sha[:8]}"
    summary = f"v{next_ver}: Autopilot gaming_hype composition ({result['duration_s']}s)"
    now_done = datetime.now(UTC).isoformat()

    await db.execute(
        """
        INSERT INTO editorial_versions (id, session_id, version_num, commit_sha, summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (ver_id, session_id, next_ver, commit_sha, summary, now_done),
    )
    await db.execute(
        """
        UPDATE editorial_sessions
        SET status = 'PREVIEW_READY', current_version = ?, updated_at = ?
        WHERE id = ?
        """,
        (next_ver, now_done, session_id),
    )

    # Record agent summary chat message
    msg_id = f"msg_{uuid.uuid4().hex[:8]}"
    chat_summary = f"✨ Autopilot selesai ({result['duration_s']}s)! Komposisi v{next_ver} siap ditinjau dengan subtitle kinetic, efek punch zoom pada puncak sinyal, dan hook intro callout."
    await db.execute(
        """
        INSERT INTO editorial_messages (id, session_id, sender, text, mode, meta_json, created_at)
        VALUES (?, ?, 'agent', ?, 'autopilot', ?, ?)
        """,
        (msg_id, session_id, chat_summary, json.dumps(result), now_done),
    )
    await db.commit()

    return {
        "success": True,
        "session_id": session_id,
        "version": next_ver,
        "commit_sha": commit_sha,
        "duration_s": result["duration_s"],
        "message": chat_summary,
    }


@router.get("/sessions/{session_id}/code")
async def get_editorial_code(session_id: str) -> dict[str, Any]:
    """Retrieve current Composition.tsx source code for 'Lihat kode' drawer."""
    ws_dir = get_workspace_dir(session_id)
    comp_file = ws_dir / "src" / "Composition.tsx"
    if not comp_file.exists():
        raise HTTPException(status_code=404, detail="Composition.tsx tidak ditemukan")
    return {
        "session_id": session_id,
        "path": "src/Composition.tsx",
        "code": comp_file.read_text(encoding="utf-8"),
    }


@router.post("/sessions/{session_id}/code")
async def update_editorial_code(
    session_id: str,
    payload: dict[str, str],
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Manually update Composition.tsx code from drawer with leak-guard and typecheck."""
    ws_dir = get_workspace_dir(session_id)
    code = payload.get("code", "")
    if not code.strip():
        raise HTTPException(status_code=400, detail="Kode tidak boleh kosong")

    # Leak guard check
    errors = scan_code_string(code, "src/Composition.tsx")
    if errors:
        raise HTTPException(status_code=400, detail=f"Leak guard violation: {errors}")

    comp_file = ws_dir / "src" / "Composition.tsx"
    comp_file.write_text(code, encoding="utf-8")

    # Typecheck
    tc = await worker_client.typecheck(ws_dir)
    if not tc.get("success"):
        raise HTTPException(status_code=400, detail=f"Typecheck gagal: {tc.get('errors')}")

    # Re-render preview
    prev = await worker_client.render_preview(ws_dir, ws_dir / "preview.mp4", concurrency=2)
    if not prev.get("success"):
        raise HTTPException(status_code=500, detail=f"Render preview gagal: {prev.get('error')}")

    # Commit version
    sha = commit_workspace_version(ws_dir, "manual edit via code drawer")
    async with db.execute(
        "SELECT MAX(version_num) FROM editorial_versions WHERE session_id = ?",
        (session_id,),
    ) as cur:
        row = await cur.fetchone()
        next_ver = (row[0] or 1) + 1

    now_iso = datetime.now(UTC).isoformat()
    await db.execute(
        "INSERT INTO editorial_versions (id, session_id, version_num, commit_sha, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (f"ver_{sha[:8]}", session_id, next_ver, sha, f"v{next_ver}: Manual code edit", now_iso),
    )
    await db.execute(
        "UPDATE editorial_sessions SET current_version = ?, status = 'PREVIEW_READY', updated_at = ? WHERE id = ?",
        (next_ver, now_iso, session_id),
    )
    await db.commit()

    return {"success": True, "version": next_ver, "commit_sha": sha}

