"""Unit tests for scene presets API routes."""

import pytest
from httpx import ASGITransport, AsyncClient

from clipforge.api.app import app
from clipforge.db.connection import get_db_connection
from clipforge.db.migrator import run_migrations


@pytest.mark.asyncio
async def test_scene_presets_lifecycle():
    async with get_db_connection() as db:
        await run_migrations(db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        # 1. Initially list presets
        list_res = await client.get("/api/presets/scenes")
        assert list_res.status_code == 200
        initial_count = len(list_res.json())

        # 2. Create new preset
        valid_scene = {
            "version": "1.1",
            "canvas": {"width": 1080, "height": 1920, "fps": 30},
            "background": {"type": "solid", "color": "#111111"},
            "sources": [{"id": "src1", "width": 1920, "height": 1080, "fps": 30.0}],
            "layers": [
                {
                    "id": "cut_game",
                    "name": "Game Cut",
                    "source_id": "src1",
                    "shape": {"type": "rect", "bbox": {"x": 0, "y": 0, "w": 1920, "h": 1080}},
                    "transform": {"cx": 540, "cy": 960, "w": 1080, "h": 608, "rotation": 0, "z": 0},
                    "style": {"opacity": 1.0},
                }
            ],
            "subtitles": {"enabled": True, "preset": "classic_white", "position": "bottom"},
        }

        create_res = await client.post(
            "/api/presets/scenes",
            json={
                "name": "Apex Pro Vertical",
                "scene": valid_scene,
            },
        )
        assert create_res.status_code == 201
        created = create_res.json()
        assert created["name"] == "Apex Pro Vertical"
        preset_id = created["id"]
        assert preset_id.startswith("preset_")

        # 3. List presets and find newly created
        list_res_2 = await client.get("/api/presets/scenes")
        assert list_res_2.status_code == 200
        presets = list_res_2.json()
        assert len(presets) == initial_count + 1
        found = next((p for p in presets if p["id"] == preset_id), None)
        assert found is not None
        assert found["name"] == "Apex Pro Vertical"
        assert len(found["scene"]["layers"]) == 1

        # 4. Delete preset
        del_res = await client.delete(f"/api/presets/scenes/{preset_id}")
        assert del_res.status_code == 200
        assert del_res.json()["status"] == "deleted"

        # 5. Delete non-existent preset -> 404
        del_res_404 = await client.delete(f"/api/presets/scenes/{preset_id}")
        assert del_res_404.status_code == 404
