"""Service for managing timeline artifacts and timeline API payloads."""

import json
from pathlib import Path
from typing import Any

import aiosqlite
import numpy as np

from clipforge.core.errors import JobNotFoundError
from clipforge.fusion.models import CandidateWindow
from clipforge.timeline.models import CandidatesResponse, TimelineResponse


def downsample_curve(values: list[float] | np.ndarray, max_points: int = 3600) -> list[float]:
    """
    Downsample a curve if length exceeds max_points for smooth browser UI rendering.
    Uses max pooling in buckets to preserve transient spikes.
    """
    if len(values) <= max_points:
        return [float(x) for x in values]

    arr = np.asarray(values, dtype=np.float32)
    bucket_size = int(np.ceil(len(arr) / max_points))
    num_buckets = int(np.ceil(len(arr) / bucket_size))

    res: list[float] = []
    for b in range(num_buckets):
        start = b * bucket_size
        end = min(len(arr), (b + 1) * bucket_size)
        if start < end:
            res.append(float(np.max(arr[start:end])))

    return res


def save_timeline_artifact(
    job_dir: Path,
    timeline_response: TimelineResponse,
) -> Path:
    timeline_file = job_dir / "timeline.json"
    timeline_file.write_text(timeline_response.model_dump_json(indent=2), encoding="utf-8")
    return timeline_file


async def get_timeline_for_job(
    job_id: str,
    db: aiosqlite.Connection,
    data_dir: Path,
    max_points: int = 3600,
) -> TimelineResponse:
    # 1. Check job exists
    async with db.execute(
        "SELECT id, duration_s, title FROM jobs WHERE id = ?", (job_id,)
    ) as cursor:
        row = await cursor.fetchone()
        if not row:
            raise JobNotFoundError(f"Job {job_id} not found")
        duration_s = float(row[1] or 0.0)
        title = str(row[2] or "")

    # 2. Check timeline.json artifact in job directory
    job_dir = data_dir / "jobs" / job_id
    timeline_file = job_dir / "timeline.json"

    if timeline_file.exists():
        try:
            data = json.loads(timeline_file.read_text(encoding="utf-8"))
            # Apply downsampling if needed
            raw_signals: dict[str, list[float]] = data.get("signals", {})
            sampled_signals = {
                k: downsample_curve(v, max_points=max_points) for k, v in raw_signals.items()
            }
            candidates = [CandidateWindow.model_validate(c) for c in data.get("candidates", [])]
            return TimelineResponse(
                job_id=job_id,
                duration_s=data.get("duration_s", duration_s),
                hop_s=data.get("hop_s", 1.0),
                signals=sampled_signals,
                candidates=candidates,
                metadata={"title": title},
            )
        except Exception:
            pass

    # 3. Fallback: query candidates from DB
    candidates_db = await get_candidates_for_job(job_id, db)
    return TimelineResponse(
        job_id=job_id,
        duration_s=duration_s,
        hop_s=1.0,
        signals={},
        candidates=candidates_db.candidates,
        metadata={"title": title},
    )


async def get_candidates_for_job(
    job_id: str,
    db: aiosqlite.Connection,
) -> CandidatesResponse:
    async with db.execute("SELECT id FROM jobs WHERE id = ?", (job_id,)) as cursor:
        if not await cursor.fetchone():
            raise JobNotFoundError(f"Job {job_id} not found")

    candidates: list[CandidateWindow] = []
    query = """
        SELECT c.id, c.rank, c.start_s, c.end_s, c.peak_s, c.signal_score, c.llm_score, c.final_score,
               c.category, c.title, c.hook_text, c.reason, c.evidence_json, c.flags_json,
               c.status, c.user_start_s, c.user_end_s, COALESCE(c.render_mode, 'preset'), sg.scene_json
        FROM candidates c
        LEFT JOIN scene_graphs sg ON c.id = sg.candidate_id
        WHERE c.job_id = ?
        ORDER BY c.rank ASC, c.final_score DESC
    """
    async with db.execute(query, (job_id,)) as cursor:
        async for r in cursor:
            evidence: dict[str, Any] = {}
            flags: list[str] = []
            try:
                evidence = json.loads(r[12])
            except Exception:
                pass
            try:
                flags = json.loads(r[13])
            except Exception:
                pass

            render_mode = r[17] or "preset"
            scene_raw = r[18]
            has_scene = False
            layer_count = 0
            if scene_raw:
                try:
                    s_data = json.loads(scene_raw)
                    layers = s_data.get("layers", [])
                    has_scene = True
                    layer_count = len(layers)
                except Exception:
                    pass

            candidates.append(
                CandidateWindow(
                    id=r[0],
                    rank=r[1] or 1,
                    start_s=float(r[2]),
                    end_s=float(r[3]),
                    peak_s=float(r[4]),
                    duration_s=round(float(r[3]) - float(r[2]), 2),
                    signal_score=float(r[5]),
                    llm_score=float(r[6]) if r[6] is not None else None,
                    final_score=float(r[7]),
                    category=r[8] or "highlight",
                    title=r[9] or "",
                    hook_text=r[10] or "",
                    reason=r[11] or "",
                    evidence=evidence,
                    flags=flags,
                    status=r[14] or "proposed",
                    user_start_s=r[15],
                    user_end_s=r[16],
                    render_mode=render_mode,
                    has_scene=has_scene,
                    scene_layer_count=layer_count,
                )
            )

    return CandidatesResponse(
        job_id=job_id,
        total_candidates=len(candidates),
        candidates=candidates,
    )
