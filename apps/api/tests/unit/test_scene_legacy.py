from clipforge.render.scene.legacy import legacy_reframe_to_scene


def test_legacy_reframe_blur():
    scene = legacy_reframe_to_scene("blur", source_dims=(1920, 1080), fps=30.0)
    assert scene.version == "1.1"
    assert scene.background.type == "blur_source"
    assert len(scene.layers) == 1
    assert scene.layers[0].id == "layer_main"
    assert scene.layers[0].transform.w == 1080
    assert scene.layers[0].transform.cx == 540


def test_legacy_reframe_center():
    scene = legacy_reframe_to_scene("center", source_dims=(1920, 1080), fps=60.0)
    assert scene.background.type == "solid"
    assert len(scene.layers) == 1
    assert scene.layers[0].id == "layer_center"
    assert scene.layers[0].transform.w == 1080
    assert scene.layers[0].transform.h == 1920
    assert scene.canvas.fps == 60


def test_legacy_reframe_stacked():
    scene = legacy_reframe_to_scene(
        "stacked",
        source_dims=(1920, 1080),
        subtitle_cfg={"preset": "hormozi_bold", "position": "top"},
    )
    assert len(scene.layers) == 2
    assert scene.layers[0].id == "layer_game"
    assert scene.layers[1].id == "layer_face"
    assert scene.subtitles.preset == "hormozi_bold"
    assert scene.subtitles.position == "top"
