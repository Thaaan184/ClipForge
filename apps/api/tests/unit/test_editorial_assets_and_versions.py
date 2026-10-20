"""Unit tests for Editorial Assets, Messages, and Version Restore endpoints."""

import io
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from clipforge.api.app import app
from clipforge.core.config import settings
from clipforge.db.connection import get_db_connection
from clipforge.db.migrator import run_migrations


@pytest.fixture(autouse=True)
async def setup_test_db(tmp_path: Path):
    test_db = tmp_path / "test_assets.db"
    settings.db_path = test_db
    settings.data_dir = tmp_path
    async with get_db_connection(test_db) as db:
        await run_migrations(db)
    yield


@pytest.mark.asyncio
async def test_asset_lifecycle_upload_update_delete(tmp_path: Path):
    job_id = "job_ast_01"
    cand_id = "cand_ast_01"
    clip_id = "clip_ast_01"
    session_id = "ed_ast_session"
    now_iso = "2026-10-20T00:00:00Z"

    # Setup job, candidate, clip, and editorial session
    async with get_db_connection() as db:
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
            VALUES (?, ?, 1, 10.0, 20.0, 15.0, 0.9, 0.9, 'highlight', 'Clutch', 'Gila', 'Action', '{}', '[]', 'rendered')
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
        ws_dir = tmp_path / "workspaces" / session_id
        ws_dir.mkdir(parents=True, exist_ok=True)
        (ws_dir / "public" / "assets").mkdir(parents=True, exist_ok=True)
        (ws_dir / "context").mkdir(parents=True, exist_ok=True)
        (ws_dir / "context" / "manifest.json").write_text(
            json.dumps({"manifest_version": 1, "clip": {"id": clip_id}, "assets": []}),
            encoding="utf-8",
        )

        await db.execute(
            """
            INSERT INTO editorial_sessions (
                id, clip_id, status, current_version, style_pack, workspace_dir, manifest_path, created_at, updated_at
            ) VALUES (?, ?, 'EDITORIAL_DRAFT', 1, 'gaming_hype', ?, ?, ?, ?)
            """,
            (session_id, clip_id, str(ws_dir), str(ws_dir / "context" / "manifest.json"), now_iso, now_iso),
        )
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Mock probe_asset_metadata
        with patch("clipforge.api.routes.editorial.probe_asset_metadata") as mock_probe:
            mock_probe.return_value = {
                "valid": True,
                "duration_s": 0.0,
                "width": 1920,
                "height": 1080,
                "has_audio": False,
                "has_video": False,
            }

            # 1. Upload valid image asset with malicious filename (path traversal & shell characters)
            fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 50
            dangerous_filename = "../../evil$(rm -rf)/logo.png"

            files = {"file": (dangerous_filename, fake_png, "image/png")}
            data = {"label": "Victory Logo", "hint": "show on clutch"}

            res = await client.post(f"/api/editorial/sessions/{session_id}/assets", files=files, data=data)
            assert res.status_code == 201, res.text
            res_data = res.json()
            assert res_data["label"] == "Victory Logo"
            assert res_data["type"] == "image"
            assert ".." not in res_data["path"]
            assert res_data["path"].startswith("public/assets/asset_")
            asset_id = res_data["id"]

            # Verify saved file exists on disk
            saved_file = ws_dir / res_data["path"]
            assert saved_file.exists()

            # Verify manifest.json was updated
            m_data = json.loads((ws_dir / "context" / "manifest.json").read_text())
            assert len(m_data["assets"]) == 1
            assert m_data["assets"][0]["id"] == asset_id
            assert m_data["assets"][0]["label"] == "Victory Logo"

            # 2. List assets
            list_res = await client.get(f"/api/editorial/sessions/{session_id}/assets")
            assert list_res.status_code == 200
            assert len(list_res.json()) == 1

            # 3. Patch asset
            patch_res = await client.patch(
                f"/api/editorial/sessions/{session_id}/assets/{asset_id}",
                json={"label": "Defeat Logo", "hint": "fade out fast"},
            )
            assert patch_res.status_code == 200
            assert patch_res.json()["label"] == "Defeat Logo"
            assert patch_res.json()["hint"] == "fade out fast"

            # 4. Delete asset
            del_res = await client.delete(f"/api/editorial/sessions/{session_id}/assets/{asset_id}")
            assert del_res.status_code == 200
            assert not saved_file.exists()

            # Verify manifest updated after delete
            m_data = json.loads((ws_dir / "context" / "manifest.json").read_text())
            assert len(m_data["assets"]) == 0

        # 5. Invalid extension rejected
        bad_file = {"file": ("script.sh", b"#!/bin/bash\necho bad", "application/x-sh")}
        bad_res = await client.post(f"/api/editorial/sessions/{session_id}/assets", files=bad_file)
        assert bad_res.status_code == 400
        assert "tidak didukung" in bad_res.json()["detail"]


