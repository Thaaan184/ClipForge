"""Asset indexer for ClipForge Editorial Studio.

Indexes uploaded assets (photo, audio, video) without adding external dependencies:
- Image: Dimension probe, format detection, descriptive summary.
- Audio: Duration, RMS energy, and BPM estimation via envelope autocorrelation (NumPy/SciPy).
- Video: Duration, resolution, fps, and simple shot change detection via FFmpeg scene filter.
"""

import json
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
from scipy import signal
import structlog

logger = structlog.get_logger(__name__)


def probe_media_info(file_path: Path) -> dict[str, Any]:
    """Extract technical format and streams info via ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(file_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return {}
    try:
        return json.loads(res.stdout)
    except Exception:
        return {}


def index_image_asset(image_path: Path) -> dict[str, Any]:
    """Index image asset dimensions and visual characteristics."""
    info = probe_media_info(image_path)
    streams = info.get("streams", [])
    v_stream = next((s for s in streams if s.get("codec_type") == "video"), {})

    width = int(v_stream.get("width", 0))
    height = int(v_stream.get("height", 0))
    fmt = v_stream.get("codec_name", image_path.suffix.lstrip("."))

    description = f"Gambar {fmt.upper()} ({width}x{height})"
    return {
        "type": "image",
        "width": width,
        "height": height,
        "duration": 0.0,
        "bpm": None,
        "description": description,
    }


def estimate_audio_bpm(audio_path: Path) -> float | None:
    """Estimate audio tempo (BPM) from energy envelope autocorrelation."""
    try:
        # Extract 20 seconds of mono audio at 11025 Hz raw PCM float32
        cmd = [
            "ffmpeg",
            "-y",
            "-v", "quiet",
            "-i", str(audio_path),
            "-t", "20",
            "-ac", "1",
            "-ar", "11025",
            "-f", "f32le",
            "-"
        ]
        proc = subprocess.run(cmd, capture_output=True, check=True)
        raw_data = proc.stdout
        if len(raw_data) < 11025 * 4:
            return None

        samples = np.frombuffer(raw_data, dtype=np.float32)
        if len(samples) == 0:
            return None

        # Envelope via half-wave rectification and low-pass filter
        sr = 11025
        hop = 128
        frame_len = 256
        num_frames = (len(samples) - frame_len) // hop
        if num_frames < 100:
            return None

        # Compute short-time energy
        energy = np.zeros(num_frames, dtype=np.float32)
        for i in range(num_frames):
            frame = samples[i * hop : i * hop + frame_len]
            energy[i] = np.sum(frame ** 2)

        # First difference (onset strength)
        onset_env = np.diff(energy, prepend=energy[0])
        onset_env = np.maximum(0, onset_env)
        onset_env -= np.mean(onset_env)

        # Autocorrelation of onset envelope
        corr = signal.correlate(onset_env, onset_env, mode="full")
        corr = corr[len(corr) // 2 :]

        # Look for peaks corresponding to 60-180 BPM
        frame_rate = sr / hop
        min_lag = int(frame_rate * 60 / 180)  # 180 BPM
        max_lag = int(frame_rate * 60 / 60)   # 60 BPM

        if max_lag >= len(corr):
            max_lag = len(corr) - 1
        if min_lag >= max_lag:
            return 120.0

        window = corr[min_lag : max_lag + 1]
        peaks, _ = signal.find_peaks(window)
        if len(peaks) > 0:
            best_peak = min_lag + peaks[np.argmax(window[peaks])]
            bpm = (frame_rate * 60.0) / best_peak
            return round(float(bpm), 1)

        best_lag = min_lag + int(np.argmax(window))
        bpm = (frame_rate * 60.0) / best_lag
        return round(float(bpm), 1)
    except Exception as exc:
        logger.warning("bpm_estimation_failed", error=str(exc))
        return None


def index_audio_asset(audio_path: Path) -> dict[str, Any]:
    """Index audio asset duration, sample rate, channels, and estimated BPM."""
    info = probe_media_info(audio_path)
    fmt = info.get("format", {})
    duration = float(fmt.get("duration", 0.0))

    bpm = estimate_audio_bpm(audio_path)
    description = f"Audio durasi {duration:.1f}s" + (f", ~{bpm} BPM" if bpm else "")

    return {
        "type": "audio",
        "duration": duration,
        "bpm": bpm,
        "width": 0,
        "height": 0,
        "description": description,
    }


def detect_video_shot_changes(video_path: Path) -> list[float]:
    """Detect simple shot changes via FFmpeg scene filter."""
    try:
        cmd = [
            "ffmpeg",
            "-i", str(video_path),
            "-filter_complex", "select='gt(scene,0.3)',metadata=print:key=lavfi.scene_score:file=-",
            "-f", "null",
            "-"
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        shots = []
        for line in proc.stdout.splitlines():
            if "pts_time:" in line:
                try:
                    t = float(line.split("pts_time:")[1].split()[0])
                    shots.append(round(t, 2))
                except Exception:
                    pass
        return shots
    except Exception:
        return []


def index_video_asset(video_path: Path) -> dict[str, Any]:
    """Index video B-roll asset dimensions, duration, and cut transitions."""
    info = probe_media_info(video_path)
    fmt = info.get("format", {})
    duration = float(fmt.get("duration", 0.0))

    streams = info.get("streams", [])
    v_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
    width = int(v_stream.get("width", 0))
    height = int(v_stream.get("height", 0))

    shots = detect_video_shot_changes(video_path)
    description = f"Video B-roll {width}x{height}, durasi {duration:.1f}s ({len(shots)} transisi shot)"

    return {
        "type": "video",
        "width": width,
        "height": height,
        "duration": duration,
        "bpm": None,
        "shot_changes": shots,
        "description": description,
    }


def index_asset(file_path: Path, asset_type: str) -> dict[str, Any]:
    """Index asset based on its type."""
    if asset_type == "image":
        return index_image_asset(file_path)
    elif asset_type == "audio":
        return index_audio_asset(file_path)
    elif asset_type == "video":
        return index_video_asset(file_path)
    elif asset_type == "document":
        try:
            txt = file_path.read_text(encoding="utf-8")
        except Exception:
            try:
                txt = file_path.read_text(encoding="latin-1")
            except Exception:
                txt = ""
        lines = len(txt.splitlines())
        chars = len(txt)
        return {
            "type": "document",
            "width": 0,
            "height": 0,
            "duration": 0.0,
            "bpm": None,
            "char_count": chars,
            "line_count": lines,
            "description": f"Dokumen teks ({chars} karakter, {lines} baris)",
        }
    return {
        "type": asset_type,
        "width": 0,
        "height": 0,
        "duration": 0.0,
        "bpm": None,
        "description": f"Aset {asset_type}",
    }
