from pathlib import Path

from clipforge.render.scene.compiler import FFmpegSceneCompiler
from clipforge.render.scene.schema import (
    BackgroundConfig,
    BBox,
    CanvasConfig,
    GradientConfig,
    LayerConfig,
    SceneGraph,
    ShadowConfig,
    ShapeConfig,
    SourceConfig,
    StyleConfig,
    TransformConfig,
)


def _create_base_scene(layers: list[LayerConfig], bg: BackgroundConfig | None = None) -> SceneGraph:
    return SceneGraph(
        version="1.1",
        canvas=CanvasConfig(width=1080, height=1920, fps=30),
        background=bg or BackgroundConfig(type="blur_source", blur_sigma=20.0),
        sources=[
            SourceConfig(
                id="src1",
                width=1920,
                height=1080,
                fps=30.0,
                start=0.0,
                end=10.0,
            )
        ],
        layers=layers,
    )


def test_compiler_single_rect(tmp_path: Path):
    compiler = FFmpegSceneCompiler()
    layer = LayerConfig(
        id="rect_1",
        source_id="src1",
        shape=ShapeConfig(type="rect", bbox=BBox(x=100, y=100, w=500, h=400)),
        transform=TransformConfig(cx=540, cy=960, w=1080, h=800, rotation=0),
    )
    scene = _create_base_scene([layer], bg=BackgroundConfig(type="solid", color="#000000"))

    dummy_video = tmp_path / "src.mp4"
    dummy_video.touch()

    compiled = compiler.compile(scene, source_video=dummy_video, work_dir=tmp_path, duration_s=10.0)

    assert "-i" in compiled.input_args
    assert "color=c=0x000000" in compiled.filter_complex
    assert "crop=500:400:100:100,scale=1080:800" in compiled.filter_complex
    assert "alphamerge" in compiled.filter_complex
    assert "format=yuv420p" in compiled.filter_complex
    assert compiled.map_args == ["-map", "[v_out]", "-map", "0:a?"]


def test_compiler_rotated_ellipse_border_shadow(tmp_path: Path):
    compiler = FFmpegSceneCompiler()
    layer = LayerConfig(
        id="ellipse_rot",
        source_id="src1",
        shape=ShapeConfig(type="ellipse", bbox=BBox(x=200, y=100, w=400, h=400)),
        transform=TransformConfig(cx=540, cy=500, w=500, h=500, rotation=-25),
        style=StyleConfig(
            border_width=6,
            border_color="#00FFCC",
            shadow=ShadowConfig(
                enabled=True,
                color="#000000",
                alpha=0.7,
                blur=15,
                offset_x=5,
                offset_y=8,
            ),
        ),
    )
    scene = _create_base_scene([layer], bg=BackgroundConfig(type="blur_source", blur_sigma=30.0))

    dummy_video = tmp_path / "src.mp4"
    dummy_video.touch()

    compiled = compiler.compile(scene, source_video=dummy_video, work_dir=tmp_path, duration_s=15.0)

    # 1 video + 1 mask + 1 shadow + 1 ring = 4 inputs
    assert compiled.input_args.count("-i") == 4
    assert "gblur=sigma=30.0" in compiled.filter_complex
    assert "rotate=" in compiled.filter_complex
    assert "shortest=1" in compiled.filter_complex


def test_compiler_lasso_gradient(tmp_path: Path):
    compiler = FFmpegSceneCompiler()
    layer = LayerConfig(
        id="lasso_1",
        source_id="src1",
        shape=ShapeConfig(
            type="lasso",
            bbox=BBox(x=50, y=50, w=300, h=300),
            points=[(50, 50), (350, 100), (200, 350)],
        ),
        transform=TransformConfig(cx=540, cy=960, w=600, h=600),
    )
    grad = GradientConfig(angle=135, stops=["#1a1a2e", "#16213e"])
    scene = _create_base_scene([layer], bg=BackgroundConfig(type="gradient", gradient=grad))

    dummy_video = tmp_path / "src.mp4"
    dummy_video.touch()

    compiled = compiler.compile(scene, source_video=dummy_video, work_dir=tmp_path, duration_s=5.0)

    assert "bg_gradient.png" in str(compiled.temp_assets)
    assert any("bg_gradient.png" in arg for arg in compiled.input_args)


def test_compiler_five_layers(tmp_path: Path):
    compiler = FFmpegSceneCompiler()
    layers = [
        LayerConfig(
            id=f"cut_{i}",
            source_id="src1",
            shape=ShapeConfig(type="rect", bbox=BBox(x=10 * i, y=10 * i, w=200, h=200)),
            transform=TransformConfig(cx=540, cy=300 * i + 100, w=300, h=300, z=i),
        )
        for i in range(5)
    ]
    scene = _create_base_scene(layers, bg=BackgroundConfig(type="blur_source", blur_sigma=15.0))

    dummy_video = tmp_path / "src.mp4"
    dummy_video.touch()

    compiled = compiler.compile(scene, source_video=dummy_video, work_dir=tmp_path, duration_s=10.0)

    # Blur background split + 5 layer splits = 6 splits
    assert "split=6" in compiled.filter_complex
    assert "[comp_4]" in compiled.filter_complex


def test_compiler_determinism(tmp_path: Path):
    compiler = FFmpegSceneCompiler()
    layer = LayerConfig(
        id="layer_det",
        source_id="src1",
        shape=ShapeConfig(type="rect", bbox=BBox(x=100, y=100, w=400, h=300)),
        transform=TransformConfig(cx=540, cy=960, w=800, h=600, rotation=10),
    )
    scene = _create_base_scene([layer])
    dummy_video = tmp_path / "src.mp4"
    dummy_video.touch()

    c1 = compiler.compile(scene, source_video=dummy_video, work_dir=tmp_path / "run1", duration_s=10.0)
    c2 = compiler.compile(scene, source_video=dummy_video, work_dir=tmp_path / "run2", duration_s=10.0)

    # Identical filter_complex structure
    assert c1.filter_complex == c2.filter_complex
