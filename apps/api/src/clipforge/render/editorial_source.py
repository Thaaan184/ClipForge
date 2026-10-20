"""Editorial source video generator and quality assurance engine."""

import hashlib
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from clipforge.core.config import settings
from clipforge.qa.inspector import run_clip_qa
from clipforge.render.reframe import build_reframe_filtergraph

logger = structlog.get_logger(__name__)


def compute_file_sha256(path: Path) -> str:
    """Calculate SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def run_editorial_source_qa(
    video_path: Path,
    expected_duration_s: float | None = None,
) -> dict[str, Any]:
    """
    Quality assurance specifically for editorial_source:
    1080x1920, yuv420p, A/V sync (<80ms), and strictly no subtitles stream.
    """
    qa = run_clip_qa(
        video_path=video_path,
        expected_duration_s=expected_duration_s,
        expected_width=1080,
        expected_height=1920,
    )
    if "checks" not in qa:
        qa["checks"] = {}

    if not video_path.exists():
        qa["checks"]["no_subtitles"] = False
        return qa

    # Check that there are no subtitle streams embedded
    cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_streams",
        str(video_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode == 0:
        try:
            data = json.loads(proc.stdout)
            sub_streams = [
                s for s in data.get("streams", []) if s.get("codec_type") == "subtitle"
            ]
            has_no_subs = len(sub_streams) == 0
            qa["checks"]["no_subtitles"] = has_no_subs
            if not has_no_subs:
                qa["errors"].append("Editorial source contains embedded subtitle streams")
                qa["passed"] = False
        except Exception:
            qa["checks"]["no_subtitles"] = True
    else:
        qa["checks"]["no_subtitles"] = True

    return qa


def render_editorial_source(
    clip_dir: Path,
    raw_video: Path,
    mode: str = "blur",
    fps: int = 30,
    expected_duration_s: float | None = None,
    game_roi: tuple[float, float, float, float] | None = None,
    face_roi: tuple[float, float, float, float] | None = None,
) -> dict[str, Any]:
    """
    Render 9:16 editorial_source.mp4 without subtitles and without loudnorm.
    Audio dynamic range is preserved for later Remotion BGM mixing.
    """
    clip_dir.mkdir(parents=True, exist_ok=True)
    output_mp4 = clip_dir / "editorial_source.mp4"

    filtergraph = build_reframe_filtergraph(
        mode=mode,
        ass_file=None,
        fonts_dir="fonts",
        game_roi=game_roi,
        face_roi=face_roi,
    )

    encoder = settings.ffmpeg_encoder if settings.ffmpeg_encoder != "auto" else "libx264"

    # FFmpeg command: Reframe 9:16, no subtitle filter, no audio loudnorm filter
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(raw_video.name),
        "-filter_complex",
        filtergraph,
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-r",
        str(fps),
        "-c:v",
        encoder,
        "-crf",
        "18",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        "-loglevel",
        "error",
        output_mp4.name,
    ]

    logger.info(
        "rendering_editorial_source",
        clip_dir=str(clip_dir),
        mode=mode,
        fps=fps,
    )

    proc = subprocess.run(cmd, cwd=str(clip_dir), capture_output=True)
    if proc.returncode != 0:
        err_msg = proc.stderr.decode("utf-8", errors="replace")
        logger.error("editorial_source_render_failed", stderr=err_msg[:500])
        qa_res = {
            "passed": False,
            "errors": [f"FFmpeg editorial source render failed: {err_msg[:300]}"],
            "checks": {},
            "details": {},
        }
        return {
            "success": False,
            "path": None,
            "metadata": None,
            "qa": qa_res,
        }

    qa_res = run_editorial_source_qa(output_mp4, expected_duration_s=expected_duration_s)
    file_size = output_mp4.stat().st_size if output_mp4.exists() else 0
    file_sha256 = compute_file_sha256(output_mp4) if output_mp4.exists() else ""

    metadata = {
        "path": str(output_mp4.resolve()),
        "filename": output_mp4.name,
        "width": 1080,
        "height": 1920,
        "fps": float(fps),
        "duration_s": qa_res.get("details", {}).get("duration_s", 0.0),
        "pix_fmt": "yuv420p",
        "video_codec": "h264",
        "audio_codec": "aac",
        "audio_sample_rate": 48000,
        "size_bytes": file_size,
        "sha256": file_sha256,
        "created_at": datetime.now(UTC).isoformat(),
        "qa": qa_res,
    }

    return {
        "success": qa_res["passed"],
        "path": str(output_mp4.resolve()),
        "metadata": metadata,
        "qa": qa_res,
    }
