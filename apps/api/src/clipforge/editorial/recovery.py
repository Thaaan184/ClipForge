"""Crash Recovery and Idempotent Retry Manager for ClipForge v3 P6.

Manages state machine failure transitions and safe recovery across all 6 core stages:
1. EDITORIAL_DRAFT
2. AGENT_WORKING
3. PREVIEW_READY
4. RENDERING_FINAL
5. AUDIO_NORMALIZING
6. QA
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiosqlite

from clipforge.editorial.workspace import get_workspace_dir
from clipforge.editorial.worker_client import worker_client
from clipforge.editorial.pipeline import normalize_editorial_audio, run_editorial_final_qa
from clipforge.editorial.qa_extended import run_extended_qa

logger = logging.getLogger(__name__)

EDITORIAL_STAGES = [
    "EDITORIAL_DRAFT",
    "AGENT_WORKING",
    "PREVIEW_READY",
    "RENDERING_FINAL",
    "AUDIO_NORMALIZING",
    "QA",
    "DONE",
    "FAILED",
]


async def record_session_failure(
    session_id: str,
    failed_stage: str,
    error_message: str,
    db: aiosqlite.Connection,
    retryable: bool = True,
) -> dict[str, Any]:
    """Transition session to FAILED state with structured failure context."""
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """
        UPDATE editorial_sessions
        SET status = 'FAILED',
            error_message = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (f"[{failed_stage}] {error_message}", now_iso, session_id),
    )
    await db.commit()
    logger.warning("Session %s failed at stage %s: %s", session_id, failed_stage, error_message)
    return {
        "session_id": session_id,
        "status": "FAILED",
        "failed_stage": failed_stage,
        "error": error_message,
        "retryable": retryable,
    }


