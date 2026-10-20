"""Integration tests for Editorial Studio API and session lifecycle."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from clipforge.api.app import app
from clipforge.core.config import settings
from clipforge.db.connection import get_db_connection
from clipforge.db.migrator import run_migrations


@pytest.fixture(autouse=True)
async def setup_test_env(tmp_path: Path):
    test_db = tmp_path / "test.db"
    settings.db_path = test_db
    settings.data_dir = tmp_path
    async with get_db_connection(test_db) as db:
        await run_migrations(db)
    yield


@pytest.mark.asyncio
async def test_editorial_session_lifecycle_e2e(tmp_path: Path):
    job_id = "job-ed-test"
    clip_id = "clip-ed-test"
    cand_id = "cand-ed-test"

    clip_dir = tmp_path / "jobs" / job_id / "clips" / clip_id
    clip_dir.mkdir(parents=True, exist_ok=True)
    ed_video = clip_dir / "editorial_source.mp4"
    ed_video.write_bytes(b"dummy clean cut video data")

    async with get_db_connection() as db:
        await db.execute(
            """
            INSERT INTO jobs (id, source_url, genre, language, params_json, status, progress, created_at, updated_at)
            VALUES (?, 'https://youtube.com/watch?v=sample', 'gaming', 'id', '{}', 'done', 1.0, '2026-10-20T00:00:00Z', '2026-10-20T00:00:00Z')
            """,
            (job_id,),
        )
        await db.execute(
            """
            INSERT INTO candidates (id, job_id, rank, start_s, end_s, peak_s, signal_score, final_score, category, title, hook_text, reason, evidence_json, flags_json, status)
            VALUES (?, ?, 1, 10.0, 20.0, 15.0, 0.9, 0.9, 'gameplay_highlight', 'Clutch Play', 'Gila!', 'Action', '{}', '[]', 'rendered')
            """,
            (cand_id, job_id),
        )
        await db.execute(
            """
            INSERT INTO clips (id, candidate_id, job_id, status, video_path, thumb_path, srt_path, width, height, duration_s, editorial_source_path, render_params_json, qa_json, created_at)
            VALUES (?, ?, ?, 'done', ?, NULL, NULL, 1080, 1920, 10.0, ?, '{}', '{}', '2026-10-20T00:00:00Z')
            """,
            (clip_id, cand_id, job_id, str(ed_video), str(ed_video)),
        )
        track_id = "trk-ed"
        await db.execute(
            """
            INSERT INTO subtitle_tracks (id, clip_id, revision, source, language, style_json, created_at)
            VALUES (?, ?, 1, 'asr', 'id', '{}', '2026-10-20T00:00:00Z')
            """,
            (track_id, clip_id),
        )
        await db.execute(
            """
            INSERT INTO subtitle_words (track_id, idx, start_s, end_s, text, confidence)
            VALUES (?, 0, 1.0, 2.0, 'Bantai', 0.95), (?, 1, 2.5, 4.0, 'Habis', 0.95)
            """,
            (track_id, track_id),
        )
        await db.commit()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # 1. Create Editorial Session
        res_create = await client.post(
            "/api/editorial/sessions",
            json={"clip_id": clip_id, "style_pack": "gaming_hype"},
        )
        assert res_create.status_code == 201
        session_data = res_create.json()
        session_id = session_data["id"]
        assert session_data["status"] == "EDITORIAL_DRAFT"
        assert session_data["clip_id"] == clip_id

        # Verify workspace files created
        ws_dir = Path(session_data["workspace_dir"])
        assert ws_dir.exists()
        assert (ws_dir / "src/Composition.tsx").exists()
        assert (ws_dir / "kit/KineticCaptions.tsx").exists()
        assert (ws_dir / "context/manifest.json").exists()
        assert (ws_dir / "public/clip_source.mp4").exists()

        # 2. Get Editorial Session
        res_get = await client.get(f"/api/editorial/sessions/{session_id}")
        assert res_get.status_code == 200
        assert res_get.json()["id"] == session_id

        # 3. List Versions
        res_v = await client.get(f"/api/editorial/sessions/{session_id}/versions")
        assert res_v.status_code == 200
        versions = res_v.json()
        assert len(versions) == 1
        assert versions[0]["version_num"] == 1

        # 4. Trigger Preview Render (mocking worker)
        mock_preview_res = {"success": True, "output_path": str(ws_dir / "preview.mp4"), "elapsed_s": 4.5}
        mock_typecheck_res = {"success": True, "errors": []}

        with (
            patch("clipforge.api.routes.editorial.worker_client.typecheck", new_callable=AsyncMock) as m_tc,
            patch("clipforge.api.routes.editorial.worker_client.render_preview", new_callable=AsyncMock) as m_prev,
        ):
            m_tc.return_value = mock_typecheck_res
            m_prev.return_value = mock_preview_res

            res_prev = await client.post(f"/api/editorial/sessions/{session_id}/preview")
            assert res_prev.status_code == 200
            assert res_prev.json()["success"] is True

            # Verify session status is updated to PREVIEW_READY
            res_sess = await client.get(f"/api/editorial/sessions/{session_id}")
            assert res_sess.json()["status"] == "PREVIEW_READY"

        # 5. Trigger Final Render (mocking worker render, audio normalization, QA)
        mock_final_raw = ws_dir / "raw_final.mp4"
        mock_final_raw.write_bytes(b"dummy raw render")

        mock_render_res = {"success": True, "output_path": str(mock_final_raw), "elapsed_s": 15.0}
        mock_qa_res = {
            "passed": True,
            "errors": [],
            "warnings": [],
            "checks": {
                "video_stream": True,
                "audio_stream": True,
                "dimensions_1080x1920": True,
                "pix_fmt_yuv420p": True,
                "audio_loudness_target": True,
            },
            "details": {
                "integrated_loudness_lufs": -16.0,
                "true_peak_db": -1.5,
            },
            "sha256": "dummyfinalsha256",
        }

        with (
            patch("clipforge.api.routes.editorial.worker_client.render_final", new_callable=AsyncMock) as m_rnd,
            patch("clipforge.api.routes.editorial.normalize_editorial_audio", return_value=True),
            patch("clipforge.api.routes.editorial.run_editorial_final_qa", return_value=mock_qa_res),
        ):
            m_rnd.return_value = mock_render_res

            res_fin = await client.post(f"/api/editorial/sessions/{session_id}/render-final")
            assert res_fin.status_code == 200
            assert res_fin.json()["success"] is True

            # Verify session status is DONE
            res_sess = await client.get(f"/api/editorial/sessions/{session_id}")
            assert res_sess.json()["status"] == "DONE"
