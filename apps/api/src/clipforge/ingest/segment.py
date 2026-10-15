"""Segment extraction and proxy generation for Freeform Canvas Studio."""

import asyncio
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

import structlog

from clipforge.core.config import settings
from clipforge.ingest.download import download_video_range

logger = structlog.get_logger(__name__)


def probe_local_video(file_path: Path) -> dict[str, Any]:
    """Extract width, height, fps, duration from a local video using ffprobe."""
    try:
        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(file_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(proc.stdout)
        v_stream: dict[str, Any] = next(
            (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
            {},
        )
        width = int(v_stream.get("width") or 1920)
        height = int(v_stream.get("height") or 1080)
        # Parse fps e.g. "30/1" or "29.97"
        fps_raw = v_stream.get("r_frame_rate", "30/1")
        if "/" in fps_raw:
            num, den = fps_raw.split("/")
            fps = float(num) / max(1.0, float(den))
        else:
            fps = float(fps_raw) if fps_raw else 30.0

        dur = float(
            v_stream.get("duration")
            or data.get("format", {}).get("duration")
            or 0.0
        )
        return {
            "width": width,
            "height": height,
            "fps": round(fps, 2),
            "duration": dur,
        }
    except Exception as exc:
        logger.warning("ffprobe_failed", file=str(file_path), error=str(exc))
        return {"width": 1920, "height": 1080, "fps": 30.0, "duration": 0.0}

# In-memory registry for in-flight segment preparation jobs
_SEGMENT_REGISTRY: dict[str, dict[str, Any]] = {}
_SEGMENT_LOCKS: dict[str, asyncio.Lock] = {}


def get_segment_id(source_url: str, start_s: float, end_s: float) -> str:
    """Generate a deterministic, idempotent segment identifier."""
    raw = f"{source_url.strip()}:{round(start_s, 2)}:{round(end_s, 2)}"
    return f"seg_{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:12]}"


def get_segment_dir(segment_id: str) -> Path:
    seg_dir = settings.data_dir / "segments" / segment_id
    seg_dir.mkdir(parents=True, exist_ok=True)
    return seg_dir


async def get_segment_status(segment_id: str) -> dict[str, Any]:
    """Retrieve segment preparation status and metadata."""
    seg_dir = get_segment_dir(segment_id)
    meta_path = seg_dir / "meta.json"
    full_path = seg_dir / "full.mp4"
    proxy_path = seg_dir / "proxy.mp4"

    # If already completed on disk
    if meta_path.exists() and full_path.exists() and proxy_path.exists():
        try:
            data: dict[str, Any] = json.loads(meta_path.read_text(encoding="utf-8"))
            if data.get("status") == "ready":
                return data
        except Exception:
            pass

    # In-memory status check
    if segment_id in _SEGMENT_REGISTRY:
        return dict(_SEGMENT_REGISTRY[segment_id])

    return {
        "segment_id": segment_id,
        "status": "not_found",
        "error": None,
    }


async def prepare_segment(
    source_url: str,
    start_s: float,
    end_s: float,
    job_id: str | None = None,
    cookies_path: Path | None = None,
) -> dict[str, Any]:
    """
    Ensure precise video segment and 720p GOP-30 preview proxy exist.
    Idempotent: returns existing segment if ready or in-progress.
    """
    segment_id = get_segment_id(source_url, start_s, end_s)
    seg_dir = get_segment_dir(segment_id)
    meta_path = seg_dir / "meta.json"
    full_path = seg_dir / "full.mp4"
    proxy_path = seg_dir / "proxy.mp4"

    # Quick check for existing ready files
    if meta_path.exists() and full_path.exists() and proxy_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if meta.get("status") == "ready":
                return dict(meta)
        except Exception:
            pass

    # Check if already running
    if segment_id in _SEGMENT_REGISTRY:
        reg = _SEGMENT_REGISTRY[segment_id]
        if reg.get("status") in ("queued", "downloading", "proxying"):
            return dict(reg)

    # Initialize status
    meta = {
        "segment_id": segment_id,
        "job_id": job_id,
        "source_url": source_url,
        "start_s": start_s,
        "end_s": end_s,
        "padding_before": 1.0,
        "status": "queued",
        "error": None,
        "full_width": None,
        "full_height": None,
        "proxy_width": None,
        "proxy_height": None,
        "fps": 30.0,
        "duration_s": max(1.0, end_s - start_s),
    }
    _SEGMENT_REGISTRY[segment_id] = meta

    async def _process_task() -> None:
        try:
            _SEGMENT_REGISTRY[segment_id]["status"] = "downloading"

            # Check if full VOD is already cached in project directory
            cached_full_vod: Path | None = None
            if job_id:
                potential_vod = settings.data_dir / "jobs" / job_id / "source" / "video.mp4"
                if potential_vod.exists() and potential_vod.stat().st_size > 1024:
                    cached_full_vod = potential_vod

            pad_s = 1.0
            actual_start = max(0.0, start_s - pad_s)
            actual_pad_before = start_s - actual_start

            # 1. Extract/download full segment
            if cached_full_vod:
                logger.info("Extracting segment from cached project VOD", segment_id=segment_id)
                dur = (end_s - start_s) + actual_pad_before + pad_s
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    f"{actual_start:.3f}",
                    "-t",
                    f"{dur:.3f}",
                    "-i",
                    str(cached_full_vod),
                    "-c:v",
                    "libx264",
                    "-crf",
                    "18",
                    "-preset",
                    "veryfast",
                    "-c:a",
                    "aac",
                    "-pix_fmt",
                    "yuv420p",
                    "-loglevel",
                    "error",
                    str(full_path),
                ]
                proc = await asyncio.to_thread(subprocess.run, cmd, capture_output=True)
                if proc.returncode != 0:
                    raise RuntimeError(
                        f"FFmpeg trim from cached VOD failed: {proc.stderr.decode('utf-8', errors='replace')}"
                    )
            else:
                logger.info("Downloading segment via yt-dlp partial range", segment_id=segment_id)
                await download_video_range(
                    source_url=source_url,
                    start_s=actual_start,
                    end_s=end_s + pad_s,
                    out_path=full_path,
                    pad_s=0.0,  # padding already accounted for
                    cookies_path=cookies_path or settings.cookies_file,
                )

            # Probe full segment metadata
            probe_meta = probe_local_video(full_path)
            full_w = probe_meta["width"]
            full_h = probe_meta["height"]
            fps = float(probe_meta["fps"])

            # 2. Generate 720p GOP-30 preview proxy
            _SEGMENT_REGISTRY[segment_id]["status"] = "proxying"
            logger.info("Generating preview proxy for segment", segment_id=segment_id)

            # Scale to 720p height preserving aspect ratio
            proxy_cmd = [
                "ffmpeg",
                "-y",
                "-i",
                str(full_path),
                "-vf",
                "scale=-2:720",
                "-c:v",
                "libx264",
                "-crf",
                "23",
                "-preset",
                "veryfast",
                "-g",
                "30",
                "-movflags",
                "+faststart",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-pix_fmt",
                "yuv420p",
                "-loglevel",
                "error",
                str(proxy_path),
            ]
            proxy_proc = await asyncio.to_thread(subprocess.run, proxy_cmd, capture_output=True)
            if proxy_proc.returncode != 0:
                raise RuntimeError(
                    f"Proxy generation failed: {proxy_proc.stderr.decode('utf-8', errors='replace')}"
                )

            proxy_meta = probe_local_video(proxy_path)
            proxy_w = proxy_meta["width"]
            proxy_h = proxy_meta["height"]

            result = {
                "segment_id": segment_id,
                "job_id": job_id,
                "source_url": source_url,
                "start_s": start_s,
                "end_s": end_s,
                "padding_before": actual_pad_before,
                "status": "ready",
                "error": None,
                "full_width": full_w,
                "full_height": full_h,
                "proxy_width": proxy_w,
                "proxy_height": proxy_h,
                "fps": fps,
                "duration_s": max(1.0, end_s - start_s),
            }
            meta_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
            _SEGMENT_REGISTRY[segment_id] = result
            logger.info("Segment preparation complete", segment_id=segment_id)

        except Exception as exc:
            logger.error("Segment preparation failed", segment_id=segment_id, error=str(exc))
            err_result = {
                "segment_id": segment_id,
                "job_id": job_id,
                "status": "failed",
                "error": str(exc),
            }
            _SEGMENT_REGISTRY[segment_id] = err_result
            try:
                meta_path.write_text(json.dumps(err_result, indent=2), encoding="utf-8")
            except Exception:
                pass

    asyncio.create_task(_process_task())
    return _SEGMENT_REGISTRY[segment_id]


async def open_file_range_stream(
    path: Path,
    range_header: str | None = None,
    content_type: str = "video/mp4",
) -> tuple[Any, dict[str, str], int]:
    """
    Parse HTTP Range header and return (async_generator, headers, status_code).
    Ensures smooth scrubbing across web browsers.
    """
    file_size = path.stat().st_size
    if not range_header:
        headers = {
            "Content-Length": str(file_size),
            "Content-Type": content_type,
            "Accept-Ranges": "bytes",
        }

        async def _full_stream() -> Any:
            with open(path, "rb") as f:
                while chunk := f.read(64 * 1024):
                    yield chunk

        return _full_stream(), headers, 200

    # Parse range: e.g. "bytes=0-1024" or "bytes=1024-"
    range_str = range_header.replace("bytes=", "").strip()
    parts = range_str.split("-")
    start = int(parts[0]) if parts[0] else 0
    end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1

    start = max(0, min(start, file_size - 1))
    end = max(start, min(end, file_size - 1))
    content_length = (end - start) + 1

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
        "Content-Type": content_type,
    }

    async def _range_stream() -> Any:
        with open(path, "rb") as f:
            f.seek(start)
            remaining = content_length
            chunk_size = 64 * 1024
            while remaining > 0:
                to_read = min(chunk_size, remaining)
                chunk = f.read(to_read)
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return _range_stream(), headers, 206
