"""Pydantic data models for Editorial Studio v3 (manifest, sessions, assets, and worker)."""

from typing import Any, Literal
from pydantic import BaseModel, Field


# ==========================================
# 1. Manifest Models (manifest.json)
# ==========================================


class ManifestClip(BaseModel):
    id: str
    source_job_id: str
    duration: float
    fps: int = 30
    width: int = 1080
    height: int = 1920
    source_file: str = "public/clip_source.mp4"


class ManifestWord(BaseModel):
    w: str
    start: float
    end: float
    conf: float = 1.0


class ManifestPeak(BaseModel):
    t: float
    score: float
    kinds: list[str] = Field(default_factory=list)


class ManifestSilence(BaseModel):
    start: float
    end: float


class ManifestSignals(BaseModel):
    peaks: list[ManifestPeak] = Field(default_factory=list)
    vad_silences: list[ManifestSilence] = Field(default_factory=list)


class ManifestScout(BaseModel):
    category: str = "gameplay_highlight"
    title: str = ""
    hook: str = ""
    reason: str = ""
    confidence: float = 1.0


class ManifestAsset(BaseModel):
    id: str
    type: Literal["image", "audio", "video"]
    path: str
    label: str = ""
    hint: str = ""
    description: str = ""
    duration: float = 0.0
    bpm: float | None = None


class ManifestScript(BaseModel):
    mode: Literal["none", "strict", "guide"] = "none"
    text: str = ""


class ManifestSafeZone(BaseModel):
    top: float = 0.12
    bottom: float = 0.20
    left: float = 0.06
    right: float = 0.12


class EditorialManifest(BaseModel):
    manifest_version: int = 1
    clip: ManifestClip
    transcript: dict[str, Any]  # {"language": "id", "words": list[ManifestWord]}
    signals: ManifestSignals
    scout: ManifestScout
    assets: list[ManifestAsset] = Field(default_factory=list)
    style_pack: str = "gaming_hype"
    script: ManifestScript = Field(default_factory=ManifestScript)
    safe_zone: ManifestSafeZone = Field(default_factory=ManifestSafeZone)


# ==========================================
# 2. Session & Workspace API Models
# ==========================================


class EditorialSessionCreate(BaseModel):
    clip_id: str
    style_pack: str = "gaming_hype"


class EditorialSessionResponse(BaseModel):
    id: str
    clip_id: str
    status: str
    current_version: int
    style_pack: str
    workspace_dir: str
    manifest_path: str
    error_message: str | None = None
    failed_stage: str | None = None
    created_at: str
    updated_at: str


class EditorialVersionResponse(BaseModel):
    id: str
    session_id: str
    version_num: int
    commit_sha: str
    summary: str
    preview_path: str | None = None
    final_path: str | None = None
    qa_json: dict[str, Any] | None = None
    created_at: str


class EditorialAssetResponse(BaseModel):
    id: str
    session_id: str
    filename: str
    type: str
    path: str
    label: str
    hint: str
    duration_s: float
    bpm: float | None = None
    created_at: str


class EditorialAssetUpdate(BaseModel):
    label: str | None = None
    hint: str | None = None


class EditorialMessageCreate(BaseModel):
    text: str
    mode: str = "chat"
    timestamps: list[str] = Field(default_factory=list)


class EditorialStatusResponse(BaseModel):
    session_id: str
    status: str
    current_version: int
    error_message: str | None = None
    failed_stage: str | None = None
    is_rendering: bool = False
    progress_percent: float | None = None
    rendered_frames: int | None = None
    total_frames: int | None = None


class EditorialMessageResponse(BaseModel):
    id: str
    session_id: str
    sender: str
    text: str
    mode: str
    metadata: dict[str, Any] | None = None
    created_at: str
