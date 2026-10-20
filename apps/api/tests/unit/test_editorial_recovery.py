"""Unit tests for ClipForge v3 P6 Recovery across all 6 core stages."""

import pytest
import aiosqlite
from pathlib import Path

from clipforge.editorial.recovery import (
    record_session_failure,
    recover_session,
)


@pytest.fixture
async def memory_db():
    db = await aiosqlite.connect(":memory:")
    await db.execute("""
        CREATE TABLE editorial_sessions (
            id TEXT PRIMARY KEY,
            clip_id TEXT NOT NULL,
            status TEXT NOT NULL,
            current_version INTEGER NOT NULL DEFAULT 1,
            style_pack TEXT NOT NULL DEFAULT 'gaming_hype',
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    await db.commit()
    yield db
    await db.close()


@pytest.mark.asyncio
async def test_record_failure_and_recover_draft(memory_db, tmp_path, monkeypatch):
    sess_id = "test_rec_draft"
    monkeypatch.setattr("clipforge.editorial.recovery.get_workspace_dir", lambda sid: tmp_path / sid)

    await memory_db.execute(
        "INSERT INTO editorial_sessions (id, clip_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (sess_id, "clip_1", "EDITORIAL_DRAFT", "2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z")
    )
    await memory_db.commit()

    # Fail
    fail_res = await record_session_failure(sess_id, "EDITORIAL_DRAFT", "Worker disconnected during init", memory_db)
    assert fail_res["status"] == "FAILED"
    assert fail_res["failed_stage"] == "EDITORIAL_DRAFT"

    # Recover
    rec_res = await recover_session(sess_id, memory_db)
    assert rec_res["success"] is True
    assert rec_res["recovered_status"] in ("EDITORIAL_DRAFT", "PREVIEW_READY")


@pytest.mark.asyncio
async def test_recover_agent_working(memory_db, tmp_path, monkeypatch):
    sess_id = "test_rec_agent"
    ws = tmp_path / sess_id
    (ws / "src").mkdir(parents=True, exist_ok=True)
    (ws / "src" / "Composition.tsx").write_text("// valid tsx", encoding="utf-8")
    monkeypatch.setattr("clipforge.editorial.recovery.get_workspace_dir", lambda sid: ws)

    await memory_db.execute(
        "INSERT INTO editorial_sessions (id, clip_id, status, error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (sess_id, "clip_2", "FAILED", "[AGENT_WORKING] Timeout compiling TSX", "2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z")
    )
    await memory_db.commit()

    rec_res = await recover_session(sess_id, memory_db)
    assert rec_res["success"] is True
    assert rec_res["recovered_status"] == "PREVIEW_READY"


@pytest.mark.asyncio
async def test_recover_preview_ready(memory_db, tmp_path, monkeypatch):
    sess_id = "test_rec_preview"
    ws = tmp_path / sess_id
    ws.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("clipforge.editorial.recovery.get_workspace_dir", lambda sid: ws)

    await memory_db.execute(
        "INSERT INTO editorial_sessions (id, clip_id, status, error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (sess_id, "clip_3", "FAILED", "[PREVIEW_READY] FFmpeg stream broken", "2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z")
    )
    await memory_db.commit()

    rec_res = await recover_session(sess_id, memory_db)
    assert rec_res["success"] is True
    assert rec_res["recovered_status"] == "PREVIEW_READY"


@pytest.mark.asyncio
async def test_recover_rendering_final(memory_db, tmp_path, monkeypatch):
    sess_id = "test_rec_final"
    ws = tmp_path / sess_id
    ws.mkdir(parents=True, exist_ok=True)
    raw_video = ws / "final_raw.mp4"
    raw_video.write_bytes(b"0" * 20000)  # non-empty raw render
    monkeypatch.setattr("clipforge.editorial.recovery.get_workspace_dir", lambda sid: ws)

    await memory_db.execute(
        "INSERT INTO editorial_sessions (id, clip_id, status, error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (sess_id, "clip_4", "FAILED", "[RENDERING_FINAL] Remotion crash mid-render", "2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z")
    )
    await memory_db.commit()

    rec_res = await recover_session(sess_id, memory_db)
    assert rec_res["success"] is True
    assert rec_res["recovered_status"] == "AUDIO_NORMALIZING"


@pytest.mark.asyncio
async def test_recover_audio_normalizing(memory_db, tmp_path, monkeypatch):
    sess_id = "test_rec_norm"
    ws = tmp_path / sess_id
    ws.mkdir(parents=True, exist_ok=True)
    raw_video = ws / "final_raw.mp4"
    raw_video.write_bytes(b"dummy")

    monkeypatch.setattr("clipforge.editorial.recovery.get_workspace_dir", lambda sid: ws)
    monkeypatch.setattr("clipforge.editorial.recovery.normalize_editorial_audio", lambda r, n: True)

    await memory_db.execute(
        "INSERT INTO editorial_sessions (id, clip_id, status, error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (sess_id, "clip_5", "FAILED", "[AUDIO_NORMALIZING] EBU loudnorm pass 1 failed", "2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z")
    )
    await memory_db.commit()

    rec_res = await recover_session(sess_id, memory_db)
    assert rec_res["success"] is True
    assert rec_res["recovered_status"] == "QA"


@pytest.mark.asyncio
async def test_recover_qa(memory_db, tmp_path, monkeypatch):
    sess_id = "test_rec_qa"
    ws = tmp_path / sess_id
    ws.mkdir(parents=True, exist_ok=True)
    final_video = ws / "final.mp4"
    final_video.write_bytes(b"dummy_video")

    monkeypatch.setattr("clipforge.editorial.recovery.get_workspace_dir", lambda sid: ws)
    monkeypatch.setattr("clipforge.editorial.recovery.run_editorial_final_qa", lambda v, **kwargs: {"passed": True})
    from clipforge.editorial.qa_extended import QAEvaluationResult
    monkeypatch.setattr("clipforge.editorial.recovery.run_extended_qa", lambda v, **kwargs: QAEvaluationResult(passed=True, score=1.0))

    await memory_db.execute(
        "INSERT INTO editorial_sessions (id, clip_id, status, error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (sess_id, "clip_6", "FAILED", "[QA] QA probe timeout", "2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z")
    )
    await memory_db.commit()

    rec_res = await recover_session(sess_id, memory_db)
    assert rec_res["success"] is True
    assert rec_res["recovered_status"] == "DONE"
