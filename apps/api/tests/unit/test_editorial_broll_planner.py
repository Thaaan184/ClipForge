"""Unit tests for ClipForge v3 P5 B-roll Placement Planner."""

import pytest
from clipforge.editorial.broll_planner import (
    plan_broll_placements,
    BRollPlacement,
)


def test_broll_placement_duration_bounds():
    transcript_words = [
        {"w": "Ini", "start": 2.0, "end": 2.4},
        {"w": "gameplay", "start": 2.5, "end": 3.0},
        {"w": "ronde", "start": 3.1, "end": 3.5},
        {"w": "awal", "start": 3.6, "end": 4.0},
        {"w": "di", "start": 4.1, "end": 4.3},
        {"w": "site", "start": 4.4, "end": 4.8},
        {"w": "A", "start": 4.9, "end": 5.5},
        {"w": "Reaksi", "start": 10.0, "end": 10.4},
        {"w": "streamer", "start": 10.5, "end": 11.0},
        {"w": "muka", "start": 11.1, "end": 11.5},
        {"w": "lucu", "start": 11.6, "end": 12.0},
        {"w": "kocak", "start": 12.1, "end": 12.5},
    ]
    assets = [
        {"id": "ast_video1", "type": "video", "label": "gameplay ronde site A", "duration_s": 5.0},
        {"id": "ast_img1", "type": "image", "label": "reaksi muka lucu kocak", "duration_s": 10.0},
    ]
    peaks = [
        {"t": 11.5, "score": 0.95}  # Peak in second segment
    ]

    placements = plan_broll_placements(
        assets=assets,
        transcript_words=transcript_words,
        peaks=peaks,
        clip_duration=20.0,
        allow_cover_peaks=False,
    )

    assert len(placements) >= 1
    for p in placements:
        assert p.duration_s <= 5.0
        # If placement overlaps peak time, covers_peak should be False
        if p.start_s <= 11.5 <= p.end_s:
            assert p.covers_peak is False


def test_broll_placement_allow_peak_when_requested():
    transcript_words = [
        {"w": "Momen", "start": 5.0, "end": 5.5},
        {"w": "clutch", "start": 5.6, "end": 6.0},
        {"w": "epic", "start": 6.1, "end": 6.8},
    ]
    assets = [
        {"id": "ast_v1", "type": "video", "label": "clutch epic", "duration_s": 6.0},
    ]
    peaks = [
        {"t": 6.0, "score": 0.98}
    ]

    placements = plan_broll_placements(
        assets=assets,
        transcript_words=transcript_words,
        peaks=peaks,
        clip_duration=15.0,
        allow_cover_peaks=True,
    )
    assert len(placements) == 1
    assert placements[0].covers_peak is True
