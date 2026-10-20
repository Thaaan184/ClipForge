"""Unit tests for ClipForge v3 P6 Extended QA Engine.

Tests detection of:
1. Black screen intervals
2. Audio digital clipping / saturation
3. Safe zone violations in TSX
4. Video duration mismatch
5. Clean pass
"""

import subprocess
import pytest
from pathlib import Path

from clipforge.editorial.qa_extended import (
    detect_black_frames,
    detect_audio_clipping,
    check_safezone_compliance,
    verify_duration_match,
    run_extended_qa,
)


@pytest.fixture
def clean_video(tmp_path) -> Path:
    target = tmp_path / "clean_test.mp4"
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "smptebars=size=1080x1920:rate=30:duration=3",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        str(target)
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return target


@pytest.fixture
def black_screen_video(tmp_path) -> Path:
    target = tmp_path / "black_screen.mp4"
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "color=c=black:s=1080x1920:d=3",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        str(target)
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return target


@pytest.fixture
def clipped_audio_video(tmp_path) -> Path:
    target = tmp_path / "clipped_audio.mp4"
    # Overdrive audio to cause digital clipping
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "smptebars=size=1080x1920:rate=30:duration=3",
        "-f", "lavfi", "-i", "sine=frequency=1000:duration=3",
        "-filter_complex", "[1:a]volume=35dB[a]",
        "-map", "0:v", "-map", "[a]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        str(target)
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return target


def test_black_frame_detection(black_screen_video, clean_video):
    # Black video must be detected
    black_intervals = detect_black_frames(black_screen_video, min_duration_s=0.5)
    assert len(black_intervals) >= 1
    assert black_intervals[0]["duration"] >= 1.0

    # Clean testsrc must have no black frames
    clean_intervals = detect_black_frames(clean_video, min_duration_s=0.5)
    assert len(clean_intervals) == 0


def test_audio_clipping_detection(clipped_audio_video, clean_video):
    clip_res = detect_audio_clipping(clipped_audio_video)
    assert clip_res["has_clipping"] is True or clip_res["peak_db"] > -0.5

    clean_res = detect_audio_clipping(clean_video)
    assert clean_res["has_clipping"] is False


def test_safezone_compliance_violations():
    bad_tsx_top = """
    export const Main = () => (
      <div style={{ position: "absolute", top: 40, left: 100 }}>
        <h1>Out of Bounds Top</h1>
      </div>
    );
    """
    res_top = check_safezone_compliance(bad_tsx_top)
    assert res_top["compliant"] is False
    assert any("top" in v for v in res_top["violations"])

    bad_tsx_bottom = """
    export const Main = () => (
      <div style={{ position: "absolute", bottom: 80, left: 100 }}>
        <span>Out of Bounds Bottom</span>
      </div>
    );
    """
    res_bottom = check_safezone_compliance(bad_tsx_bottom)
    assert res_bottom["compliant"] is False
    assert any("bottom" in v for v in res_bottom["violations"])

    good_tsx = """
    export const Main = () => (
      <div style={{ position: "absolute", top: 320, bottom: 420 }}>
        <span>Inside Safe Zone</span>
      </div>
    );
    """
    res_good = check_safezone_compliance(good_tsx)
    assert res_good["compliant"] is True


def test_duration_mismatch():
    match_ok = verify_duration_match(measured_duration_s=10.02, expected_duration_s=10.0, tolerance_s=0.5)
    assert match_ok["matched"] is True

    match_fail = verify_duration_match(measured_duration_s=4.5, expected_duration_s=10.0, tolerance_s=0.5)
    assert match_fail["matched"] is False
    assert match_fail["diff_s"] == 5.5


def test_extended_qa_clean_pass(clean_video):
    good_tsx = """
    <div style={{ position: "absolute", top: 300, bottom: 400 }}>
      <KineticCaptions />
    </div>
    """
    res = run_extended_qa(clean_video, expected_duration_s=3.0, tsx_code=good_tsx)
    assert res.passed is True
    assert res.score == 1.0
    assert len(res.violations) == 0
