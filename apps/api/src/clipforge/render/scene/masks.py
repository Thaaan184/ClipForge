"""Mask, border ring, drop shadow, and gradient generation using Pillow."""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from clipforge.render.scene.geometry import calculate_padding
from clipforge.render.scene.schema import GradientConfig, LayerConfig


@dataclass
class LayerAssets:
    mask_path: Path
    ring_path: Path | None
    shadow_path: Path | None
    padding: int


def parse_hex_color(
    color_str: str,
    alpha_mul: float = 1.0,
) -> tuple[int, int, int, int]:
    """Parse hex color (#RGB, #RRGGBB, #RRGGBBAA) with optional alpha multiplier."""
    c = color_str.strip().lstrip("#")
    if len(c) == 3:
        r = int(c[0] * 2, 16)
        g = int(c[1] * 2, 16)
        b = int(c[2] * 2, 16)
        a = 255
    elif len(c) == 6:
        r = int(c[0:2], 16)
        g = int(c[2:4], 16)
        b = int(c[4:6], 16)
        a = 255
    elif len(c) == 8:
        r = int(c[0:2], 16)
        g = int(c[2:4], 16)
        b = int(c[4:6], 16)
        a = int(c[6:8], 16)
    else:
        r, g, b, a = 255, 255, 255, 255

    final_a = max(0, min(255, int(round(a * alpha_mul))))
    return r, g, b, final_a


ColorType = int | tuple[int, int, int] | tuple[int, int, int, int] | None


def _draw_shape_path(
    draw: ImageDraw.ImageDraw,
    shape_type: str,
    box: tuple[float, float, float, float],
    corner_radius: float = 0.0,
    points: Sequence[tuple[float, float]] | None = None,
    fill: ColorType = None,
    outline: ColorType = None,
    width: int = 1,
) -> None:
    if shape_type == "ellipse":
        draw.ellipse(box, fill=fill, outline=outline, width=width)
    elif shape_type == "rect":
        if corner_radius > 0:
            draw.rounded_rectangle(
                box,
                radius=corner_radius,
                fill=fill,
                outline=outline,
                width=width,
            )
        else:
            draw.rectangle(box, fill=fill, outline=outline, width=width)
    elif shape_type == "lasso":
        if points and len(points) >= 3:
            # Pillow polygon fill uses non-zero rule by default
            draw.polygon(list(points), fill=fill, outline=outline)


def generate_mask(layer: LayerConfig, output_path: Path) -> Path:
    """
    Generate grayscale alpha mask w x h for a layer.
    Uses 4x supersampling and Lanczos downscale for smooth anti-aliased edges.
    """
    w = int(round(layer.transform.w))
    h = int(round(layer.transform.h))
    scale = 4

    hi_w = max(4, w * scale)
    hi_h = max(4, h * scale)

    hi_img = Image.new("L", (hi_w, hi_h), 0)
    draw = ImageDraw.Draw(hi_img)

    box = (0.0, 0.0, float(hi_w), float(hi_h))
    r = float(layer.style.corner_radius) * scale

    local_points = None
    if layer.shape.type == "lasso" and layer.shape.points:
        bbox = layer.shape.bbox
        sx = hi_w / max(1.0, bbox.w)
        sy = hi_h / max(1.0, bbox.h)
        local_points = [
            ((pt[0] - bbox.x) * sx, (pt[1] - bbox.y) * sy)
            for pt in layer.shape.points
        ]

    _draw_shape_path(
        draw,
        shape_type=layer.shape.type,
        box=box,
        corner_radius=r,
        points=local_points,
        fill=255,
    )

    mask = hi_img.resize((w, h), Image.Resampling.LANCZOS)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    mask.save(output_path, format="PNG")
    return output_path


