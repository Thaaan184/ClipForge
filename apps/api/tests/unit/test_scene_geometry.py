import math

from clipforge.render.scene.geometry import (
    calculate_padding,
    calculate_rotw_roth,
    clamp,
    douglas_peucker,
    round_even,
)


def test_round_even():
    assert round_even(10) == 10
    assert round_even(11) == 10
    assert round_even(10.8) == 10
    assert round_even(0) == 0


def test_clamp():
    assert clamp(5, 0, 10) == 5
    assert clamp(-5, 0, 10) == 0
    assert clamp(15, 0, 10) == 10


def test_calculate_padding():
    assert calculate_padding(0, 0, 0) == 0
    # blur=10, offset_x=4, offset_y=-5 -> ceil(2*10) + 5 + 2 = 27
    assert calculate_padding(10, 4, -5) == 27


def test_calculate_rotw_roth():
    # 0 deg: w, h unchanged
    ow, oh = calculate_rotw_roth(100, 50, 0)
    assert ow == 100
    assert oh == 50

    # 90 deg: w, h swapped
    ow, oh = calculate_rotw_roth(100, 50, 90)
    assert ow == 50
    assert oh == 100

    # 45 deg
    ow, oh = calculate_rotw_roth(100, 100, 45)
    expected = int(round(100 * math.sqrt(2)))
    assert abs(ow - expected) <= 1
    assert abs(oh - expected) <= 1


def test_douglas_peucker():
    # Collinear points on straight line: should reduce to endpoints + 1
    points = [(float(i), float(i)) for i in range(20)]
    simplified = douglas_peucker(points, tolerance=1.0)
    assert len(simplified) == 3
    assert simplified[0] == (0.0, 0.0)
    assert simplified[-1] == (19.0, 19.0)

    # Triangle with small noise
    noisy_tri = [
        (0.0, 0.0),
        (5.0, 0.1),
        (10.0, 0.0),
        (5.0, 10.0),
        (0.0, 0.0),
    ]
    simp_tri = douglas_peucker(noisy_tri, tolerance=0.5)
    assert len(simp_tri) < len(noisy_tri)
    assert len(simp_tri) >= 3
