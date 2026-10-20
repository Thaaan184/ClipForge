"""Legacy layout converter: converts legacy reframe modes into Scene Graph v1.1."""

from typing import Any

from clipforge.render.scene.schema import (
    BackgroundConfig,
    BBox,
    CanvasConfig,
    LayerConfig,
    SceneGraph,
    ShapeConfig,
    SourceConfig,
    StyleConfig,
    SubtitlesConfig,
    TransformConfig,
)


def legacy_reframe_to_scene(
    mode: str = "blur",
    source_dims: tuple[int, int] = (1920, 1080),
    fps: float = 30.0,
    start_s: float = 0.0,
    end_s: float = 60.0,
    subtitle_cfg: dict[str, Any] | None = None,
    game_roi: tuple[float, float, float, float] | None = None,
    face_roi: tuple[float, float, float, float] | None = None,
) -> SceneGraph:
    """
    Convert legacy reframe mode ('blur', 'center', 'stacked')
    into an equivalent editable SceneGraph v1.1.
    """
    src_w, src_h = source_dims
    canvas_w, canvas_h = 1080, 1920
    canvas_fps = min(60, max(1, round(fps)))

    sub_cfg = subtitle_cfg or {}
    preset_name = sub_cfg.get("preset", "none")
    default_enabled = preset_name.lower() not in (
        "none",
        "off",
        "disable",
        "no_subtitles",
        "tanpa_subtitle",
    )
    subtitles = SubtitlesConfig(
        enabled=sub_cfg.get("enabled", default_enabled),
        preset=preset_name,
        position=sub_cfg.get("position", "bottom"),
    )

    source = SourceConfig(
        id="src1",
        width=src_w,
        height=src_h,
        fps=fps,
        start=start_s,
        end=end_s,
        padding_before=1.0,
    )

    layers: list[LayerConfig] = []

    if mode == "center":
        # 9:16 vertical crop centered on 16:9 source
        crop_w = round(src_h * (canvas_w / canvas_h))
        crop_h = src_h
        crop_x = max(0, round((src_w - crop_w) / 2))
        crop_y = 0

        layers.append(
            LayerConfig(
                id="layer_center",
                name="Center Crop",
                source_id="src1",
                visible=True,
                locked=False,
                shape=ShapeConfig(
                    type="rect",
                    bbox=BBox(x=crop_x, y=crop_y, w=crop_w, h=crop_h),
                ),
                transform=TransformConfig(
                    cx=canvas_w / 2,
                    cy=canvas_h / 2,
                    w=canvas_w,
                    h=canvas_h,
                    rotation=0.0,
                    lock_aspect=True,
                    z=0,
                ),
                style=StyleConfig(),
            )
        )
        bg = BackgroundConfig(type="solid", color="#000000")

    elif mode == "stacked":
        # Game layer (top, 1080x1200) + Facecam layer (bottom, 1080x720)
        if game_roi:
            gx, gy, gw, gh = game_roi
            g_bbox = BBox(x=gx * src_w, y=gy * src_h, w=gw * src_w, h=gh * src_h)
        else:
            g_bbox = BBox(x=0, y=0, w=src_w, h=round(src_h * 0.75))

        if face_roi:
            fx, fy, fw, fh = face_roi
            f_bbox = BBox(x=fx * src_w, y=fy * src_h, w=fw * src_w, h=fh * src_h)
        else:
            f_bbox = BBox(
                x=round(src_w * 0.65),
                y=round(src_h * 0.55),
                w=round(src_w * 0.35),
                h=round(src_h * 0.45),
            )

        layers.append(
            LayerConfig(
                id="layer_game",
                name="Gameplay",
                source_id="src1",
                visible=True,
                locked=False,
                shape=ShapeConfig(type="rect", bbox=g_bbox),
                transform=TransformConfig(
                    cx=canvas_w / 2,
                    cy=600.0,
                    w=canvas_w,
                    h=1200.0,
                    rotation=0.0,
                    lock_aspect=True,
                    z=0,
                ),
                style=StyleConfig(),
            )
        )
        layers.append(
            LayerConfig(
                id="layer_face",
                name="Facecam",
                source_id="src1",
                visible=True,
                locked=False,
                shape=ShapeConfig(type="rect", bbox=f_bbox),
                transform=TransformConfig(
                    cx=canvas_w / 2,
                    cy=1560.0,
                    w=canvas_w,
                    h=720.0,
                    rotation=0.0,
                    lock_aspect=True,
                    z=1,
                ),
                style=StyleConfig(
                    border_width=4.0,
                    border_color="#FF6A00",
                ),
            )
        )
        bg = BackgroundConfig(type="solid", color="#0A0A0A")

    else:
        # Default: "blur" mode (16:9 pillarbox centered with blurred background)
        fg_w = canvas_w
        fg_h = round(canvas_w * (src_h / src_w))

        layers.append(
            LayerConfig(
                id="layer_main",
                name="Main Video",
                source_id="src1",
                visible=True,
                locked=False,
                shape=ShapeConfig(
                    type="rect",
                    bbox=BBox(x=0.0, y=0.0, w=float(src_w), h=float(src_h)),
                ),
                transform=TransformConfig(
                    cx=canvas_w / 2,
                    cy=canvas_h / 2,
                    w=float(fg_w),
                    h=float(fg_h),
                    rotation=0.0,
                    lock_aspect=True,
                    z=0,
                ),
                style=StyleConfig(),
            )
        )
        bg = BackgroundConfig(type="blur_source", blur_sigma=25.0)

    return SceneGraph(
        version="1.1",
        canvas=CanvasConfig(width=canvas_w, height=canvas_h, fps=canvas_fps),
        background=bg,
        sources=[source],
        layers=layers,
        subtitles=subtitles,
    )