def generate_ring(
    layer: LayerConfig,
    padding: int,
    output_path: Path,
) -> Path:
    """
    Generate border ring RGBA image of size (w + 2P) x (h + 2P).
    Border stroke is drawn inside the shape boundary.
    """
    w = int(round(layer.transform.w))
    h = int(round(layer.transform.h))
    p = padding
    scale = 4

    bw = int(round(layer.style.border_width))
    color = parse_hex_color(layer.style.border_color, layer.style.opacity)

    total_w = w + 2 * p
    total_h = h + 2 * p
    hi_w = total_w * scale
    hi_h = total_h * scale

    hi_img = Image.new("RGBA", (hi_w, hi_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(hi_img)

    hi_p = p * scale
    hi_bw = bw * scale
    box = (
        float(hi_p),
        float(hi_p),
        float(hi_p + w * scale),
        float(hi_p + h * scale),
    )
    r = float(layer.style.corner_radius) * scale

    local_points = None
    if layer.shape.type == "lasso" and layer.shape.points:
        bbox = layer.shape.bbox
        sx = (w * scale) / max(1.0, bbox.w)
        sy = (h * scale) / max(1.0, bbox.h)
        local_points = [
            (hi_p + (pt[0] - bbox.x) * sx, hi_p + (pt[1] - bbox.y) * sy)
            for pt in layer.shape.points
        ]

    if layer.shape.type in ("rect", "ellipse"):
        _draw_shape_path(
            draw,
            shape_type=layer.shape.type,
            box=box,
            corner_radius=r,
            points=None,
            fill=None,
            outline=color,
            width=hi_bw,
        )
    elif layer.shape.type == "lasso" and local_points:
        draw.polygon(local_points, outline=color, width=hi_bw)

    ring = hi_img.resize((total_w, total_h), Image.Resampling.LANCZOS)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ring.save(output_path, format="PNG")
    return output_path


def generate_shadow(
    layer: LayerConfig,
    padding: int,
    output_path: Path,
) -> Path:
    """
    Generate drop shadow RGBA image of size (w + 2P) x (h + 2P).
    Renders shape silhouette at offset (P + offset_x, P + offset_y) and applies Gaussian blur.
    """
    w = int(round(layer.transform.w))
    h = int(round(layer.transform.h))
    p = padding
    sh = layer.style.shadow

    total_w = w + 2 * p
    total_h = h + 2 * p

    # Render base silhouette in RGBA
    img = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    s_color = parse_hex_color(sh.color, alpha_mul=sh.alpha * layer.style.opacity)

    x0 = p + sh.offset_x
    y0 = p + sh.offset_y
    x1 = x0 + w
    y1 = y0 + h
    box = (float(x0), float(y0), float(x1), float(y1))

    local_points = None
    if layer.shape.type == "lasso" and layer.shape.points:
        bbox = layer.shape.bbox
        sx = w / max(1.0, bbox.w)
        sy = h / max(1.0, bbox.h)
        local_points = [
            (x0 + (pt[0] - bbox.x) * sx, y0 + (pt[1] - bbox.y) * sy)
            for pt in layer.shape.points
        ]

    _draw_shape_path(
        draw,
        shape_type=layer.shape.type,
        box=box,
        corner_radius=float(layer.style.corner_radius),
        points=local_points,
        fill=s_color,
    )

    if sh.blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(radius=sh.blur))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, format="PNG")
    return output_path


def generate_layer_assets(layer: LayerConfig, work_dir: Path) -> LayerAssets:
    """
    Generate mask.png, optional ring.png and shadow.png for a layer.
    """
    work_dir.mkdir(parents=True, exist_ok=True)
    mask_path = work_dir / f"{layer.id}_mask.png"
    generate_mask(layer, mask_path)

    sh = layer.style.shadow
    has_shadow = sh.enabled and sh.alpha > 0
    has_ring = layer.style.border_width > 0

    if has_shadow or has_ring:
        blur = sh.blur if has_shadow else 0.0
        ox = sh.offset_x if has_shadow else 0.0
        oy = sh.offset_y if has_shadow else 0.0
        p = calculate_padding(blur, ox, oy)
    else:
        p = 0

    ring_path: Path | None = None
    if has_ring:
        ring_path = work_dir / f"{layer.id}_ring.png"
        generate_ring(layer, padding=p, output_path=ring_path)

    shadow_path: Path | None = None
    if has_shadow:
        shadow_path = work_dir / f"{layer.id}_shadow.png"
        generate_shadow(layer, padding=p, output_path=shadow_path)

    return LayerAssets(
        mask_path=mask_path,
        ring_path=ring_path,
        shadow_path=shadow_path,
        padding=p,
    )


def generate_gradient_background(
    gradient: GradientConfig,
    width: int,
    height: int,
    output_path: Path,
) -> Path:
    """Generate linear 2-color gradient background image."""
    stops = gradient.stops
    c0 = parse_hex_color(stops[0] if len(stops) > 0 else "#1a1a2e")
    c1 = parse_hex_color(stops[1] if len(stops) > 1 else "#16213e")

    # Fast 1D horizontal or vertical interpolation for angle
    angle_rad = math.radians(gradient.angle)
    dx = math.cos(angle_rad)
    dy = math.sin(angle_rad)

    img = Image.new("RGB", (width, height), (0, 0, 0))
    pixels = img.load()
    assert pixels is not None

    # Projection length
    max_proj = abs(width * dx) + abs(height * dy)
    if max_proj == 0:
        max_proj = 1.0

    for y in range(0, height, 4):  # compute in 4-pixel rows for speed
        for x in range(0, width, 4):
            proj = (x * dx + y * dy)
            t = max(0.0, min(1.0, (proj / max_proj + 0.5)))
            r = int(c0[0] + (c1[0] - c0[0]) * t)
            g = int(c0[1] + (c1[1] - c0[1]) * t)
            b = int(c0[2] + (c1[2] - c0[2]) * t)
            for by in range(min(4, height - y)):
                for bx in range(min(4, width - x)):
                    pixels[x + bx, y + by] = (r, g, b)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, format="PNG")
    return output_path
