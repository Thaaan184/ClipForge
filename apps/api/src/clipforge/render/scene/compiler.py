"""FFmpeg Scene Graph v1.1 filtergraph compiler."""

import math
from dataclasses import dataclass, field
from pathlib import Path

from clipforge.render.scene.geometry import calculate_rotw_roth
from clipforge.render.scene.masks import generate_gradient_background, generate_layer_assets
from clipforge.render.scene.schema import SceneGraph


@dataclass
class CompiledFiltergraph:
    input_args: list[str]
    filter_complex: str
    map_args: list[str]
    temp_assets: list[Path] = field(default_factory=list)


def escape_ffmpeg_filter_path(path: Path) -> str:
    """Escape file path for use in FFmpeg filter complex parameters."""
    p_str = str(path.resolve()).replace("\\", "/")
    return p_str.replace(":", "\\:").replace("'", "'\\\\''").replace("[", "\\[").replace("]", "\\]")


class FFmpegSceneCompiler:
    """Compiles SceneGraph v1.1 into deterministic FFmpeg filter_complex and input arguments."""

    def compile(
        self,
        scene: SceneGraph,
        source_video: Path,
        work_dir: Path,
        ass_path: Path | None = None,
        duration_s: float = 60.0,
        fps: float | None = None,
        fonts_dir: Path | None = None,
    ) -> CompiledFiltergraph:
        work_dir.mkdir(parents=True, exist_ok=True)
        temp_assets: list[Path] = []
        target_fps = fps or float(scene.canvas.fps)
        dur = max(0.1, duration_s)

        # 0. Primary video input
        input_args: list[str] = ["-i", str(source_video.resolve())]
        input_index = 1

        # Determine visible layers sorted by z-index
        visible_layers = [lyr for lyr in sorted(scene.layers, key=lambda lyr: lyr.transform.z) if lyr.visible]

        # Determine background type
        bg_type = scene.background.type
        needs_bg_split = bg_type == "blur_source"
        total_splits = (1 if needs_bg_split else 0) + len(visible_layers)

        filter_lines: list[str] = []

        # 1. Source video splitting
        if total_splits > 1:
            split_outputs = []
            if needs_bg_split:
                split_outputs.append("[bg_raw]")
            for idx in range(len(visible_layers)):
                split_outputs.append(f"[src_raw_{idx}]")
            filter_lines.append(f"[0:v]split={total_splits}{''.join(split_outputs)};")
        elif total_splits == 1:
            if needs_bg_split:
                filter_lines.append("[0:v]copy[bg_raw];")
            else:
                filter_lines.append("[0:v]copy[src_raw_0];")

        # 2. Base background construction
        current_canvas = "[bg]"
        if bg_type == "blur_source":
            sigma = max(1.0, float(scene.background.blur_sigma))
            filter_lines.append(
                f"[bg_raw]scale=1080:1920:force_original_aspect_ratio=increase,"
                f"crop=1080:1920,gblur=sigma={sigma:.1f}:steps=2,setsar=1{current_canvas};"
            )
        elif bg_type == "solid":
            color = scene.background.color.lstrip("#")
            filter_lines.append(
                f"color=c=0x{color}:s=1080x1920:r={target_fps}:d={dur:.3f},setsar=1{current_canvas};"
            )
        elif bg_type == "gradient":
            if scene.background.gradient:
                grad_path = work_dir / "bg_gradient.png"
                generate_gradient_background(scene.background.gradient, 1080, 1920, grad_path)
                temp_assets.append(grad_path)
                input_args.extend(["-loop", "1", "-framerate", str(target_fps), "-t", f"{dur:.3f}", "-i", str(grad_path.resolve())])
                grad_idx = input_index
                input_index += 1
                filter_lines.append(f"[{grad_idx}:v]scale=1080:1920,setsar=1{current_canvas};")
            else:
                filter_lines.append(f"color=c=0x0D0D0D:s=1080x1920:r={target_fps}:d={dur:.3f},setsar=1{current_canvas};")
        else:  # secondary_source or fallback
            filter_lines.append(f"color=c=0x000000:s=1080x1920:r={target_fps}:d={dur:.3f},setsar=1{current_canvas};")

        # 3. Layer rendering and compositing
        for idx, layer in enumerate(visible_layers):
            src_node = f"[src_raw_{idx}]" if total_splits > 1 else "[src_raw_0]"

            # Generate Pillow assets
            assets = generate_layer_assets(layer, work_dir=work_dir)
            temp_assets.append(assets.mask_path)
            if assets.ring_path:
                temp_assets.append(assets.ring_path)
            if assets.shadow_path:
                temp_assets.append(assets.shadow_path)

            # Mask input
            input_args.extend(["-loop", "1", "-framerate", str(target_fps), "-t", f"{dur:.3f}", "-i", str(assets.mask_path.resolve())])
            mask_idx = input_index
            input_index += 1

            # Optional shadow input
            shadow_idx: int | None = None
            if assets.shadow_path:
                input_args.extend(["-loop", "1", "-framerate", str(target_fps), "-t", f"{dur:.3f}", "-i", str(assets.shadow_path.resolve())])
                shadow_idx = input_index
                input_index += 1

            # Optional ring input
            ring_idx: int | None = None
            if assets.ring_path:
                input_args.extend(["-loop", "1", "-framerate", str(target_fps), "-t", f"{dur:.3f}", "-i", str(assets.ring_path.resolve())])
                ring_idx = input_index
                input_index += 1

            # Bounding box & transform
            bx = int(round(layer.shape.bbox.x))
            by = int(round(layer.shape.bbox.y))
            bw = int(round(layer.shape.bbox.w))
            bh = int(round(layer.shape.bbox.h))
            lw = int(round(layer.transform.w))
            lh = int(round(layer.transform.h))
            p = assets.padding

            # Cut and mask
            filter_lines.append(f"{src_node}crop={bw}:{bh}:{bx}:{by},scale={lw}:{lh},format=yuva444p[raw_{idx}];")
            filter_lines.append(f"[{mask_idx}:v]format=gray[m_{idx}];")
            filter_lines.append(f"[raw_{idx}][m_{idx}]alphamerge[cut_{idx}];")

            curr_node = f"[cut_{idx}]"

            # Composite shadow below video cut
            if shadow_idx is not None:
                filter_lines.append(
                    f"[{shadow_idx}:v]{curr_node}overlay={p}:{p}:format=auto:shortest=1[sh_cut_{idx}];"
                )
                curr_node = f"[sh_cut_{idx}]"

            # Composite border ring above video cut
            if ring_idx is not None:
                filter_lines.append(
                    f"{curr_node}[{ring_idx}:v]overlay=0:0:format=auto:shortest=1[ring_cut_{idx}];"
                )
                curr_node = f"[ring_cut_{idx}]"

            # Rotation and opacity
            total_w = lw + 2 * p
            total_h = lh + 2 * p
            angle = float(layer.transform.rotation)
            ow, oh = calculate_rotw_roth(total_w, total_h, angle)
            opacity = float(layer.style.opacity)

            if angle != 0.0:
                rad = angle * math.pi / 180.0
                filter_lines.append(
                    f"{curr_node}format=rgba,colorchannelmixer=aa={opacity:.4f},"
                    f"rotate={rad:.6f}:ow='rotw({rad:.6f})':oh='roth({rad:.6f})':c=none[rot_{idx}];"
                )
                layer_final_node = f"[rot_{idx}]"
            elif opacity < 1.0:
                filter_lines.append(
                    f"{curr_node}format=rgba,colorchannelmixer=aa={opacity:.4f}[lyr_{idx}];"
                )
                layer_final_node = f"[lyr_{idx}]"
            else:
                layer_final_node = curr_node

            # Center positioning
            ox = int(round(layer.transform.cx - ow / 2.0))
            oy = int(round(layer.transform.cy - oh / 2.0))

            next_canvas = f"[comp_{idx}]"
            filter_lines.append(
                f"{current_canvas}{layer_final_node}overlay={ox}:{oy}:format=auto:shortest=1{next_canvas};"
            )
            current_canvas = next_canvas

        # 4. Subtitle overlay
        if ass_path and ass_path.exists() and scene.subtitles.enabled:
            escaped_ass = escape_ffmpeg_filter_path(ass_path)
            ass_filter = f"ass='{escaped_ass}'"
            if fonts_dir and fonts_dir.exists():
                escaped_fonts = escape_ffmpeg_filter_path(fonts_dir)
                ass_filter += f":fontsdir='{escaped_fonts}'"
            filter_lines.append(f"{current_canvas}{ass_filter}[v_sub];")
            current_canvas = "[v_sub]"

        # 5. Final output format
        filter_lines.append(f"{current_canvas}format=yuv420p,setsar=1[v_out]")

        filter_complex = "\n".join(filter_lines)
        map_args = ["-map", "[v_out]", "-map", "0:a?"]

        return CompiledFiltergraph(
            input_args=input_args,
            filter_complex=filter_complex,
            map_args=map_args,
            temp_assets=temp_assets,
        )
