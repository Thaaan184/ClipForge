"""Geometric calculations, bounding box math, padding, and Douglas-Peucker simplification."""

import math
from collections.abc import Sequence


def round_even(v: int | float) -> int:
    """Round down/truncate to even integer (for YUV420p video alignment)."""
    val = int(v)
    return val if val % 2 == 0 else val - 1


def clamp(val: float, min_val: float, max_val: float) -> float:
    """Clamp value between min_val and max_val."""
    return max(min_val, min(val, max_val))


def calculate_padding(blur: float, offset_x: float, offset_y: float) -> int:
    """
    Calculate symmetric padding P around layer to contain drop shadow without clipping.
    P = ceil(2 * blur) + max(|offset_x|, |offset_y|) + 2
    """
    if blur <= 0 and offset_x == 0 and offset_y == 0:
        return 0
    return int(math.ceil(2.0 * blur) + max(abs(offset_x), abs(offset_y)) + 2)


def calculate_rotw_roth(w: float, h: float, angle_deg: float) -> tuple[int, int]:
    """
    Calculate bounding box dimensions ow, oh of rotated rectangle matching FFmpeg's rotw/roth.
    rotw(theta) = abs(w*cos(theta)) + abs(h*sin(theta))
    roth(theta) = abs(w*sin(theta)) + abs(h*cos(theta))
    """
    theta = math.radians(angle_deg)
    cos_t = abs(math.cos(theta))
    sin_t = abs(math.sin(theta))
    ow = w * cos_t + h * sin_t
    oh = w * sin_t + h * cos_t
    return max(2, int(round(ow))), max(2, int(round(oh)))


def _perpendicular_distance(
    pt: tuple[float, float],
    line_start: tuple[float, float],
    line_end: tuple[float, float],
) -> float:
    dx = line_end[0] - line_start[0]
    dy = line_end[1] - line_start[1]
    mag_sq = dx * dx + dy * dy
    if mag_sq == 0:
        return math.hypot(pt[0] - line_start[0], pt[1] - line_start[1])

    u = ((pt[0] - line_start[0]) * dx + (pt[1] - line_start[1]) * dy) / mag_sq
    u = max(0.0, min(1.0, u))
    proj_x = line_start[0] + u * dx
    proj_y = line_start[1] + u * dy
    return math.hypot(pt[0] - proj_x, pt[1] - proj_y)


def douglas_peucker(
    points: Sequence[tuple[float, float]],
    tolerance: float = 2.0,
    max_points: int = 200,
) -> list[tuple[float, float]]:
    """
    Simplify 2D polygonal points using the Ramer-Douglas-Peucker algorithm.
    Guarantees returning between 3 and max_points.
    """
    if len(points) <= 3:
        return list(points)

    def _rdp(pts: Sequence[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
        if len(pts) <= 2:
            return list(pts)

        dmax = 0.0
        index = 0
        start = pts[0]
        end = pts[-1]

        for i in range(1, len(pts) - 1):
            d = _perpendicular_distance(pts[i], start, end)
            if d > dmax:
                index = i
                dmax = d

        if dmax > tol:
            rec_results1 = _rdp(pts[: index + 1], tol)
            rec_results2 = _rdp(pts[index:], tol)
            return rec_results1[:-1] + rec_results2
        else:
            return [start, end]

    current_tol = tolerance
    simplified = _rdp(points, current_tol)

    # Ensure max_points limit
    while len(simplified) > max_points:
        current_tol *= 1.5
        simplified = _rdp(points, current_tol)

    # Ensure at least 3 points if original had >= 3 points
    if len(simplified) < 3 and len(points) >= 3:
        mid_idx = len(points) // 2
        simplified = [points[0], points[mid_idx], points[-1]]

    return simplified
