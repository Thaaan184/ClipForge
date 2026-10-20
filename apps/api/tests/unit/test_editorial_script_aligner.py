"""Unit tests for ClipForge v3 P5 Script Aligner & Beat Sheet Generator."""

import pytest
from clipforge.editorial.script_aligner import (
    align_script_to_transcript,
    clean_token,
)


def test_clean_token():
    assert clean_token("# 1. Halo guys,") == "halo guys"
    assert clean_token("Valorant!!!") == "valorant"


def test_align_script_strict_mode():
    script_text = """
    Halo semuanya selamat datang kembali di channel gue.
    Hari ini kita bakal cobain clutch round paling gila di Valorant.
    Musuh tinggal satu di site B tapi waktu sisa lima detik.
    Gila berhasil defuse dan kita menang pertandingan!
    """

    transcript_words = [
        {"w": "Halo", "start": 0.0, "end": 0.4, "conf": 0.95},
        {"w": "semuanya", "start": 0.5, "end": 1.0, "conf": 0.96},
        {"w": "selamat", "start": 1.1, "end": 1.5, "conf": 0.94},
        {"w": "datang", "start": 1.6, "end": 2.0, "conf": 0.92},
        {"w": "kembali", "start": 2.1, "end": 2.5, "conf": 0.93},
        {"w": "di", "start": 2.6, "end": 2.8, "conf": 0.91},
        {"w": "channel", "start": 2.9, "end": 3.3, "conf": 0.95},
        {"w": "gue", "start": 3.4, "end": 3.7, "conf": 0.90},
        {"w": "Hari", "start": 4.0, "end": 4.3, "conf": 0.93},
        {"w": "ini", "start": 4.4, "end": 4.6, "conf": 0.92},
        {"w": "kita", "start": 4.7, "end": 4.9, "conf": 0.95},
        {"w": "bakal", "start": 5.0, "end": 5.3, "conf": 0.91},
        {"w": "cobain", "start": 5.4, "end": 5.8, "conf": 0.94},
        {"w": "clutch", "start": 5.9, "end": 6.3, "conf": 0.92},
        {"w": "round", "start": 6.4, "end": 6.7, "conf": 0.89},
        {"w": "paling", "start": 6.8, "end": 7.1, "conf": 0.96},
        {"w": "gila", "start": 7.2, "end": 7.5, "conf": 0.93},
        {"w": "di", "start": 7.6, "end": 7.8, "conf": 0.90},
        {"w": "Valorant", "start": 7.9, "end": 8.5, "conf": 0.97},
        {"w": "Musuh", "start": 9.0, "end": 9.4, "conf": 0.91},
        {"w": "tinggal", "start": 9.5, "end": 9.8, "conf": 0.92},
        {"w": "satu", "start": 9.9, "end": 10.2, "conf": 0.94},
        {"w": "di", "start": 10.3, "end": 10.5, "conf": 0.89},
        {"w": "site", "start": 10.6, "end": 10.9, "conf": 0.93},
        {"w": "B", "start": 11.0, "end": 11.3, "conf": 0.95},
        {"w": "tapi", "start": 11.4, "end": 11.7, "conf": 0.90},
        {"w": "waktu", "start": 11.8, "end": 12.1, "conf": 0.92},
        {"w": "sisa", "start": 12.2, "end": 12.5, "conf": 0.91},
        {"w": "lima", "start": 12.6, "end": 12.9, "conf": 0.93},
        {"w": "detik", "start": 13.0, "end": 13.5, "conf": 0.95},
        {"w": "Gila", "start": 14.0, "end": 14.4, "conf": 0.92},
        {"w": "berhasil", "start": 14.5, "end": 14.9, "conf": 0.94},
        {"w": "defuse", "start": 15.0, "end": 15.5, "conf": 0.96},
        {"w": "dan", "start": 15.6, "end": 15.8, "conf": 0.88},
        {"w": "kita", "start": 15.9, "end": 16.2, "conf": 0.91},
        {"w": "menang", "start": 16.3, "end": 16.7, "conf": 0.95},
        {"w": "pertandingan", "start": 16.8, "end": 17.5, "conf": 0.97},
    ]

    beat_sheet = align_script_to_transcript(script_text, transcript_words, mode="strict", clip_duration=20.0)

    assert beat_sheet.mode == "strict"
    assert beat_sheet.total_lines == 4
    assert beat_sheet.aligned_lines >= 3
    assert beat_sheet.alignment_rate >= 0.75
    assert len(beat_sheet.beats) == 4
    # Check timings are progressive
    for i in range(len(beat_sheet.beats) - 1):
        if beat_sheet.beats[i].aligned and beat_sheet.beats[i+1].aligned:
            assert beat_sheet.beats[i].start_s <= beat_sheet.beats[i+1].start_s


def test_align_script_unaligned_marking():
    script_text = """
    Halo semuanya selamat datang!
    Baris ini sama sekali tidak ada dalam rekaman klip video sama sekalixyz.
    """

    transcript_words = [
        {"w": "Halo", "start": 0.0, "end": 0.5, "conf": 0.95},
        {"w": "semuanya", "start": 0.6, "end": 1.2, "conf": 0.94},
        {"w": "selamat", "start": 1.3, "end": 1.8, "conf": 0.92},
        {"w": "datang", "start": 1.9, "end": 2.4, "conf": 0.96},
    ]

    beat_sheet = align_script_to_transcript(script_text, transcript_words, mode="strict", clip_duration=10.0)
    assert beat_sheet.total_lines == 2
    assert beat_sheet.aligned_lines == 1
    assert len(beat_sheet.unaligned_lines) == 1
    assert "sama sekalixyz" in beat_sheet.unaligned_lines[0]