async def recover_session(
    session_id: str,
    db: aiosqlite.Connection,
) -> dict[str, Any]:
    """Diagnose session state and perform idempotent recovery based on stage context."""
    async with db.execute(
        "SELECT id, clip_id, status, current_version, error_message FROM editorial_sessions WHERE id = ?",
        (session_id,),
    ) as cur:
        row = await cur.fetchone()

    if not row:
        return {"success": False, "error": f"Sesi {session_id} tidak ditemukan"}

    s_id, clip_id, status, cur_version, err_msg = row
    ws_dir = get_workspace_dir(session_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Determine which stage to recover or resume
    target_stage = status
    if status == "FAILED" and err_msg and "[" in err_msg and "]" in err_msg:
        target_stage = err_msg.split("[")[1].split("]")[0]

    logger.info("Recovering session %s from stage %s (current status %s)", session_id, target_stage, status)

    # 1. Recover from EDITORIAL_DRAFT
    if target_stage == "EDITORIAL_DRAFT":
        if ws_dir.exists() and (ws_dir / "src" / "Composition.tsx").exists():
            new_status = "PREVIEW_READY"
        else:
            new_status = "EDITORIAL_DRAFT"
        await db.execute(
            "UPDATE editorial_sessions SET status = ?, error_message = NULL, updated_at = ? WHERE id = ?",
            (new_status, now_iso, session_id),
        )
        await db.commit()
        return {"success": True, "recovered_status": new_status, "stage": "EDITORIAL_DRAFT"}

    # 2. Recover from AGENT_WORKING
    elif target_stage == "AGENT_WORKING":
        # Check workspace integrity
        comp_file = ws_dir / "src" / "Composition.tsx"
        if comp_file.exists():
            # Workspace is intact, ready for preview
            new_status = "PREVIEW_READY"
        else:
            new_status = "EDITORIAL_DRAFT"
        await db.execute(
            "UPDATE editorial_sessions SET status = ?, error_message = NULL, updated_at = ? WHERE id = ?",
            (new_status, now_iso, session_id),
        )
        await db.commit()
        return {"success": True, "recovered_status": new_status, "stage": "AGENT_WORKING"}

    # 3. Recover from PREVIEW_READY
    elif target_stage == "PREVIEW_READY":
        # Re-render preview video
        preview_file = ws_dir / "preview.mp4"
        try:
            await worker_client.render_preview(ws_dir, preview_file, concurrency=4)
            new_status = "PREVIEW_READY"
        except Exception as exc:
            new_status = "PREVIEW_READY"  # Still preview ready, code is intact
        await db.execute(
            "UPDATE editorial_sessions SET status = ?, error_message = NULL, updated_at = ? WHERE id = ?",
            (new_status, now_iso, session_id),
        )
        await db.commit()
        return {"success": True, "recovered_status": new_status, "stage": "PREVIEW_READY"}

    # 4. Recover from RENDERING_FINAL
    elif target_stage == "RENDERING_FINAL":
        raw_final = ws_dir / "final_raw.mp4"
        if raw_final.exists() and raw_final.stat().st_size > 10000:
            # Raw video was rendered, resume to AUDIO_NORMALIZING
            new_status = "AUDIO_NORMALIZING"
        else:
            # Need to re-trigger render_final
            try:
                await worker_client.render_final(ws_dir, raw_final, concurrency=4)
                new_status = "AUDIO_NORMALIZING"
            except Exception as exc:
                new_status = "PREVIEW_READY"  # Fallback to preview ready so user can retry

        await db.execute(
            "UPDATE editorial_sessions SET status = ?, error_message = NULL, updated_at = ? WHERE id = ?",
            (new_status, now_iso, session_id),
        )
        await db.commit()
        return {"success": True, "recovered_status": new_status, "stage": "RENDERING_FINAL"}

    # 5. Recover from AUDIO_NORMALIZING
    elif target_stage == "AUDIO_NORMALIZING":
        raw_final = ws_dir / "final_raw.mp4"
        norm_final = ws_dir / "final.mp4"
        if raw_final.exists():
            norm_ok = normalize_editorial_audio(raw_final, norm_final)
            new_status = "QA" if norm_ok else "AUDIO_NORMALIZING"
        else:
            new_status = "PREVIEW_READY"

        await db.execute(
            "UPDATE editorial_sessions SET status = ?, error_message = NULL, updated_at = ? WHERE id = ?",
            (new_status, now_iso, session_id),
        )
        await db.commit()
        return {"success": True, "recovered_status": new_status, "stage": "AUDIO_NORMALIZING"}

    # 6. Recover from QA
    elif target_stage == "QA":
        norm_final = ws_dir / "final.mp4"
        if norm_final.exists():
            # Get duration from manifest if available
            m_file = ws_dir / "context" / "manifest.json"
            expected_dur = 30.0
            if m_file.exists():
                try:
                    m_data = json.loads(m_file.read_text(encoding="utf-8"))
                    expected_dur = float(m_data.get("clip", {}).get("duration", 30.0))
                except Exception:
                    pass

            qa_res = run_editorial_final_qa(norm_final, expected_duration_s=expected_dur)
            comp_code = (ws_dir / "src" / "Composition.tsx").read_text(encoding="utf-8") if (ws_dir / "src" / "Composition.tsx").exists() else ""
            ext_qa = run_extended_qa(norm_final, expected_duration_s=expected_dur, tsx_code=comp_code)

            new_status = "DONE" if (qa_res.get("passed") and ext_qa.passed) else "QA"
        else:
            new_status = "PREVIEW_READY"

        await db.execute(
            "UPDATE editorial_sessions SET status = ?, error_message = NULL, updated_at = ? WHERE id = ?",
            (new_status, now_iso, session_id),
        )
        await db.commit()
        return {"success": True, "recovered_status": new_status, "stage": "QA"}

    # Default fallback
    await db.execute(
        "UPDATE editorial_sessions SET status = 'PREVIEW_READY', error_message = NULL, updated_at = ? WHERE id = ?",
        (now_iso, session_id),
    )
    await db.commit()
    return {"success": True, "recovered_status": "PREVIEW_READY", "stage": "FALLBACK"}
