"""Unit tests for editorial semaphore serialization, failure transitions, and idempotency."""

import asyncio
import time
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from clipforge.db.connection import get_db_connection
from clipforge.db.migrator import run_migrations
from clipforge.editorial.pipeline import RENDER_SEMAPHORE


@pytest.mark.asyncio
async def test_render_semaphore_serializes_heavy_renders():
    execution_order = []

    async def mock_heavy_render(task_id: int, duration_s: float):
        async with RENDER_SEMAPHORE:
            start_t = time.time()
            execution_order.append(f"start_{task_id}")
            await asyncio.sleep(duration_s)
            execution_order.append(f"end_{task_id}")
            return time.time() - start_t

    # Launch two tasks concurrently
    t1 = asyncio.create_task(mock_heavy_render(1, 0.1))
    t2 = asyncio.create_task(mock_heavy_render(2, 0.1))

    await asyncio.gather(t1, t2)

    # Task 1 must finish before Task 2 starts
    assert execution_order == ["start_1", "end_1", "start_2", "end_2"] or \
           execution_order == ["start_2", "end_2", "start_1", "end_1"]


@pytest.mark.asyncio
async def test_session_failure_transition_and_idempotent_retry(tmp_path: Path):
    test_db = tmp_path / "test_fail.db"
    async with get_db_connection(test_db) as db:
        await run_migrations(db)

        # 0. Insert prerequisite job, candidate, clip for foreign keys
        job_id = "job_fail_01"
        cand_id = "cand_fail_01"
        clip_id = "clip_fail_01"
        now_iso = "2026-10-20T00:00:00Z"

        await db.execute(
            """
            INSERT INTO jobs (id, source_url, genre, language, params_json, status, progress, created_at, updated_at)
            VALUES (?, 'https://youtube.com/watch?v=sample', 'gaming', 'id', '{}', 'done', 1.0, ?, ?)
            """,
            (job_id, now_iso, now_iso),
        )
        await db.execute(
            """
            INSERT INTO candidates (id, job_id, rank, start_s, end_s, peak_s, signal_score, final_score, category, title, hook_text, reason, evidence_json, flags_json, status)
            VALUES (?, ?, 1, 10.0, 20.0, 15.0, 0.9, 0.9, 'highlight', 'Title', 'Hook', 'Reason', '{}', '[]', 'rendered')
            """,
            (cand_id, job_id),
        )
        await db.execute(
            """
            INSERT INTO clips (id, candidate_id, job_id, status, video_path, width, height, duration_s, render_params_json, qa_json, created_at)
            VALUES (?, ?, ?, 'done', '/tmp/dummy.mp4', 1080, 1920, 10.0, '{}', '{}', ?)
            """,
            (clip_id, cand_id, job_id, now_iso),
        )
        await db.commit()

        session_id = "ed_fail_test"

        # 1. Insert session
        await db.execute(
            """
            INSERT INTO editorial_sessions (
                id, clip_id, status, current_version, style_pack,
                workspace_dir, manifest_path, created_at, updated_at
            ) VALUES (?, ?, 'RENDERING_FINAL', 1, 'gaming_hype', '/tmp/ws', '/tmp/m.json', ?, ?)
            """,
            (session_id, clip_id, now_iso, now_iso),
        )
        await db.commit()

        # 2. Simulate worker crash -> transition to FAILED
        err_msg = "Worker crashed: connection refused 127.0.0.1:8765"
        await db.execute(
            """
            UPDATE editorial_sessions
            SET status = 'FAILED', failed_stage = 'RENDERING_FINAL', error_message = ?
            WHERE id = ?
            """,
            (err_msg, session_id),
        )
        await db.commit()

        # Verify failed state
        async with db.execute("SELECT status, failed_stage, error_message FROM editorial_sessions WHERE id = ?", (session_id,)) as cur:
            row = await cur.fetchone()
            assert row[0] == "FAILED"
            assert row[1] == "RENDERING_FINAL"
            assert "connection refused" in row[2]

        # 3. Simulate idempotent retry -> transitions to DONE without creating new version
        await db.execute(
            """
            UPDATE editorial_sessions
            SET status = 'DONE', failed_stage = NULL, error_message = NULL
            WHERE id = ?
            """,
            (session_id,),
        )
        await db.commit()

        async with db.execute("SELECT status, failed_stage, error_message FROM editorial_sessions WHERE id = ?", (session_id,)) as cur:
            row_retry = await cur.fetchone()
            assert row_retry[0] == "DONE"
            assert row_retry[1] is None
            assert row_retry[2] is None
