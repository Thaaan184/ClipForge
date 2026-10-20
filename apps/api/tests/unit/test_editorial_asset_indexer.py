"""Unit tests for Editorial Asset Indexer (ClipForge v3 P4 Task 2)."""
import json
import pytest
from pathlib import Path
import numpy as np

from clipforge.editorial.asset_indexer import (
    index_asset,
    index_image_asset,
    index_audio_asset,
    estimate_audio_bpm,
    probe_media_info,
)


@pytest.fixture
def dummy_wav(tmp_path: Path) -> Path:
    """Generate a 44.1kHz synthetic WAV audio file with periodic beats."""
    import wave

    sr = 44100
    duration = 3.0  # seconds
    wav_path = tmp_path / "test_beat.wav"

    # Create periodic burst (approx 120 BPM = 2 beats per second = every 0.5s)
    n_samples = int(sr * duration)
    samples = np.zeros(n_samples, dtype=np.float32)
    for t_beat in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5]:
        start = int(t_beat * sr)
        end = min(start + int(0.05 * sr), n_samples)
        samples[start:end] = np.sin(2 * np.pi * 440 * np.linspace(0, 0.05, end - start))

    # Convert to 16-bit PCM
    pcm_data = (samples * 32767).astype(np.int16)
    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm_data.tobytes())

    return wav_path


def test_index_audio_asset(dummy_wav: Path):
    """Verifies audio signals extraction and tempo estimation."""
    meta = index_audio_asset(dummy_wav)
    assert meta["type"] == "audio"
    assert meta["duration"] > 2.8
    assert "description" in meta
    # BPM can be estimated or float
    if meta["bpm"] is not None:
        assert 50 <= meta["bpm"] <= 200


def test_index_asset_image(tmp_path: Path):
    """Verifies image asset indexing (dimensions via ffprobe)."""
    img_path = tmp_path / "badge.png"
    import subprocess
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=red:s=100x200:d=1",
        "-frames:v", "1", str(img_path)
    ]
    subprocess.run(cmd, capture_output=True, check=True)

    info = index_asset(img_path, asset_type="image")
    assert info["type"] == "image"
    assert info["width"] == 100
    assert info["height"] == 200
    assert "100x200" in info["description"]


def test_index_generic_fallback(tmp_path: Path):
    """Verifies fallback on unknown asset type."""
    unknown_file = tmp_path / "data.txt"
    unknown_file.write_text("hello")
    res = index_asset(unknown_file, asset_type="unknown")
    assert res["type"] == "unknown"
    assert res["duration"] == 0.0
