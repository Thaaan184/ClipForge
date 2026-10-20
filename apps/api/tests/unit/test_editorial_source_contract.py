"""Unit tests for Editorial Source generator and QA gate contract."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from clipforge.render.editorial_source import (
    compute_file_sha256,
    render_editorial_source,
    run_editorial_source_qa,
)


def test_qa_rejects_missing_file(tmp_path: Path):
    missing = tmp_path / "non_existent.mp4"
    res = run_editorial_source_qa(missing)
    assert not res["passed"]
    assert any("does not exist" in err for err in res["errors"])


def test_qa_passes_compliant_probe(tmp_path: Path):
    video = tmp_path / "valid_editorial.mp4"
    video.write_bytes(b"dummy video bytes for test")

    mock_probe = {
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1080,
                "height": 1920,
                "pix_fmt": "yuv420p",
                "r_frame_rate": "30/1",
                "avg_frame_rate": "30/1",
                "nb_frames": "300",
                "duration": "10.000",
                "start_time": "0.000",
            },
            {
                "codec_type": "audio",
                "codec_name": "aac",
                "sample_rate": "48000",
                "channels": 2,
                "duration": "10.000",
                "start_time": "0.005",
            },
        ],
        "format": {
            "duration": "10.000",
            "size": "1024000",
            "bit_rate": "800000",
        },
    }

    with patch("subprocess.run") as m_run:
        m_proc = MagicMock()
        m_proc.returncode = 0
        m_proc.stdout = json.dumps(mock_probe)
        m_run.return_value = m_proc

        res = run_editorial_source_qa(video, expected_duration_s=10.0)
        assert res["passed"] is True, f"QA failed unexpectedly: {res['errors']}"
        assert res["checks"]["video_stream"] is True
        assert res["checks"]["audio_stream"] is True
        assert res["checks"]["dimensions_1080x1920"] is True
        assert res["checks"]["pix_fmt_yuv420p"] is True
        assert res["checks"]["no_subtitles"] is True


def test_qa_fails_on_resolution_or_fps_mismatch(tmp_path: Path):
    video = tmp_path / "bad_editorial.mp4"
    video.write_bytes(b"dummy")

    mock_probe = {
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 720,  # Invalid
                "height": 1280,  # Invalid
                "r_frame_rate": "60/1",  # Invalid
                "pix_fmt": "yuv420p",
                "start_time": "0.000",
            },
            {
                "codec_type": "audio",
                "codec_name": "aac",
                "sample_rate": "48000",
                "start_time": "0.000",
            },
        ],
        "format": {"duration": "10.0"},
    }

    with patch("subprocess.run") as m_run:
        m_proc = MagicMock()
        m_proc.returncode = 0
        m_proc.stdout = json.dumps(mock_probe)
        m_run.return_value = m_proc

        res = run_editorial_source_qa(video)
        assert res["passed"] is False
        assert any("1080x1920" in e for e in res["errors"])


def test_qa_fails_when_subtitle_stream_embedded(tmp_path: Path):
    video = tmp_path / "subbed_editorial.mp4"
    video.write_bytes(b"dummy")

    mock_probe = {
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1080,
                "height": 1920,
                "pix_fmt": "yuv420p",
                "r_frame_rate": "30/1",
                "start_time": "0.000",
            },
            {
                "codec_type": "audio",
                "codec_name": "aac",
                "sample_rate": "48000",
                "start_time": "0.000",
            },
            {
                "codec_type": "subtitle",
                "codec_name": "mov_text",
            },
        ],
        "format": {"duration": "10.0"},
    }

    with patch("subprocess.run") as m_run:
        m_proc = MagicMock()
        m_proc.returncode = 0
        m_proc.stdout = json.dumps(mock_probe)
        m_run.return_value = m_proc

        res = run_editorial_source_qa(video)
        assert res["passed"] is False
        assert res["checks"]["no_subtitles"] is False
        assert any("contains embedded subtitle" in e for e in res["errors"])


def test_render_editorial_source_command_has_no_subtitles_and_no_loudnorm(tmp_path: Path):
    clip_dir = tmp_path / "clip_01"
    clip_dir.mkdir()
    raw_video = clip_dir / "raw.mp4"
    raw_video.write_bytes(b"sample raw video")

    with (
        patch("subprocess.run") as m_run,
        patch("clipforge.render.editorial_source.run_editorial_source_qa") as m_qa,
    ):
        m_proc = MagicMock()
        m_proc.returncode = 0
        m_run.return_value = m_proc

        m_qa.return_value = {
            "passed": True,
            "errors": [],
            "warnings": [],
            "checks": {
                "video_stream": True,
                "audio_stream": True,
                "dimensions_1080x1920": True,
                "pix_fmt_yuv420p": True,
                "duration_tolerance": True,
                "av_sync": True,
                "no_subtitles": True,
            },
            "details": {
                "duration_s": 5.0,
            },
        }

        res = render_editorial_source(
            clip_dir=clip_dir,
            raw_video=raw_video,
            mode="blur",
            expected_duration_s=5.0,
        )

        assert res["success"] is True
        assert res["path"] == str((clip_dir / "editorial_source.mp4").resolve())
        assert "metadata" in res
        assert res["metadata"]["qa"]["passed"] is True
        assert res["metadata"]["width"] == 1080
        assert res["metadata"]["height"] == 1920
        assert res["metadata"]["fps"] == 30.0

        # Inspect FFmpeg call arguments
        cmd_args = m_run.call_args[0][0]
        cmd_str = " ".join(cmd_args)
        assert "ffmpeg" in cmd_args[0]
        # Pinned 30 fps
        assert "-r 30" in cmd_str
        # Verify NO ASS/subtitles burned in
        assert "ass=" not in cmd_str
        assert "subtitles=" not in cmd_str
        # Verify ADR-007: NO loudnorm applied to editorial source
        assert "loudnorm" not in cmd_str
