"""Main clip rendering engine: assembly, 9:16 reframe, ASS burn, loudnorm, QA."""

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

import structlog

from clipforge.core.config import settings
from clipforge.qa.inspector import run_clip_qa
from clipforge.render.loudnorm import build_loudnorm_af, measure_loudnorm_pass1
from clipforge.render.reframe import build_reframe_filtergraph
from clipforge.render.scene.compiler import FFmpegSceneCompiler
from clipforge.render.scene.schema import SceneGraph
from clipforge.render.thumbnail import extract_thumbnail

logger = structlog.get_logger(__name__)

ASSETS_FONTS_DIR = Path(__file__).parent.parent.parent.parent / "assets" / "fonts"


def probe_media_duration(file_path: Path) -> float | None:
    """Extract media duration using ffprobe."""
    try:
        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            str(file_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(proc.stdout)
        dur = float(data.get("format", {}).get("duration", 0.0))
        return dur if dur > 0 else None
    except Exception:
        return None


def render_single_clip(
    clip_dir: Path,
    raw_video: Path,
    ass_path: Path | None = None,
    mode: str = "blur",
    fps: int = 30,
    expected_duration_s: float | None = None,
    game_roi: tuple[float, float, float, float] | None = None,
    face_roi: tuple[float, float, float, float] | None = None,
    scene_graph: SceneGraph | None = None,
) -> dict[str, Any]:
    """
    Render a single 9:16 clip from raw.mp4 + optional subs.ass or SceneGraph.
    Guarantees:
      - OFL fonts bundled into clip_dir/fonts
      - Loudnorm pass 2 applied
      - Final video 1080x1920 yuv420p faststart
      - Automated QA executed and stored in qa.json
    """
    clip_dir.mkdir(parents=True, exist_ok=True)
    fonts_dir = clip_dir / "fonts"
    fonts_dir.mkdir(parents=True, exist_ok=True)

    # 1. Copy bundled fonts into clip fonts directory
    if ASSETS_FONTS_DIR.exists():
        for f in ASSETS_FONTS_DIR.glob("*.ttf"):
            shutil.copy2(f, fonts_dir / f.name)

    # Copy ASS script if provided and not already in clip_dir
    local_ass = clip_dir / "subs.ass"
    has_ass = False
    if ass_path and ass_path.exists():
        if ass_path.resolve() != local_ass.resolve():
            shutil.copy2(ass_path, local_ass)
        has_ass = True
    elif ass_path is not None and local_ass.exists():
        has_ass = True

    final_mp4 = clip_dir / "final.mp4"
    thumb_jpg = clip_dir / "thumb.jpg"
    qa_json_path = clip_dir / "qa.json"

    # 2. Measure audio loudness (Pass 1)
    measured = measure_loudnorm_pass1(raw_video)
    af_filter = build_loudnorm_af(measured)

    encoder = settings.ffmpeg_encoder if settings.ffmpeg_encoder != "auto" else "libx264"
    scene_tmp_dir = clip_dir / "_scene_tmp"
    temp_assets_to_clean: list[Path] = []

    try:
        if scene_graph:
            # Freeform Canvas Scene Graph pipeline
            compiler = FFmpegSceneCompiler()
            compiled = compiler.compile(
                scene=scene_graph,
                source_video=raw_video,
                work_dir=scene_tmp_dir,
                ass_path=local_ass if has_ass else None,
                duration_s=expected_duration_s or 60.0,
                fps=float(fps),
                fonts_dir=fonts_dir,
            )
            temp_assets_to_clean.extend(compiled.temp_assets)

            cmd = [
                "ffmpeg",
                "-y",
                *compiled.input_args,
                "-filter_complex",
                compiled.filter_complex,
                *compiled.map_args,
                "-af",
                af_filter,
                "-r",
                str(fps),
                "-c:v",
                encoder,
                "-crf",
                "18",
                "-preset",
                "veryfast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-ar",
                "48000",
                "-movflags",
                "+faststart",
                "-loglevel",
                "error",
                str(final_mp4),
            ]
        else:
            # Legacy preset reframe pipeline
            filtergraph = build_reframe_filtergraph(
                mode=mode,
                ass_file="subs.ass" if has_ass else None,
                fonts_dir="fonts",
                game_roi=game_roi,
                face_roi=face_roi,
            )
            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                str(raw_video.name),
                "-filter_complex",
                filtergraph,
                "-map",
                "[v]",
                "-map",
                "0:a",
                "-af",
                af_filter,
                "-r",
                str(fps),
                "-c:v",
                encoder,
                "-crf",
                "18",
                "-preset",
                "veryfast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-ar",
                "48000",
                "-movflags",
                "+faststart",
                "-loglevel",
                "error",
                "final.mp4",
            ]

        logger.info(
            "starting_ffmpeg_render",
            clip_dir=str(clip_dir),
            mode=mode if not scene_graph else "freeform",
        )
        proc = subprocess.run(cmd, cwd=str(clip_dir), capture_output=True)
        if proc.returncode != 0:
            err_msg = proc.stderr.decode("utf-8", errors="replace")
            logger.error("ffmpeg_render_failed", stderr=err_msg[:500])
            qa_res = {"passed": False, "errors": [f"FFmpeg render failed: {err_msg[:300]}"]}
            qa_json_path.write_text(json.dumps(qa_res, indent=2), encoding="utf-8")
            return {
                "success": False,
                "final_path": None,
                "thumb_path": None,
                "qa": qa_res,
            }
    finally:
        # Guarantee no temporary mask/ring/shadow files remain after render
        for asset in temp_assets_to_clean:
            try:
                if asset.exists():
                    asset.unlink()
            except Exception:
                pass
        if scene_tmp_dir.exists():
            shutil.rmtree(scene_tmp_dir, ignore_errors=True)

    # 4. Generate thumbnail
    thumb_time = (expected_duration_s or 5.0) / 2.0
    extract_thumbnail(final_mp4, thumb_jpg, time_s=thumb_time)

    # 5. Run strict automated QA
    # Ground truth expected duration should match raw_video if downloaded media had fragment boundaries
    target_expected_duration = expected_duration_s
    if raw_video.exists():
        raw_dur = probe_media_duration(raw_video)
        if raw_dur and raw_dur > 0:
            target_expected_duration = raw_dur

    qa_res = run_clip_qa(final_mp4, expected_duration_s=target_expected_duration)
    qa_json_path.write_text(json.dumps(qa_res, indent=2), encoding="utf-8")

    return {
        "success": qa_res["passed"],
        "final_path": str(final_mp4),
        "thumb_path": str(thumb_jpg) if thumb_jpg.exists() else None,
        "qa": qa_res,
    }
