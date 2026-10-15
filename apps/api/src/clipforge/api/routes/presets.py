"""API routes for reusable Freeform Scene Graph Presets."""

import uuid
from datetime import UTC, datetime
from typing import Any

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from clipforge.db.connection import get_db
from clipforge.render.scene.schema import SceneGraph

router = APIRouter(prefix="/api/presets", tags=["presets"])


class CreateScenePresetRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scene: SceneGraph


class UpdateScenePresetRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    scene: SceneGraph


class ScenePresetResponse(BaseModel):
    id: str
    name: str
    scene: dict[str, Any]
    created_at: str
    updated_at: str


@router.get("/scenes", response_model=list[ScenePresetResponse])
async def list_scene_presets(
    db: aiosqlite.Connection = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all saved scene presets ordered by newest first."""
    async with db.execute(
        "SELECT id, name, scene_json, created_at, updated_at FROM scene_presets ORDER BY updated_at DESC"
    ) as cur:
        rows = await cur.fetchall()

    presets = []
    for row in rows:
        import json
        presets.append({
            "id": row[0],
            "name": row[1],
            "scene": json.loads(row[2]),
            "created_at": row[3],
            "updated_at": row[4],
        })
    return presets


@router.post("/scenes", response_model=ScenePresetResponse, status_code=status.HTTP_201_CREATED)
async def create_scene_preset(
    req: CreateScenePresetRequest,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Save a new reusable scene graph preset."""
    preset_id = f"preset_{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(UTC).isoformat()
    scene_json = req.scene.model_dump_json()

    await db.execute(
        """INSERT INTO scene_presets (id, name, scene_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)""",
        (preset_id, req.name.strip(), scene_json, now_iso, now_iso),
    )
    await db.commit()

    return {
        "id": preset_id,
        "name": req.name.strip(),
        "scene": req.scene.model_dump(),
        "created_at": now_iso,
        "updated_at": now_iso,
    }


@router.put("/scenes/{preset_id}", response_model=ScenePresetResponse, status_code=status.HTTP_200_OK)
async def update_scene_preset(
    preset_id: str,
    req: UpdateScenePresetRequest,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Update an existing reusable scene graph preset (overwrites scene layout, optional name change)."""
    async with db.execute(
        "SELECT id, name, created_at FROM scene_presets WHERE id = ?", (preset_id,)
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Preset not found")
        existing_name = row[1]
        created_at = row[2]

    now_iso = datetime.now(UTC).isoformat()
    new_name = req.name.strip() if req.name else existing_name
    scene_json = req.scene.model_dump_json()

    await db.execute(
        """UPDATE scene_presets SET name = ?, scene_json = ?, updated_at = ? WHERE id = ?""",
        (new_name, scene_json, now_iso, preset_id),
    )
    await db.commit()

    return {
        "id": preset_id,
        "name": new_name,
        "scene": req.scene.model_dump(),
        "created_at": created_at,
        "updated_at": now_iso,
    }


@router.delete("/scenes/{preset_id}", status_code=status.HTTP_200_OK)
async def delete_scene_preset(
    preset_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Delete a scene preset by ID."""
    async with db.execute("DELETE FROM scene_presets WHERE id = ?", (preset_id,)) as cur:
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Preset not found")

    await db.commit()
    return {"status": "deleted", "id": preset_id}
