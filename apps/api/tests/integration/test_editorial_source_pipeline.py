"""Integration tests for Editorial Source pipeline and REST endpoints."""

import json
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest

from clipforge.api.app import app
from clipforge.core.config import settings
from clipforge.db.connection import get_db_connection
from clipforge.db.migrator import run_migrations


@pytest.fixture(autouse=True)
async def setup_test_db(tmp_path: Path):
    test_db = tmp_path / "test.db"
    settings.db_path = test_db
    settings.data_dir = tmp_path
    async with get_db_connection(test_db) as db:
        await run_migrations(db)
    yield


@pytest.mark.asyncio
async def test_editorial_source_endpoints_and_db_persistence(tmp_path: Path):
    job_id = "job-p1-test"
    clip_id = "clip-p1-001"
    cand_id = "cand-p1-001"

    clip_dir = tmp_path / "jobs" / job_id / "clips" / clip_id
    clip_dir.mkdir(parents=True, exist_ok=True)

    dummy_raw = clip_dir / "raw.mp4"
    dummy_raw.write_bytes(b"dummy raw video content")

    dummy_ed_source = clip_dir / "editorial_source.mp4"
    dummy_ed_source.write_bytes(b"dummy clean cut 9:16 video without subtitles")

    async with get_db_connection() as db:
        await db.execute(
            """
            INSERT INTO jobs (id, source_url, genre, language, params_json, status, progress, created_at, updated_at)
            VALUES (?, 'https://youtube.com/watch?v=sample', 'gaming', 'id', '{"subtitle_style": "none"}', 'done', 1.0, '2026-10-20T00:00:00Z', '2026-10-20T00:00:00Z')
            """,
            (job_id,),
        )
        await db.execute(
            """
            INSERT INTO candidates (id, job_id, rank, start_s, end_s, peak_s, signal_score, final_score, category, title, hook_text, reason, evidence_json, flags_json, status)
            VALUES (?, ?, 1, 0.0, 10.0, 5.0, 0.95, 0.95, 'gameplay_highlight', 'Clutch Moment', 'Bantai!', 'High action', '{}', '[]', 'rendered')
            """,
            (cand_id, job_id),
        )
        await db.execute(
            """
            INSERT INTO clips (id, candidate_id, job_id, status, video_path, thumb_path, srt_path, width, height, duration_s, render_params_json, qa_json, created_at)
            VALUES (?, ?, ?, 'done', ?, NULL, NULL, 1080, 1920, 10.0, '{"reframe_mode": "blur"}', '{"passed": true}', '2026-10-20T00:00:00Z')
            """,
            (clip_id, cand_id, job_id, str(clip_dir / "final.mp4")),
        )
        await db.commit()

    mock_meta = {
        "path": str(dummy_ed_source),
        "filename": "editorial_source.mp4",
        "width": 1080,
        "height": 1920,
        "fps": 30.0,
        "duration_s": 10.0,
        "pix_fmt": "yuv420p",
        "video_codec": "h264",
        "audio_codec": "aac",
        "audio_sample_rate": 48000,
        "size_bytes": 1048576,
        "sha256": "mocksha256editorial00000000000000000000000000000000000000000000000",
        "created_at": "2026-10-20T06:00:00Z",
        "qa": {
            "passed": True,
            "checks": {
                "video_stream": True,
                "audio_stream": True,
                "dimensions_1080x1920": True,
                "pix_fmt_yuv420p": True,
                "duration_tolerance": True,
                "av_sync": True,
                "no_subtitles": True,
            },
            "errors": [],
        },
    }

    mock_render_result = {
        "success": True,
        "path": str(dummy_ed_source),
        "metadata": mock_meta,
        "qa": mock_meta["qa"],
    }

    with patch(
        "clipforge.api.routes.clips.render_editorial_source",
        return_value=mock_render_result,
    ):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            # 1. Trigger editorial source rendering
            res_post = await client.post(
                f"/api/clips/{clip_id}/editorial-source",
                json={"reframe_mode": "blur"},
            )
            assert res_post.status_code == 200
            post_data = res_post.json()
            assert post_data["status"] == "ready"
            assert post_data["editorial_source_path"] == str(dummy_ed_source)
            assert post_data["metadata"]["width"] == 1080
            assert post_data["metadata"]["height"] == 1920
            assert post_data["metadata"]["fps"] == 30.0

            # 2. Verify clip metadata from GET /api/clips/{id} contains editorial source fields
            res_clip = await client.get(f"/api/clips/{clip_id}")
            assert res_clip.status_code == 200
            clip_data = res_clip.json()
            assert clip_data["editorial_source_path"] == str(dummy_ed_source)
            assert clip_data["editorial_source_meta"]["fps"] == 30.0
            assert clip_data["editorial_source_meta"]["qa"]["passed"] is True

            # 3. GET /api/clips/{id}/editorial-source/meta
            res_meta = await client.get(f"/api/clips/{clip_id}/editorial-source/meta")
            assert res_meta.status_code == 200
            meta_data = res_meta.json()
            assert meta_data["filename"] == "editorial_source.mp4"
            assert meta_data["qa"]["checks"]["no_subtitles"] is True

            # 4. GET /api/clips/{id}/editorial-source streams the MP4
            res_stream = await client.get(f"/api/clips/{clip_id}/editorial-source")
            assert res_stream.status_code == 200
            assert res_stream.headers["content-type"] == "video/mp4"
            assert b"dummy clean cut 9:16 video without subtitles" in res_stream.content

            # 5. Check finished_clips sync table in DB
            async with get_db_connection() as db:
                async with db.execute(
                    "SELECT editorial_source_path, editorial_source_meta_json FROM finished_clips WHERE clip_id = ?",
                    (clip_id,),
                ) as cur:
                    row = await cur.fetchone()
                    assert row is not None
                    assert row[0] is not None
                    assert "editorial_source.mp4" in row[0]
                    persisted_meta = json.loads(row[1])
                    assert persisted_meta["width"] == 1080
                    assert persisted_meta["qa"]["checks"]["no_subtitles"] is True
