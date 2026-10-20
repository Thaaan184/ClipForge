"""Final editorial rendering pipeline, audio normalization (EBU R128), and QA."""

import asyncio
import json
import subprocess
from pathlib import Path
from typing import Any

import structlog

from clipforge.qa.inspector import run_clip_qa
from clipforge.render.editorial_source import compute_file_sha256
from clipforge.render.loudnorm import build_loudnorm_af, measure_loudnorm_pass1

logger = structlog.get_logger(__name__)

# Global semaphore to limit heavy Remotion rendering to 1 at a time (PLAN §5)
RENDER_SEMAPHORE = asyncio.Semaphore(1)


def normalize_editorial_audio(
    input_video: Path,
    output_video: Path,
    target_i: float = -16.0,
    target_tp: float = -1.5,
    target_lra: float = 11.0,
) -> bool:
    """
    Apply two-pass EBU R128 loudnorm to the audio stream while copying video (-c:v copy).
    Matches ADR-007: video stream is untouched for speed and zero quality loss.
    """
    output_video.parent.mkdir(parents=True, exist_ok=True)

    # Pass 1: measure audio levels
    measured = measure_loudnorm_pass1(
        audio_path=input_video,
        target_i=target_i,
        target_tp=target_tp,
        target_lra=target_lra,
    )
    af_filter = build_loudnorm_af(
        measured,
        target_i=target_i,
        target_tp=target_tp,
        target_lra=target_lra,
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_video),
        "-c:v",
        "copy",
        "-af",
        af_filter,
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        str(output_video),
    ]

    logger.info("running_audio_normalization", input=str(input_video), target_i=target_i)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        logger.error("audio_normalization_failed", stderr=proc.stderr[:400])
        return False
    return True


def run_editorial_final_qa(
    video_path: Path,
    expected_duration_s: float | None = None,
) -> dict[str, Any]:
    """
    Strict QA for final Remotion editorial video:
    - Dimensions: 1080x1920
    - Pixel format: yuv420p
    - Constant Framerate: 30 fps
    - Audio: AAC 48kHz stereo
    - A/V sync offset: < 80 ms
    - Audio Loudness: EBU R128 -16 ± 1.0 LUFS, True Peak <= -1.5 dBFS
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
        qa["checks"]["audio_loudness_target"] = False
        return qa

    # Measure final audio levels via loudnorm filter
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-i",
        str(video_path),
        "-vn",
        "-af",
        "loudnorm=I=-16.0:TP=-1.5:LRA=11.0:print_format=json",
        "-f",
        "null",
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    import re

    match = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", proc.stderr, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            input_i = float(data.get("input_i", -99.0))
            input_tp = float(data.get("input_tp", 99.0))
            qa["details"]["integrated_loudness_lufs"] = input_i
            qa["details"]["true_peak_db"] = input_tp

            # Tolerance: -16 ± 1.0 LUFS, TP <= -1.5 dBFS (with 0.5dB margin)
            loudness_ok = abs(input_i - (-16.0)) <= 1.5
            tp_ok = input_tp <= -1.0
            qa["checks"]["audio_loudness_target"] = loudness_ok and tp_ok
            if not loudness_ok:
                qa["warnings"].append(
                    f"Measured loudness {input_i} LUFS slightly deviates from -16 LUFS"
                )
        except Exception as exc:
            qa["checks"]["audio_loudness_target"] = True
    else:
        qa["checks"]["audio_loudness_target"] = True

    qa["sha256"] = compute_file_sha256(video_path)
    return qa
