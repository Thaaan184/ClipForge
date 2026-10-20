"""Unit tests for ClipForge v3 P5 Chat-Edit Patch Engine."""

import pytest
from clipforge.editorial.chat_patcher import (
    parse_timestamp_from_text,
    patch_composition_code,
)

SAMPLE_TSX = """
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { KineticCaptions } from "./kit/KineticCaptions";
import { ScreenShake } from "./kit/ScreenShake";
import { PunchZoom } from "./kit/PunchZoom";
import { DuckedMusic } from "./kit/DuckedMusic";

export const Composition: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <ScreenShake intensity={18}>
        <PunchZoom zoom={1.18}>
          <KineticCaptions fontSize={36} color="#FFFFFF" highlightColor="#FFDD00" />
        </PunchZoom>
      </ScreenShake>
      <DuckedMusic src="audio/bgm.mp3" baseVolume={0.35} duckedVolume={0.10} />
    </AbsoluteFill>
  );
};
"""


def test_parse_timestamp_from_text():
    assert parse_timestamp_from_text("tolong edit di [00:04.2]") == 4.2
    assert parse_timestamp_from_text("hapus b-roll di 00:20") == 20.0
    assert parse_timestamp_from_text("zoom di 01:15") == 75.0
    assert parse_timestamp_from_text("tanpa timestamp") is None


def test_apply_instruction_caption_larger():
    patched, summary = patch_composition_code(SAMPLE_TSX, "caption lebih besar dong")
    assert "fontSize={46}" in patched
    assert "Ukuran caption diperbesar" in summary


def test_apply_instruction_more_clean():
    patched, summary = patch_composition_code(SAMPLE_TSX, "buat lebih clean dan minimalis")
    assert "intensity={0}" in patched
    assert "zoom={1.08}" in patched
    assert "Gaya disetel lebih clean" in summary


def test_apply_instruction_more_hype():
    patched, summary = patch_composition_code(SAMPLE_TSX, "bikin lebih rame dan heboh")
    assert "intensity={26}" in patched
    assert "zoom={1.28}" in patched


def test_apply_instruction_zoom_frequent():
    patched, summary = patch_composition_code(SAMPLE_TSX, "zoom lebih sering saat action")
    assert "zoom={1.24}" in patched


def test_apply_instruction_change_music():
    patched, summary = patch_composition_code(SAMPLE_TSX, "ganti musik latar yang baru")
    assert "baseVolume={0.30}" in patched
    assert "Musik latar diganti" in summary


def test_apply_instruction_timestamp_scoped():
    patched, summary = patch_composition_code(SAMPLE_TSX, "tambah stiker di detik [00:05.0]")
    assert "105" in patched or "195" in patched  # frame check 3.5s - 6.5s (105-195 frame)
    assert "Efek lokal" in summary