@pytest.mark.asyncio
async def test_editorial_messages_stub_echo(tmp_path: Path):
    job_id = "job_msg_01"
    cand_id = "cand_msg_01"
    clip_id = "clip_msg_01"
    session_id = "ed_msg_session"
    now_iso = "2026-10-20T00:00:00Z"

    async with get_db_connection() as db:
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
            VALUES (?, ?, 1, 10.0, 20.0, 15.0, 0.9, 0.9, 'highlight', 'Clutch', 'Gila', 'Action', '{}', '[]', 'rendered')
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
        await db.execute(
            """
            INSERT INTO editorial_sessions (
                id, clip_id, status, current_version, style_pack, workspace_dir, manifest_path, created_at, updated_at
            ) VALUES (?, ?, 'EDITORIAL_DRAFT', 1, 'gaming_hype', '/tmp/ws_msg', '/tmp/m.json', ?, ?)
            """,
            (session_id, clip_id, now_iso, now_iso),
        )
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Send user message
        send_res = await client.post(
            f"/api/editorial/sessions/{session_id}/messages",
            json={"text": "Tolong perbesar caption di detik [00:05.2]", "mode": "chat", "timestamps": ["00:05.2"]},
        )
        assert send_res.status_code == 201
        res_data = send_res.json()
        assert res_data["sender"] == "agent"
        assert "Pesan diterima" in res_data["text"]

        # List messages
        list_res = await client.get(f"/api/editorial/sessions/{session_id}/messages")
        assert list_res.status_code == 200
        msgs = list_res.json()
        assert len(msgs) == 2
        assert msgs[0]["sender"] == "user"
        assert msgs[0]["text"] == "Tolong perbesar caption di detik [00:05.2]"
        assert msgs[1]["sender"] == "agent"


@pytest.mark.asyncio
async def test_editorial_status_endpoint(tmp_path: Path):
    job_id = "job_st_01"
    cand_id = "cand_st_01"
    clip_id = "clip_st_01"
    session_id = "ed_st_session"
    now_iso = "2026-10-20T00:00:00Z"

    async with get_db_connection() as db:
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
            VALUES (?, ?, 1, 10.0, 20.0, 15.0, 0.9, 0.9, 'highlight', 'Clutch', 'Gila', 'Action', '{}', '[]', 'rendered')
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
        await db.execute(
            """
            INSERT INTO editorial_sessions (
                id, clip_id, status, current_version, style_pack, workspace_dir, manifest_path, created_at, updated_at
            ) VALUES (?, ?, 'PREVIEW_READY', 2, 'gaming_hype', '/tmp/ws_st', '/tmp/m.json', ?, ?)
            """,
            (session_id, clip_id, now_iso, now_iso),
        )
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(f"/api/editorial/sessions/{session_id}/status")
        assert res.status_code == 200
        data = res.json()
        assert data["session_id"] == session_id
        assert data["status"] == "PREVIEW_READY"
        assert data["current_version"] == 2
        assert data["is_rendering"] is False
