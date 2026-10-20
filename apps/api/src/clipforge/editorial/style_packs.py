"""Style Pack manager and persistence for ClipForge v3 P5.

Supports:
- Built-in presets ('gaming_hype', 'minimal_clean', 'hyper_meme').
- User custom style packs ('Simpan gaya ini').
- Application of style packs to new clips without manual re-configuration.
"""

import json
from pathlib import Path
from typing import Any
from pydantic import BaseModel, Field

from clipforge.core.config import settings

STYLE_PACKS_DIR = settings.data_dir / "style_packs"
STYLE_PACKS_DIR.mkdir(parents=True, exist_ok=True)


class StylePackDefinition(BaseModel):
    name: str
    label: str
    description: str
    font_size: int = 36
    caption_color: str = "#FFFFFF"
    caption_highlight: str = "#FFDD00"
    hook_bg: str = "#FFDE00"
    hook_text_color: str = "#000000"
    zoom_factor: float = 1.18
    shake_intensity: int = 18
    ducking_volume: float = 0.10
    music_base_volume: float = 0.35
    tags: list[str] = Field(default_factory=list)


BUILTIN_STYLE_PACKS: dict[str, StylePackDefinition] = {
    "gaming_hype": StylePackDefinition(
        name="gaming_hype",
        label="Gaming Hype",
        description="Punchy cartoon text, dynamic screen shake, and bold yellow captions.",
        font_size=36,
        caption_color="#FFFFFF",
        caption_highlight="#FFDD00",
        hook_bg="#FFDE00",
        hook_text_color="#000000",
        zoom_factor=1.18,
        shake_intensity=18,
        ducking_volume=0.10,
        music_base_volume=0.35,
        tags=["gaming", "high_energy", "esports"],
    ),
    "minimal_clean": StylePackDefinition(
        name="minimal_clean",
        label="Minimal Clean",
        description="Sleek white typography, subtle zoom, zero shake, and smooth audio ducking.",
        font_size=32,
        caption_color="#F8FAFC",
        caption_highlight="#38BDF8",
        hook_bg="#0F172A",
        hook_text_color="#FFFFFF",
        zoom_factor=1.06,
        shake_intensity=0,
        ducking_volume=0.15,
        music_base_volume=0.25,
        tags=["clean", "podcast", "cinematic"],
    ),
    "hyper_meme": StylePackDefinition(
        name="hyper_meme",
        label="Hyper Meme",
        description="Aggressive zoom, intense screen shakes, red callout, and rapid stickers.",
        font_size=42,
        caption_color="#FFFFFF",
        caption_highlight="#FF0055",
        hook_bg="#FF2A2A",
        hook_text_color="#FFFFFF",
        zoom_factor=1.35,
        shake_intensity=28,
        ducking_volume=0.08,
        music_base_volume=0.40,
        tags=["meme", "funny_fail", "chaos"],
    ),
}


def list_all_style_packs() -> list[dict[str, Any]]:
    """Return all available style packs (built-ins + custom)."""
    packs = [p.model_dump() for p in BUILTIN_STYLE_PACKS.values()]

    # Load custom saved packs from disk
    if STYLE_PACKS_DIR.exists():
        for file in STYLE_PACKS_DIR.glob("*.json"):
            try:
                data = json.loads(file.read_text(encoding="utf-8"))
                # Custom pack overrides or adds
                packs.append(data)
            except Exception:
                pass

    return packs


def get_style_pack(name: str) -> dict[str, Any]:
    """Retrieve style pack definition by name."""
    if name in BUILTIN_STYLE_PACKS:
        return BUILTIN_STYLE_PACKS[name].model_dump()

    custom_file = STYLE_PACKS_DIR / f"{name}.json"
    if custom_file.exists():
        try:
            return json.loads(custom_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    # Default fallback to gaming_hype
    return BUILTIN_STYLE_PACKS["gaming_hype"].model_dump()


def save_custom_style_pack(pack: StylePackDefinition) -> dict[str, Any]:
    """Save custom style pack to disk."""
    STYLE_PACKS_DIR.mkdir(parents=True, exist_ok=True)
    file_path = STYLE_PACKS_DIR / f"{pack.name}.json"
    data = pack.model_dump()
    file_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data
