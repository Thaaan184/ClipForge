#!/usr/bin/env python3
"""
scripts/editorial_e2e.py - End-to-end runner for ClipForge v3 Editorial Studio pipeline.
Usage: python scripts/editorial_e2e.py <clip_id> [--style-pack gaming_hype] [--output <path>]
"""

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path("/home/ids/projects/clipforge")
sys.path.insert(0, str(PROJECT_ROOT / "apps/api/src"))

import aiosqlite
import structlog
from clipforge.core.config import settings
from clipforge.db.connection import get_db_connection
from clipforge.editorial.manifest import build_editorial_manifest
from clipforge.editorial.pipeline import (
    RENDER_SEMAPHORE,
    normalize_editorial_audio,
    run_editorial_final_qa,
)
from clipforge.editorial.worker_client import worker_client
from clipforge.editorial.workspace import (
    commit_workspace_version,
    get_workspace_dir,
    init_workspace,
)

logger = structlog.get_logger(__name__)


async def run_editorial_e2e(
    clip_id: str,
    style_pack: str = "gaming_hype",
    output_final: Path | None = None,
) -> dict:
    start_total = time.time()
    timings = {}

    print(f"\n=======================================================")
    print(f"🎬 Starting Editorial E2E for Clip: {clip_id}")
    print(f"=======================================================")

    # 1. Connect to DB and verify clip
    async with get_db_connection() as db:
        query = """
            SELECT c.id, c.editorial_source_path, c.video_path, c.duration_s,
                   cand.title, cand.start_s, cand.end_s
            FROM clips c
            JOIN candidates cand ON c.candidate_id = cand.id
            WHERE c.id = ?
        """
        async with db.execute(query, (clip_id,)) as cur:
            row = await cur.fetchone()
            if not row:
                raise ValueError(f"Clip not found in DB: {clip_id}")
            c_id, ed_path, v_path, duration_s, title, start_s, end_s = row

        ed_file = Path(ed_path) if ed_path else Path(v_path)
        if not ed_file.exists():
            raise FileNotFoundError(f"Source video file not found: {ed_file}")

        print(f"✓ Found clip: '{title}' ({duration_s}s)")
        print(f"  Source: {ed_file}")

        session_id = f"ed_e2e_{clip_id}_{int(time.time())}"

        # 2. Build Manifest
        t0 = time.time()
        manifest = await build_editorial_manifest(
            db=db,
            clip_id=clip_id,
            session_id=session_id,
            style_pack=style_pack,
        )
        timings["manifest_build_s"] = round(time.time() - t0, 3)
        print(f"✓ Manifest built in {timings['manifest_build_s']}s (Words: {len(manifest.transcript.get('words', []))}, Peaks: {len(manifest.signals.peaks)})")

        # 3. Init Workspace
        t0 = time.time()
        ws_info = init_workspace(
            session_id=session_id,
            clip_id=clip_id,
            editorial_source_path=ed_file,
            manifest=manifest,
        )
        timings["workspace_init_s"] = round(time.time() - t0, 3)
        ws_dir = Path(ws_info["workspace_dir"])
        print(f"✓ Workspace initialized at {ws_dir} (commit: {ws_info['commit_sha'][:8]})")

    # 4. Check Worker Health
    if not await worker_client.is_healthy():
        raise RuntimeError("Remotion worker is not responding on 127.0.0.1:8765")
    print(f"✓ Worker healthy on {worker_client.base_url}")

    # 5. Typecheck
    t0 = time.time()
    tc_res = await worker_client.typecheck(ws_dir)
    timings["typecheck_s"] = round(time.time() - t0, 3)
    if not tc_res.get("success"):
        raise RuntimeError(f"Typecheck failed: {tc_res.get('errors')}")
    print(f"✓ Typecheck passed in {timings['typecheck_s']}s")

    # 6. Render Still Frame at t=1.0s (frame 30)
    still_path = ws_dir / "still_frame_30.png"
    t0 = time.time()
    still_res = await worker_client.render_still(
        workspace_dir=ws_dir,
        output_path=still_path,
        frame=30,
    )
    timings["still_render_s"] = round(time.time() - t0, 3)
    print(f"✓ Still frame rendered at {still_path} in {timings['still_render_s']}s")

    # 7. Render Preview (540x960 fast mp4)
    preview_path = ws_dir / "preview_lowres.mp4"
    t0 = time.time()
    preview_res = await worker_client.render_preview(
        workspace_dir=ws_dir,
        output_path=preview_path,
        concurrency=2,
    )
    timings["preview_render_s"] = round(time.time() - t0, 3)
    print(f"✓ Preview rendered at {preview_path} in {timings['preview_render_s']}s")

    # 8. Render Final Raw Video (under semaphore)
    raw_final_path = ws_dir / "render_raw_final.mp4"
    t0 = time.time()
    async with RENDER_SEMAPHORE:
        render_res = await worker_client.render_final(
            workspace_dir=ws_dir,
            output_path=raw_final_path,
            concurrency=2,
        )
    timings["final_render_s"] = round(time.time() - t0, 3)
    print(f"✓ Final raw video rendered in {timings['final_render_s']}s")

    # 9. Audio Normalization (EBU R128)
    if not output_final:
        output_final = ws_dir / f"{clip_id}_editorial_final.mp4"

    t0 = time.time()
    norm_ok = normalize_editorial_audio(
        input_video=raw_final_path,
        output_video=output_final,
        target_i=-16.0,
        target_tp=-1.5,
        target_lra=11.0,
    )
    timings["audio_norm_s"] = round(time.time() - t0, 3)
    if not norm_ok:
        raise RuntimeError("Audio normalization failed")
    print(f"✓ EBU R128 audio normalization completed in {timings['audio_norm_s']}s")

    # 10. QA Inspection
    t0 = time.time()
    qa = run_editorial_final_qa(output_final, expected_duration_s=duration_s)
    timings["qa_inspection_s"] = round(time.time() - t0, 3)
    timings["total_duration_s"] = round(time.time() - start_total, 3)

    print(f"✓ Final QA passed: {qa['passed']}")
    print(f"  Checks: {qa['checks']}")
    print(f"  Loudness: {qa['details'].get('integrated_loudness_lufs')} LUFS (TP: {qa['details'].get('true_peak_db')} dBFS)")
    print(f"  SHA-256: {qa['sha256']}")
    print(f"  Total time: {timings['total_duration_s']}s")

    return {
        "clip_id": clip_id,
        "session_id": session_id,
        "output_path": str(output_final),
        "still_path": str(still_path),
        "preview_path": str(preview_path),
        "qa": qa,
        "timings": timings,
    }


def main():
    parser = argparse.ArgumentParser(description="ClipForge Editorial Studio E2E Pipeline")
    parser.add_argument("clip_id", help="Target clip ID")
    parser.add_argument("--style-pack", default="gaming_hype", help="Editorial style pack")
    parser.add_argument("--output", default=None, help="Output final path")
    args = parser.parse_args()

    out_path = Path(args.output) if args.output else None
    result = asyncio.run(
        run_editorial_e2e(
            clip_id=args.clip_id,
            style_pack=args.style_pack,
            output_final=out_path,
        )
    )
    print("\nResult JSON:")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
