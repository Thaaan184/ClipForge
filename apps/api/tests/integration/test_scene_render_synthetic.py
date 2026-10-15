import json
import subprocess
from pathlib import Path

import pytest

from clipforge.render.engine import render_single_clip
from clipforge.render.scene.schema import (
    BackgroundConfig,
    BBox,
    CanvasConfig,
    LayerConfig,
    SceneGraph,
    ShadowConfig,
    ShapeConfig,
    SourceConfig,
    StyleConfig,
    TransformConfig,
)


@pytest.mark.asyncio
async def test_scene_render_synthetic_lavfi(tmp_path: Path):
    # 1. Generate 3-second synthetic 1080p source video with audio
    clip_dir = tmp_path / "test_clip"
    clip_dir.mkdir(parents=True, exist_ok=True)
    raw_video = clip_dir / "raw.mp4"

    cmd_gen = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=1920x1080:rate=30:duration=3",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=1000:duration=3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        str(raw_video),
    ]
    gen_proc = subprocess.run(cmd_gen, capture_output=True, text=True)
    assert gen_proc.returncode == 0, f"Synthetic video gen failed: {gen_proc.stderr}"
    assert raw_video.exists()

    # 2. Build multi-layer SceneGraph v1.1
    scene = SceneGraph(
        version="1.1",
        canvas=CanvasConfig(width=1080, height=1920, fps=30),
        background=BackgroundConfig(type="blur_source", blur_sigma=20.0),
        sources=[
            SourceConfig(
                id="src1",
                width=1920,
                height=1080,
                fps=30.0,
                start=0.0,
                end=3.0,
            )
        ],
        layers=[
            # Layer 0: Center gameplay rect
            LayerConfig(
                id="lyr_game",
                name="Gameplay",
                source_id="src1",
                shape=ShapeConfig(type="rect", bbox=BBox(x=200, y=100, w=1500, h=900)),
                transform=TransformConfig(cx=540, cy=1100, w=1000, h=600, rotation=0, z=0),
            ),
            # Layer 1: Rotated Facecam ellipse with border and shadow
            LayerConfig(
                id="lyr_face",
                name="Facecam",
                source_id="src1",
                shape=ShapeConfig(type="ellipse", bbox=BBox(x=1200, y=50, w=400, h=400)),
                transform=TransformConfig(cx=540, cy=450, w=500, h=500, rotation=-8, z=1),
                style=StyleConfig(
                    border_width=6,
                    border_color="#00FFCC",
                    shadow=ShadowConfig(
                        enabled=True,
                        color="#000000",
                        alpha=0.6,
                        blur=15,
                        offset_x=4,
                        offset_y=6,
                    ),
                ),
            ),
        ],
    )

    # 3. Render clip via engine
    res = render_single_clip(
        clip_dir=clip_dir,
        raw_video=raw_video,
        expected_duration_s=3.0,
        fps=30,
        scene_graph=scene,
    )

    assert res["success"] is True, f"Render failed: {res.get('qa')}"
    final_mp4 = Path(res["final_path"])
    assert final_mp4.exists()

    # 4. Probe final video with ffprobe
    probe_cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        str(final_mp4),
    ]
    probe_proc = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
    meta = json.loads(probe_proc.stdout)
    v_stream = next(s for s in meta["streams"] if s["codec_type"] == "video")
    a_stream = next(s for s in meta["streams"] if s["codec_type"] == "audio")

    assert v_stream["width"] == 1080
    assert v_stream["height"] == 1920
    assert v_stream["pix_fmt"] == "yuv420p"
    assert a_stream is not None

    dur = float(meta["format"]["duration"])
    assert abs(dur - 3.0) < 0.2  # within ~1 frame / 0.1s

    # 5. Verify strict QA gate passed
    qa_data = res["qa"]
    assert qa_data["passed"] is True

    # 6. Verify zero temporary mask/ring/shadow files left behind
    assert not (clip_dir / "_scene_tmp").exists()
    assert len(list(clip_dir.glob("*.png"))) == 0
