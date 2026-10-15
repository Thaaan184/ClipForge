import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from clipforge.core.config import settings
from clipforge.db.connection import get_db_connection
from clipforge.db.migrator import run_migrations
from clipforge.jobs.pipeline import stage_render_clips
from clipforge.render.scene.schema import (
    BackgroundConfig,
    BBox,
    CanvasConfig,
    LayerConfig,
    SceneGraph,
    ShapeConfig,
    SourceConfig,
    StyleConfig,
    SubtitlesConfig,
    TransformConfig,
)


@pytest.fixture(autouse=True)
async def setup_test_env(tmp_path: Path):
    test_db = tmp_path / "test.db"
    settings.db_path = test_db
    settings.data_dir = tmp_path
    async with get_db_connection(test_db) as db:
        await run_migrations(db)
    yield


@pytest.mark.asyncio
async def test_freeform_pipeline_mixed_batch_and_safety_skip(tmp_path: Path):
    job_id = "test-job-freeform-e2e"
    job_dir = tmp_path / "jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    # 1. Generate 3-second synthetic source video
    raw_synthetic = tmp_path / "global_raw.mp4"
    cmd_gen = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=1920x1080:rate=30:duration=3",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:duration=3",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        "-loglevel",
        "error",
        str(raw_synthetic),
    ]
    res_gen = subprocess.run(cmd_gen)
    assert res_gen.returncode == 0
    assert raw_synthetic.exists()

    now = "2026-10-15T00:00:00Z"

    # 2. Insert Job in DB
    async with get_db_connection() as db:
        await db.execute(
            """
            INSERT INTO jobs (id, source_url, genre, language, params_json, status, progress, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0.8, ?, ?)
            """,
            (
                job_id,
                "https://www.youtube.com/watch?v=synthetic123",
                "gaming",
                "id",
                json.dumps({"reframe_mode": "blur", "subtitle_style": "classic_white", "subtitle_position": "bottom"}),
                "rendering",
                now,
                now,
            ),
        )

        # Candidate 1: Mode Preset (Keep)
        await db.execute(
            """
            INSERT INTO candidates (
                id, job_id, rank, start_s, end_s, user_start_s, user_end_s, peak_s,
                signal_score, llm_score, final_score, category, title, hook_text,
                reason, evidence_json, flags_json, status, render_mode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "cand_preset_1",
                job_id,
                1,
                0.0,
                2.5,
                0.0,
                2.5,
                1.0,
                1.0,
                1.0,
                1.0,
                "highlight",
                "Preset Highlight",
                "Hook 1",
                "High surge",
                "{}",
                "[]",
                "kept",
                "preset",
            ),
        )

        # Candidate 2: Mode Freeform WITH Scene Graph (Keep)
        await db.execute(
            """
            INSERT INTO candidates (
                id, job_id, rank, start_s, end_s, user_start_s, user_end_s, peak_s,
                signal_score, llm_score, final_score, category, title, hook_text,
                reason, evidence_json, flags_json, status, render_mode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "cand_freeform_edited_2",
                job_id,
                2,
                0.0,
                2.5,
                0.0,
                2.5,
                1.0,
                1.0,
                1.0,
                1.0,
                "highlight",
                "Freeform Highlight",
                "Hook 2",
                "High surge",
                "{}",
                "[]",
                "kept",
                "freeform",
            ),
        )

        # Scene Graph for Candidate 2
        scene = SceneGraph(
            version="1.1",
            canvas=CanvasConfig(width=1080, height=1920, fps=30),
            background=BackgroundConfig(type="solid", color="#111111"),
            sources=[
                SourceConfig(
                    id="source_main",
                    width=1920,
                    height=1080,
                    fps=30,
                    start=0.0,
                    end=2.5,
                    padding_before=1.0,
                )
            ],
            layers=[
                LayerConfig(
                    id="cut_cam",
                    name="Camera Cut",
                    source_id="source_main",
                    visible=True,
                    locked=False,
                    time_offset=0.0,
                    shape=ShapeConfig(
                        type="ellipse",
                        bbox=BBox(x=100, y=100, w=400, h=400),
                    ),
                    transform=TransformConfig(
                        cx=540,
                        cy=600,
                        w=450,
                        h=450,
                        rotation=15,
                        lock_aspect=True,
                        z=0,
                    ),
                    style=StyleConfig(
                        opacity=0.95,
                        border_width=6,
                        border_color="#00FFCC",
                    ),
                ),
                LayerConfig(
                    id="cut_game",
                    name="Game Cut",
                    source_id="source_main",
                    visible=True,
                    locked=False,
                    time_offset=0.0,
                    shape=ShapeConfig(
                        type="rect",
                        bbox=BBox(x=300, y=300, w=600, h=400),
                    ),
                    transform=TransformConfig(
                        cx=540,
                        cy=1350,
                        w=700,
                        h=466,
                        rotation=-5,
                        lock_aspect=True,
                        z=1,
                    ),
                    style=StyleConfig(
                        opacity=1.0,
                        border_width=4,
                        border_color="#FF6A00",
                    ),
                ),
            ],
            subtitles=SubtitlesConfig(enabled=True, preset="classic_white", position="bottom"),
        )

        await db.execute(
            """
            INSERT INTO scene_graphs (candidate_id, job_id, scene_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                "cand_freeform_edited_2",
                job_id,
                scene.model_dump_json(),
                now,
                now,
            ),
        )

        # Candidate 3: Mode Freeform WITHOUT Scene Graph (Keep -> Should be skipped cleanly)
        await db.execute(
            """
            INSERT INTO candidates (
                id, job_id, rank, start_s, end_s, user_start_s, user_end_s, peak_s,
                signal_score, llm_score, final_score, category, title, hook_text,
                reason, evidence_json, flags_json, status, render_mode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "cand_freeform_unedited_3",
                job_id,
                3,
                0.0,
                2.5,
                0.0,
                2.5,
                1.0,
                1.0,
                1.0,
                1.0,
                "highlight",
                "Unedited Freeform",
                "Hook 3",
                "High surge",
                "{}",
                "[]",
                "kept",
                "freeform",
            ),
        )
        await db.commit()

    # Mock download_video_range and whisper transcription so test runs purely local FFmpeg
    async def mock_download_range(source_url="", start_s=0.0, end_s=0.0, out_path=None, **kwargs):
        if out_path:
            subprocess.run(["cp", str(raw_synthetic), str(out_path)], check=True)

    with patch("clipforge.jobs.pipeline.download_video_range", side_effect=mock_download_range):
        with patch("clipforge.jobs.pipeline.transcribe_clip_media", return_value=[]):
            async with get_db_connection() as db:
                await stage_render_clips(
                    db=db,
                    job_id=job_id,
                    stage_input={
                        "source_url": "https://www.youtube.com/watch?v=synthetic123",
                        "reframe_mode": "blur",
                        "subtitle_style": "classic_white",
                        "subtitle_position": "bottom",
                    },
                )

    # 3. Assertions
    async with get_db_connection() as db:
        # Check clips created in DB
        async with db.execute(
            "SELECT id, candidate_id, render_params_json, scene_json, status, video_path FROM clips WHERE job_id = ? ORDER BY id",
            (job_id,),
        ) as cur:
            clips = await cur.fetchall()

    # Candidate 1 (preset) and Candidate 2 (freeform edited) must have clips.
    # Candidate 3 (freeform unedited) must be skipped.
    assert len(clips) == 2

    # Map by candidate_id
    clip_map = {c[1]: c for c in clips}

    # Verify Candidate 1 (Preset)
    c1 = clip_map["cand_preset_1"]
    r_params_1 = json.loads(c1[2])
    assert r_params_1["reframe_mode"] == "blur"
    assert c1[4] == "done"
    vpath_1 = Path(c1[5])
    assert vpath_1.exists()

    # Verify Candidate 2 (Freeform)
    c2 = clip_map["cand_freeform_edited_2"]
    r_params_2 = json.loads(c2[2])
    assert r_params_2["reframe_mode"] == "freeform"
    assert c2[3] is not None  # scene_json preserved!
    saved_scene = json.loads(c2[3])
    assert len(saved_scene["layers"]) == 2
    assert c2[4] == "done"
    vpath_2 = Path(c2[5])
    assert vpath_2.exists()

    # Check that Candidate 3 has NO clip
    assert "cand_freeform_unedited_3" not in clip_map

    # Probe Candidate 2 output video via ffprobe
    probe_cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,pix_fmt",
        "-of",
        "json",
        str(vpath_2),
    ]
    p_res = subprocess.run(probe_cmd, capture_output=True, text=True)
    assert p_res.returncode == 0
    p_info = json.loads(p_res.stdout)["streams"][0]
    assert p_info["width"] == 1080
    assert p_info["height"] == 1920
    assert p_info["pix_fmt"] == "yuv420p"

    # Verify no temp files left behind in clip directories
    clip_dirs = list((tmp_path / "jobs" / job_id / "clips").glob("*"))
    for cd in clip_dirs:
        leftover_masks = list(cd.glob("*.png"))
        assert len(leftover_masks) == 0, f"Found leftover png in {cd}: {leftover_masks}"
        tmp_subdirs = list(cd.glob("_*"))
        assert len(tmp_subdirs) == 0, f"Found leftover temp dir in {cd}: {tmp_subdirs}"
