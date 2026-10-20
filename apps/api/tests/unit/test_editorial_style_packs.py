"""Unit tests for ClipForge v3 P5 Style Pack Management."""

import pytest
from clipforge.editorial.style_packs import (
    list_all_style_packs,
    get_style_pack,
    save_custom_style_pack,
    StylePackDefinition,
)


def test_list_and_get_built_in_style_packs():
    packs = list_all_style_packs()
    assert len(packs) >= 3
    names = [p["name"] for p in packs]
    assert "gaming_hype" in names
    assert "minimal_clean" in names
    assert "hyper_meme" in names

    gh = get_style_pack("gaming_hype")
    assert gh["name"] == "gaming_hype"
    assert gh["shake_intensity"] > 0
    assert gh["zoom_factor"] > 1.0


def test_save_and_retrieve_custom_style_pack(tmp_path, monkeypatch):
    test_preset_dir = tmp_path / "style_packs"
    monkeypatch.setattr("clipforge.editorial.style_packs.STYLE_PACKS_DIR", test_preset_dir)

    new_pack = StylePackDefinition(
        name="esports_pro_clean",
        label="Esports Pro Clean",
        description="Clean layout for professional tournament highlights",
        shake_intensity=4,
        zoom_factor=1.05,
        ducking_volume=0.15,
        tags=["esports", "clean"],
    )

    saved = save_custom_style_pack(new_pack)
    assert saved["name"] == "esports_pro_clean"

    retrieved = get_style_pack("esports_pro_clean")
    assert retrieved["name"] == "esports_pro_clean"
    assert retrieved["label"] == "Esports Pro Clean"
    assert retrieved["shake_intensity"] == 4.0
