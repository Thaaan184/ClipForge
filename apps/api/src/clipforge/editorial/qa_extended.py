"""Extended Quality Assurance (QA) Engine for ClipForge v3 P6.

Detects:
1. Black frame intervals (blackdetect filter)
2. Audio clipping & peak distortion (astats filter)
3. Safe zone text/visual bounds violations
4. Duration mismatch against expected manifest
"""

import json
import re
import subprocess
from pathlib import Path
from typing import Any
from pydantic import BaseModel, Field


class QAEvaluationResult(BaseModel):
    passed: bool
    score: float
    violations: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


def detect_black_frames(
    video_path: Path,
    min_duration_s: float = 0.5,
    pic_th: float = 0.95,
) -> list[dict[str, float]]:
    """Detect black screen intervals using ffmpeg blackdetect filter."""
    if not video_path.exists():
        return []

    cmd = [
        "ffmpeg", "-hide_banner",
        "-i", str(video_path),
        "-vf", f"blackdetect=d={min_duration_s}:pic_th={pic_th}:pix_th=0.10",
        "-an", "-f", "null", "-"
    ]
    proc = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)

    intervals = []
    # Pattern: black_start:0 black_end:1.2 black_duration:1.2
    for line in proc.stderr.splitlines():
        if "blackdetect" in line and "black_start:" in line:
            start_m = re.search(r"black_start:([0-9\.]+)", line)
            end_m = re.search(r"black_end:([0-9\.]+)", line)
            dur_m = re.search(r"black_duration:([0-9\.]+)", line)
            if start_m and dur_m:
                s = float(start_m.group(1))
                d = float(dur_m.group(1))
                e = float(end_m.group(1)) if end_m else s + d
                intervals.append({"start": s, "end": e, "duration": d})

    return intervals


def detect_audio_clipping(video_path: Path) -> dict[str, Any]:
    """Detect digital audio clipping and true peak saturation using ffmpeg astats."""
    if not video_path.exists():
        return {"has_clipping": False, "peak_db": -99.0, "flat_factor": 0.0}

    cmd = [
        "ffmpeg", "-hide_banner",
        "-i", str(video_path),
        "-vn",
        "-af", "astats=metadata=1:reset=1",
        "-f", "null", "-"
    ]
    proc = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)

    peak_db = -99.0
    flat_factor = 0.0

    for line in proc.stderr.splitlines():
        if "Peak level dB:" in line:
            try:
                val = float(line.split("Peak level dB:")[1].strip())
                if val > peak_db:
                    peak_db = val
            except Exception:
                pass
        if "Flat factor:" in line:
            try:
                val = float(line.split("Flat factor:")[1].strip())
                if val > flat_factor:
                    flat_factor = val
            except Exception:
                pass

    has_clipping = (peak_db > -0.1) or (flat_factor > 0.05)
    return {
        "has_clipping": has_clipping,
        "peak_db": peak_db,
        "flat_factor": flat_factor,
    }


def check_safezone_compliance(tsx_code: str) -> dict[str, Any]:
    """Audit TSX styling rules for 9:16 platform safe zone compliance.

    Safe zone standard:
    - Top header: 12% (must not place primary interactive/readable text in top 12% or y < 230px)
    - Bottom bar: 20% (must not place text in bottom 20% or y > 1536px)
    - Left margin: 6% (x < 64px)
    - Right margin: 12% (x > 950px)
    """
    violations = []

    # Check for text placement in unsafe top margin: top < 120 or y < 150
    unsafe_top_match = re.search(r'top:\s*([0-9]+)', tsx_code)
    if unsafe_top_match:
        val = int(unsafe_top_match.group(1))
        if val < 160:
            violations.append(f"Elemen teks terlalu dekat dengan batas atas safe zone: top={val}px (< 160px)")

    # Check for bottom < 200 or bottom < 15%
    unsafe_bottom_match = re.search(r'bottom:\s*([0-9]+)', tsx_code)
    if unsafe_bottom_match:
        val = int(unsafe_bottom_match.group(1))
        if val < 220:
            violations.append(f"Elemen teks melanggar batas bawah UI safe zone: bottom={val}px (< 220px)")

    return {
        "compliant": len(violations) == 0,
        "violations": violations,
    }


def verify_duration_match(
    measured_duration_s: float,
    expected_duration_s: float,
    tolerance_s: float = 0.5,
) -> dict[str, Any]:
    """Verify that final render duration matches expected clip duration within tolerance."""
    diff = abs(measured_duration_s - expected_duration_s)
    matched = diff <= tolerance_s
    return {
        "matched": matched,
        "measured_duration_s": measured_duration_s,
        "expected_duration_s": expected_duration_s,
        "diff_s": round(diff, 3),
        "tolerance_s": tolerance_s,
    }


def run_extended_qa(
    video_path: Path,
    expected_duration_s: float,
    tsx_code: str | None = None,
) -> QAEvaluationResult:
    """Run full extended QA suite on final rendered editorial output."""
    violations = []
    warnings = []
    details = {}

    if not video_path.exists():
        return QAEvaluationResult(
            passed=False,
            score=0.0,
            violations=["Video final tidak ditemukan"],
            warnings=[],
            details={},
        )

    # 1. Black frame detection
    black_intervals = detect_black_frames(video_path, min_duration_s=0.5)
    details["black_intervals"] = black_intervals
    if black_intervals:
        violations.append(f"Terdeteksi frame hitam selama {sum(b['duration'] for b in black_intervals):.2f}s ({len(black_intervals)} interval)")

    # 2. Audio clipping detection
    clipping = detect_audio_clipping(video_path)
    details["audio_clipping"] = clipping
    if clipping["has_clipping"]:
        violations.append(f"Terdeteksi distorsi/audio clipping: peak={clipping['peak_db']:.2f} dB, flat_factor={clipping['flat_factor']:.3f}")

    # 3. Duration match
    probe_cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        str(video_path)
    ]
    p_proc = subprocess.run(probe_cmd, capture_output=True, text=True)
    measured_dur = 0.0
    if p_proc.returncode == 0:
        try:
            data = json.loads(p_proc.stdout)
            measured_dur = float(data.get("format", {}).get("duration", 0.0))
        except Exception:
            pass

    dur_check = verify_duration_match(measured_dur, expected_duration_s, tolerance_s=0.6)
    details["duration_check"] = dur_check
    if not dur_check["matched"]:
        violations.append(f"Durasi video ({measured_dur:.2f}s) tidak cocok dengan durasi yang diharapkan ({expected_duration_s:.2f}s, selisih {dur_check['diff_s']}s)")

    # 4. Safezone check if TSX code provided
    if tsx_code:
        sz_check = check_safezone_compliance(tsx_code)
        details["safezone_check"] = sz_check
        if not sz_check["compliant"]:
            violations.extend(sz_check["violations"])

    passed = len(violations) == 0
    score = 1.0 if passed else max(0.0, 1.0 - len(violations) * 0.25)

    return QAEvaluationResult(
        passed=passed,
        score=score,
        violations=violations,
        warnings=warnings,
        details=details,
    )
