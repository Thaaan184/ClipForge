import pytest
from pydantic import ValidationError

from clipforge.render.scene.schema import (
    BBox,
    CanvasConfig,
    LayerConfig,
    SceneGraph,
    ShapeConfig,
    SourceConfig,
    TransformConfig,
)


def create_sample_scene() -> SceneGraph:
    return SceneGraph(
        version="1.1",
        canvas=CanvasConfig(width=1080, height=1920, fps=30),
        sources=[SourceConfig(id="src1", width=1920, height=1080, fps=30.0)],
        layers=[
            LayerConfig(
                id="cut_1",
                source_id="src1",
                shape=ShapeConfig(
                    type="rect",
                    bbox=BBox(x=100, y=100, w=500, h=500),
                ),
                transform=TransformConfig(cx=540, cy=960, w=500, h=500, z=5),
            ),
            LayerConfig(
                id="cut_2",
                source_id="src1",
                shape=ShapeConfig(
                    type="ellipse",
                    bbox=BBox(x=200, y=200, w=400, h=400),
                ),
                transform=TransformConfig(cx=540, cy=400, w=400, h=400, z=1),
            ),
        ],
    )


def test_valid_scene_and_z_normalization():
    scene = create_sample_scene()
    assert len(scene.layers) == 2
    # Layer with z=1 should now be first and normalized to 0
    assert scene.layers[0].id == "cut_2"
    assert scene.layers[0].transform.z == 0
    # Layer with z=5 should now be second and normalized to 1
    assert scene.layers[1].id == "cut_1"
    assert scene.layers[1].transform.z == 1


def test_rotation_normalization():
    t1 = TransformConfig(cx=100, cy=100, w=100, h=100, rotation=370)
    assert t1.rotation == 10.0
    t2 = TransformConfig(cx=100, cy=100, w=100, h=100, rotation=-190)
    assert t2.rotation == 170.0


def test_bbox_out_of_bounds_rejected():
    with pytest.raises(ValidationError, match="exceeds source"):
        SceneGraph(
            sources=[SourceConfig(id="src1", width=1920, height=1080)],
            layers=[
                LayerConfig(
                    id="cut_1",
                    source_id="src1",
                    shape=ShapeConfig(
                        type="rect",
                        bbox=BBox(x=1500, y=100, w=600, h=500),  # 1500 + 600 = 2100 > 1920
                    ),
                    transform=TransformConfig(cx=540, cy=960, w=500, h=500),
                )
            ],
        )


def test_duplicate_layer_id_rejected():
    with pytest.raises(ValidationError, match="Duplicate layer id"):
        SceneGraph(
            sources=[SourceConfig(id="src1", width=1920, height=1080)],
            layers=[
                LayerConfig(
                    id="dup_id",
                    source_id="src1",
                    shape=ShapeConfig(type="rect", bbox=BBox(x=10, y=10, w=50, h=50)),
                    transform=TransformConfig(cx=540, cy=960, w=100, h=100),
                ),
                LayerConfig(
                    id="dup_id",
                    source_id="src1",
                    shape=ShapeConfig(type="rect", bbox=BBox(x=60, y=60, w=50, h=50)),
                    transform=TransformConfig(cx=540, cy=960, w=100, h=100),
                ),
            ],
        )


def test_lasso_validation():
    # Lasso requires at least 3 points
    with pytest.raises(ValidationError, match="at least 3 points"):
        ShapeConfig(
            type="lasso",
            bbox=BBox(x=10, y=10, w=50, h=50),
            points=[(10, 10), (20, 20)],
        )

    # Valid lasso with 3 points
    shape = ShapeConfig(
        type="lasso",
        bbox=BBox(x=10, y=10, w=50, h=50),
        points=[(10.0, 10.0), (30.0, 50.0), (50.0, 10.0)],
    )
    assert shape.type == "lasso"
    assert len(shape.points or []) == 3

    # Lasso points out of bounds
    with pytest.raises(ValidationError, match="exceeds source"):
        SceneGraph(
            sources=[SourceConfig(id="src1", width=1920, height=1080)],
            layers=[
                LayerConfig(
                    id="lasso_cut",
                    source_id="src1",
                    shape=ShapeConfig(
                        type="lasso",
                        bbox=BBox(x=10, y=10, w=50, h=50),
                        points=[(10.0, 10.0), (2000.0, 50.0), (50.0, 10.0)],
                    ),
                    transform=TransformConfig(cx=540, cy=960, w=100, h=100),
                )
            ],
        )


def test_unknown_source_id_rejected():
    with pytest.raises(ValidationError, match="unknown source_id"):
        SceneGraph(
            sources=[SourceConfig(id="src1", width=1920, height=1080)],
            layers=[
                LayerConfig(
                    id="cut_1",
                    source_id="unknown_src",
                    shape=ShapeConfig(type="rect", bbox=BBox(x=10, y=10, w=50, h=50)),
                    transform=TransformConfig(cx=540, cy=960, w=100, h=100),
                )
            ],
        )


def test_extra_fields_forbidden():
    with pytest.raises(ValidationError, match="extra"):
        CanvasConfig.model_validate({"width": 1080, "height": 1920, "fps": 30, "unknown_field": 123})
