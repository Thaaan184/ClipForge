from pathlib import Path

from PIL import Image

from clipforge.render.scene.masks import (
    generate_gradient_background,
    generate_layer_assets,
    parse_hex_color,
)
from clipforge.render.scene.schema import (
    BBox,
    GradientConfig,
    LayerConfig,
    ShadowConfig,
    ShapeConfig,
    StyleConfig,
    TransformConfig,
)


def test_parse_hex_color():
    assert parse_hex_color("#FF0000") == (255, 0, 0, 255)
    assert parse_hex_color("#00FF0080", alpha_mul=0.5) == (0, 255, 0, 64)
    assert parse_hex_color("#123") == (17, 34, 51, 255)


def test_layer_assets_generation(tmp_path: Path):
    layer = LayerConfig(
        id="layer_test_1",
        source_id="src1",
        shape=ShapeConfig(
            type="ellipse",
            bbox=BBox(x=0, y=0, w=200, h=100),
        ),
        transform=TransformConfig(cx=540, cy=960, w=400, h=200, rotation=15),
        style=StyleConfig(
            border_width=4,
            border_color="#00FFCC",
            shadow=ShadowConfig(
                enabled=True,
                color="#000000",
                alpha=0.6,
                blur=10,
                offset_x=4,
                offset_y=6,
            ),
        ),
    )

    assets = generate_layer_assets(layer, work_dir=tmp_path)
    assert assets.padding > 0

    # 1. Mask dimensions
    assert assets.mask_path.exists()
    with Image.open(assets.mask_path) as m_img:
        assert m_img.size == (400, 200)
        assert m_img.mode == "L"
        # Check smooth anti-aliased edges (some pixels must be > 0 and < 255)
        pixel_vals = set(m_img.tobytes())
        assert any(0 < p < 255 for p in pixel_vals)

    # 2. Ring dimensions
    assert assets.ring_path is not None and assets.ring_path.exists()
    with Image.open(assets.ring_path) as r_img:
        expected_size = (400 + 2 * assets.padding, 200 + 2 * assets.padding)
        assert r_img.size == expected_size
        assert r_img.mode == "RGBA"

    # 3. Shadow dimensions
    assert assets.shadow_path is not None and assets.shadow_path.exists()
    with Image.open(assets.shadow_path) as s_img:
        expected_size = (400 + 2 * assets.padding, 200 + 2 * assets.padding)
        assert s_img.size == expected_size
        assert s_img.mode == "RGBA"


def test_gradient_background(tmp_path: Path):
    grad_path = tmp_path / "bg_grad.png"
    cfg = GradientConfig(angle=90, stops=["#FF0000", "#0000FF"])
    generate_gradient_background(cfg, width=200, height=400, output_path=grad_path)
    assert grad_path.exists()
    with Image.open(grad_path) as g_img:
        assert g_img.size == (200, 400)
        assert g_img.mode == "RGB"
