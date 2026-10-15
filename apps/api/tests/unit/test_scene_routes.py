import pytest
from httpx import ASGITransport, AsyncClient

from clipforge.api.app import app
from clipforge.db.connection import get_db_connection
from clipforge.db.migrator import run_migrations
from clipforge.render.scene.schema import (
    BBox,
    CanvasConfig,
    LayerConfig,
    SceneGraph,
    ShapeConfig,
    SourceConfig,
    TransformConfig,
)


@pytest.mark.asyncio
async def test_candidate_scene_routes():
    async with get_db_connection() as db:
        await run_migrations(db)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Create a job first
        job_res = await client.post(
            "/api/jobs",
            json={"source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
        )
        assert job_res.status_code == 202
        job_id = job_res.json()["id"]

        # Add manual clip to create candidate
        clip_res = await client.post(
            f"/api/jobs/{job_id}/clips",
            json={
                "clips": [
                    {
                        "start_time": "00:00:10",
                        "end_time": "00:00:25",
                        "title": "Scene Test Candidate",
                    }
                ]
            },
        )
        assert clip_res.status_code == 200

        # Get candidates
        cand_res = await client.get(f"/api/jobs/{job_id}/candidates")
        assert cand_res.status_code == 200
        candidates = cand_res.json()["candidates"]
        assert len(candidates) > 0
        cand_id = candidates[0]["id"]

        # GET candidate scene before any save -> should return legacy-converted scene
        scene_get_1 = await client.get(f"/api/jobs/candidates/{cand_id}/scene")
        assert scene_get_1.status_code == 200
        init_scene = scene_get_1.json()
        assert init_scene["version"] == "1.1"
        assert len(init_scene["layers"]) >= 1

        # PUT candidate scene with valid custom scene
        custom_scene = SceneGraph(
            version="1.1",
            canvas=CanvasConfig(width=1080, height=1920, fps=30),
            sources=[
                SourceConfig(
                    id="src1",
                    width=1920,
                    height=1080,
                    fps=30.0,
                    start=10.0,
                    end=25.0,
                )
            ],
            layers=[
                LayerConfig(
                    id="cut_1",
                    name="My Test Cut",
                    source_id="src1",
                    shape=ShapeConfig(
                        type="rect",
                        bbox=BBox(x=100, y=100, w=400, h=300),
                    ),
                    transform=TransformConfig(cx=540, cy=960, w=800, h=600),
                )
            ],
        )

        put_res = await client.put(
            f"/api/jobs/candidates/{cand_id}/scene",
            json=custom_scene.model_dump(),
        )
        assert put_res.status_code == 200
        saved_scene = put_res.json()
        assert saved_scene["layers"][0]["name"] == "My Test Cut"

        # Check candidate render_mode was updated to freeform
        cand_res_2 = await client.get(f"/api/jobs/{job_id}/candidates")
        cand_updated = next(
            c for c in cand_res_2.json()["candidates"] if c["id"] == cand_id
        )
        assert cand_updated["render_mode"] == "freeform"
        assert cand_updated["has_scene"] is True
        assert cand_updated["scene_layer_count"] == 1

        # PUT with invalid scene (e.g. out-of-bounds bbox) -> 422
        bad_scene = custom_scene.model_dump()
        bad_scene["layers"][0]["shape"]["bbox"]["x"] = 99999
        bad_put_res = await client.put(
            f"/api/jobs/candidates/{cand_id}/scene",
            json=bad_scene,
        )
        assert bad_put_res.status_code == 422


@pytest.mark.asyncio
async def test_segment_routes_and_404():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        # 404 for unknown segment
        res = await client.get("/api/segments/seg_unknown_test")
        assert res.status_code == 404
