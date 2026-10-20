"""Unit tests for Editorial Manifest Builder."""

from pathlib import Path
import pytest

from clipforge.db.connection import get_db_connection
from clipforge.db.migrator import run_migrations
from clipforge.editorial.manifest import build_editorial_manifest


@pytest.fixture(autouse=True)
async def setup_test_db(tmp_path: Path):
    test_db = tmp_path / "test.db"
    async with get_db_connection(test_db) as db:
        await run_migrations(db)
    yield test_db


@pytest.mark.asyncio
async def test_manifest_builder_clip_relative_timing(setup_test_db: Path):
    test_db = setup_test_db
    job_id = "job-manifest-test"
    clip_id = "clip-manifest-test"
    cand_id = "cand-manifest-test"

    async with get_db_connection(test_db) as db:
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
            VALUES (?, ?, 1, 20.0, 35.0, 25.0, 0.95, 0.95, 'gameplay_highlight', 'Clutch 1v3', 'Gila!', 'High action', '{}', '[]', 'rendered')
            """,
            (cand_id, job_id),
        )
        await db.execute(
            """
            INSERT INTO clips (id, candidate_id, job_id, status, video_path, thumb_path, srt_path, width, height, duration_s, render_params_json, qa_json, created_at)
            VALUES (?, ?, ?, 'done', '/path/to/video.mp4', NULL, NULL, 1080, 1920, 15.0, '{}', '{}', '2026-10-20T00:00:00Z')
            """,
            (clip_id, cand_id, job_id),
        )
        track_id = "trk-01"
        await db.execute(
            """
            INSERT INTO subtitle_tracks (id, clip_id, revision, source, language, style_json, created_at)
            VALUES (?, ?, 1, 'asr', 'id', '{}', '2026-10-20T00:00:00Z')
            """,
            (track_id, clip_id),
        )
        # In subtitle_words table, words are stored clip-relative (start_s=1.0, end_s=2.5)
        await db.execute(
            """
            INSERT INTO subtitle_words (track_id, idx, start_s, end_s, text, confidence)
            VALUES (?, 0, 1.0, 2.5, 'Headshot', 0.98), (?, 1, 3.0, 4.0, 'Rata!', 0.99)
            """,
            (track_id, track_id),
        )
        await db.commit()

        manifest = await build_editorial_manifest(db=db, clip_id=clip_id, style_pack="gaming_hype")

        assert manifest.manifest_version == 1
        assert manifest.clip.id == clip_id
        assert manifest.clip.duration == 15.0
        assert manifest.clip.fps == 30
        assert manifest.clip.width == 1080
        assert manifest.clip.height == 1920

        words = manifest.transcript["words"]
        assert len(words) == 2
        assert words[0]["w"] == "Headshot"
        assert words[0]["start"] == 1.0
        assert words[0]["end"] == 2.5
        assert words[1]["w"] == "Rata!"

        # Verify VAD silences
        silences = manifest.signals.vad_silences
        assert len(silences) >= 2  # initial gap (0 to 1.0) and tail gap (4.0 to 15.0)
        assert silences[0].start == 0.0
        assert silences[0].end == 1.0
        assert silences[-1].end == 15.0

        # Verify Scout metadata
        assert manifest.scout.category == "gameplay_highlight"
        assert manifest.scout.title == "Clutch 1v3"
        assert manifest.scout.hook == "Gila!"
