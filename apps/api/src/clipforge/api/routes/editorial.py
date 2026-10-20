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
from clipforge.editorial.leak_guard import audit_workspace_security
from clipforge.editorial.manifest import build_editorial_manifest, save_manifest
from clipforge.editorial.models import (
    EditorialAssetResponse,
    EditorialSessionCreate,
    EditorialSessionResponse,
    EditorialVersionResponse,
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


@router.get("/sessions/{session_id}/final.mp4")
async def download_final_video(session_id: str) -> FileResponse:
    """Download final rendered video with EBU R128 audio."""
    ws_dir = get_workspace_dir(session_id)
    final_file = ws_dir / "final_editorial.mp4"
    if not final_file.exists():
        raise HTTPException(status_code=404, detail="Final video not found")
    return FileResponse(final_file, media_type="video/mp4", filename=f"{session_id}_final.mp4")
