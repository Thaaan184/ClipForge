"""Job management API endpoints."""

import asyncio
import json
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import aiosqlite
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from clipforge.core.config import settings
from clipforge.core.errors import HostNotAllowedError, InvalidUrlError, JobNotFoundError
from clipforge.core.logging import logger
from clipforge.db.connection import get_db
from clipforge.jobs.engine import engine
from clipforge.jobs.events import broadcaster
from clipforge.jobs.models import (
    AddManualClipsRequest,
    JobCreateRequest,
    JobEvent,
    JobResponse,
    JobStatus,
    ManualClipCreateRequest,
    ManualClipItem,
    StageName,
)
from clipforge.jobs.pipeline import (
    stage_analyze_signals,
    stage_fetch_signals,
    stage_fuse_candidates,
    stage_render_clips,
    stage_scout_rerank,
    stage_targeted_asr,
    stage_validate,
)
from clipforge.jobs.state_machine import transition_job_status
from clipforge.timeline.models import CandidatesResponse, TimelineResponse
from clipforge.timeline.service import get_candidates_for_job, get_timeline_for_job

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


def _validate_source_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise InvalidUrlError("Scheme must be https")
    if not parsed.hostname or parsed.hostname.lower() not in settings.allowed_hosts:
        raise HostNotAllowedError(f"Host '{parsed.hostname}' not in allowed hosts")


async def _execute_job_pipeline(job_id: str) -> None:
    """Execute pipeline stages: Validate -> Fetch Signals -> Analyze Signals -> Fuse Candidates."""
    from clipforge.db.connection import get_db_connection

    async with get_db_connection() as db:
        try:
            # Query initial job params
            async with db.execute(
                "SELECT source_url, genre, language FROM jobs WHERE id = ?", (job_id,)
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return
                source_url, genre, language = row[0], row[1], row[2]

            stage_input = {
                "job_id": job_id,
                "source_url": source_url,
                "genre": genre,
                "language": language,
            }

            stages: list[tuple[StageName, Any, float]] = [
                (StageName.VALIDATE, stage_validate, 0.15),
                (StageName.FETCH_SIGNALS, stage_fetch_signals, 0.35),
                (StageName.ANALYZE_SIGNALS, stage_analyze_signals, 0.55),
                (StageName.FUSE_CANDIDATES, stage_fuse_candidates, 0.70),
                (StageName.TARGETED_ASR, stage_targeted_asr, 0.85),
                (StageName.SCOUT_RERANK, stage_scout_rerank, 0.95),
            ]

            for stage_name, stage_fn, prog in stages:
                if engine.is_cancelled(job_id):
                    break
                success = await engine.run_stage(
                    db=db,
                    job_id=job_id,
                    stage=stage_name,
                    stage_fn=stage_fn,
                    stage_input=stage_input,
                    progress=prog,
                )
                if not success and not engine.is_cancelled(job_id):
                    raise RuntimeError(f"Stage {stage_name.value} execution failed")

            if engine.is_cancelled(job_id):
                await transition_job_status(db, job_id, JobStatus.CANCELLED)
            else:
                await transition_job_status(db, job_id, JobStatus.AWAITING_REVIEW, progress=1.0)

        except asyncio.CancelledError:
            await transition_job_status(db, job_id, JobStatus.CANCELLED)
        except Exception as e:
            logger.error("Job pipeline execution failed", job_id=job_id, error=str(e))
            await transition_job_status(
                db,
                job_id,
                JobStatus.FAILED,
                error_code="PIPELINE_ERROR",
                error_message=str(e),
            )


def parse_timestamp_to_seconds(ts: str | float | int) -> float:
    """Parse timestamp string (MM:SS, HH:MM:SS, seconds) into float seconds."""
    if isinstance(ts, (int, float)):
        return float(ts)
    s = str(ts).strip()
    if not s:
        raise ValueError("Timestamp cannot be empty")
    try:
        return float(s)
    except ValueError:
        pass
    parts = s.split(":")
    if len(parts) == 2:
        minutes = float(parts[0])
        seconds = float(parts[1])
        return minutes * 60.0 + seconds
    elif len(parts) == 3:
        hours = float(parts[0])
        minutes = float(parts[1])
        seconds = float(parts[2])
        return hours * 3600.0 + minutes * 60.0 + seconds
    raise ValueError(f"Invalid timestamp format: '{ts}'. Use MM:SS, HH:MM:SS, or seconds.")


async def _execute_manual_clips_batch(
    job_id: str,
    clip_items: list[tuple[float, float, str | None]],
    reframe_mode: str = "blur",
    subtitle_style: str = "none",
    subtitle_position: str = "bottom",
    previous_status: str | None = None,
) -> None:
    """
    Direct fast clip extraction pipeline for one or multiple manual timestamp clips:
    - Bypasses AI highlight detection, LLM scoring, and auto-clipping.
    - Directly extracts exact [start_s, end_s] segment for each clip item.
    - If subtitle_style is not 'none', runs targeted ASR on the segment.
    - Renders 9:16 vertical video and registers clip in DB.
    """
    from pathlib import Path
    from clipforge.api.routes.clips import sync_finished_clip
    from clipforge.asr.whisper import transcribe_clip_media
    from clipforge.db.connection import get_db_connection
    from clipforge.ingest.download import download_video_range
    from clipforge.ingest.probe import probe_video
    from clipforge.render.engine import render_single_clip
    from clipforge.subtitles import (
        create_kinetic_chunks,
        export_srt,
        generate_ass_script,
        load_style_preset,
        validate_and_normalize_words,
    )

    async with get_db_connection() as db:
        try:
            async with db.execute(
                "SELECT source_url, genre, language, title, video_id FROM jobs WHERE id = ?", (job_id,)
            ) as cur:
                row = await cur.fetchone()
                if not row:
                    return
                source_url, genre, language, cur_title, cur_video_id = row[0], row[1], row[2], row[3], row[4]

            # Fast metadata probe if title or video_id missing
            video_id = cur_video_id
            v_title = cur_title
            if not video_id or not v_title or v_title == "YouTube Video":
                try:
                    meta = await probe_video(source_url)
                    video_id = meta.video_id
                    v_title = meta.title
                except Exception as pe:
                    logger.warning("manual_probe_fallback", error=str(pe))
                    if not video_id:
                        try:
                            from clipforge.ingest.url import validate_and_canonicalize_url
                            _, video_id = validate_and_canonicalize_url(source_url)
                        except Exception:
                            video_id = None
                    if not v_title:
                        v_title = "YouTube Video"

            await db.execute(
                """
                UPDATE jobs
                SET video_id = ?, title = ?, progress = 0.10, stage = 'downloading', updated_at = ?
                WHERE id = ?
                """,
                (video_id, v_title, datetime.now(UTC).isoformat(), job_id),
            )
            await db.commit()

            # Find existing count of candidates to assign appropriate ranks
            async with db.execute(
                "SELECT COUNT(*) FROM candidates WHERE job_id = ?", (job_id,)
            ) as c_cur:
                c_row = await c_cur.fetchone()
                base_rank = (c_row[0] if c_row else 0) + 1

            job_dir = settings.data_dir / "jobs" / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            total_items = max(1, len(clip_items))
            rendered_any = False

            for idx, (start_s, end_s, custom_title) in enumerate(clip_items):
                if engine.is_cancelled(job_id):
                    break

                duration = max(1.0, round(end_s - start_s, 3))
                m_st, s_st = int(start_s // 60), int(start_s % 60)
                m_en, s_en = int(end_s // 60), int(end_s % 60)
                time_tag = f"[{m_st:02d}:{s_st:02d} - {m_en:02d}:{s_en:02d}]"
                clip_title = custom_title.strip() if custom_title and custom_title.strip() else f"{v_title} {time_tag}"

                clip_id = str(uuid.uuid4())
                cand_id = f"cand_manual_{clip_id[:8]}"
                clip_dir = job_dir / "clips" / clip_id
                clip_dir.mkdir(parents=True, exist_ok=True)
                raw_video = clip_dir / "raw.mp4"
                now_iso = datetime.now(UTC).isoformat()

                # Step progress
                frac_done = idx / total_items
                await db.execute(
                    """
                    UPDATE jobs
                    SET progress = ?, stage = 'downloading', updated_at = ?
                    WHERE id = ?
                    """,
                    (round(0.10 + frac_done * 0.85, 2), now_iso, job_id),
                )
                await db.commit()

                # Insert Candidate record
                await db.execute(
                    """
                    INSERT INTO candidates (
                        id, job_id, rank, start_s, end_s, peak_s, signal_score, llm_score,
                        final_score, category, title, hook_text, reason, evidence_json, status,
                        user_start_s, user_end_s
                    ) VALUES (?, ?, ?, ?, ?, ?, 1.0, 1.0, 1.0, 'manual', ?, ?, 'Manual timestamp cut', '{}', 'kept', ?, ?)
                    """,
                    (
                        cand_id,
                        job_id,
                        base_rank + idx,
                        start_s,
                        end_s,
                        start_s,
                        clip_title,
                        clip_title,
                        start_s,
                        end_s,
                    ),
                )
                await db.commit()

                # Download video range
                await download_video_range(
                    source_url=source_url,
                    start_s=start_s,
                    end_s=end_s,
                    out_path=raw_video,
                )

                if not raw_video.exists() or raw_video.stat().st_size < 1000:
                    logger.error("manual_segment_download_failed", clip_id=clip_id, start_s=start_s, end_s=end_s)
                    continue

                # Subtitle handling
                has_subtitles = subtitle_style.lower() not in (
                    "none",
                    "off",
                    "disable",
                    "no_subtitles",
                    "tanpa_subtitle",
                )
                ass_file: Path | None = None
                srt_file: Path = clip_dir / "clip.srt"

                if has_subtitles:
                    await db.execute(
                        "UPDATE jobs SET stage = 'targeted_asr', updated_at = ? WHERE id = ?",
                        (datetime.now(UTC).isoformat(), job_id),
                    )
                    await db.commit()

                    raw_words = transcribe_clip_media(raw_video)
                    val_words = validate_and_normalize_words(raw_words, clip_duration_s=duration)
                    chunks = create_kinetic_chunks(val_words)
                    style_preset = load_style_preset(subtitle_style)
                    ass_content = generate_ass_script(
                        chunks, style=style_preset, subtitle_position=subtitle_position
                    )

                    ass_file = clip_dir / "subs.ass"
                    ass_file.write_text(ass_content, encoding="utf-8")
                    srt_file.write_text(export_srt(chunks), encoding="utf-8")

                    track_id = str(uuid.uuid4())
                    await db.execute(
                        """
                        INSERT INTO subtitle_tracks (id, clip_id, revision, source, language, style_json, created_at)
                        VALUES (?, ?, 1, 'manual_asr', ?, ?, ?)
                        """,
                        (
                            track_id,
                            clip_id,
                            language,
                            json.dumps({
                                "preset": subtitle_style,
                                "subtitle_position": subtitle_position,
                            }),
                            now_iso,
                        ),
                    )
                    for w in val_words:
                        await db.execute(
                            """
                            INSERT INTO subtitle_words (track_id, idx, start_s, end_s, text, confidence)
                            VALUES (?, ?, ?, ?, ?, ?)
                            """,
                            (track_id, w.idx, w.start_s, w.end_s, w.text, w.confidence),
                        )
                    await db.commit()
                else:
                    srt_file.write_text("", encoding="utf-8")

                # Render 9:16 vertical clip
                await db.execute(
                    "UPDATE jobs SET stage = 'render_clips', updated_at = ? WHERE id = ?",
                    (datetime.now(UTC).isoformat(), job_id),
                )
                await db.commit()

                render_res = render_single_clip(
                    clip_dir=clip_dir,
                    raw_video=raw_video,
                    ass_path=ass_file if has_subtitles else None,
                    mode=reframe_mode,
                    expected_duration_s=duration,
                )

                if not render_res["success"]:
                    logger.error("manual_render_failed", clip_id=clip_id, errors=render_res.get("qa", {}).get("errors"))
                    continue

                rendered_any = True

                # Insert Clip
                r_params_json = json.dumps({
                    "reframe_mode": reframe_mode,
                    "subtitle_style": subtitle_style,
                    "subtitle_position": subtitle_position,
                })
                qa_json_str = json.dumps(render_res["qa"])
                await db.execute(
                    """
                    INSERT INTO clips (
                        id, candidate_id, job_id, status, video_path, thumb_path, srt_path,
                        width, height, duration_s, render_params_json, qa_json, created_at
                    ) VALUES (?, ?, ?, 'done', ?, ?, ?, 1080, 1920, ?, ?, ?, ?)
                    """,
                    (
                        clip_id,
                        cand_id,
                        job_id,
                        render_res["final_path"],
                        render_res["thumb_path"],
                        str(srt_file),
                        duration,
                        r_params_json,
                        qa_json_str,
                        now_iso,
                    ),
                )
                await db.commit()

                # Sync to finished_clips
                await sync_finished_clip(db, clip_id)

            if engine.is_cancelled(job_id):
                await transition_job_status(db, job_id, JobStatus.CANCELLED)
            elif rendered_any:
                target_status = JobStatus.DONE
                if previous_status == JobStatus.AWAITING_REVIEW.value:
                    async with db.execute(
                        "SELECT COUNT(*) FROM candidates WHERE job_id = ? AND status = 'kept' AND id NOT IN (SELECT candidate_id FROM clips WHERE job_id = ?)",
                        (job_id, job_id),
                    ) as unrendered_cur:
                        unrendered_row = await unrendered_cur.fetchone()
                        if unrendered_row and unrendered_row[0] > 0:
                            target_status = JobStatus.AWAITING_REVIEW

                await transition_job_status(db, job_id, target_status, progress=1.0)
            else:
                await transition_job_status(
                    db,
                    job_id,
                    JobStatus.FAILED,
                    error_code="MANUAL_CLIP_FAILED",
                    error_message="Semua klip gagal diekstrak atau dirender",
                )

        except asyncio.CancelledError:
            await transition_job_status(db, job_id, JobStatus.CANCELLED)
        except Exception as e:
            logger.error("manual_clip_pipeline_failed", job_id=job_id, error=str(e))
            await transition_job_status(
                db,
                job_id,
                JobStatus.FAILED,
                error_code="MANUAL_CLIP_ERROR",
                error_message=str(e),
            )


async def _execute_manual_clip_pipeline(
    job_id: str,
    start_s: float,
    end_s: float,
    reframe_mode: str = "blur",
    subtitle_style: str = "none",
    subtitle_position: str = "bottom",
) -> None:
    await _execute_manual_clips_batch(
        job_id=job_id,
        clip_items=[(start_s, end_s, None)],
        reframe_mode=reframe_mode,
        subtitle_style=subtitle_style,
        subtitle_position=subtitle_position,
    )


@router.post("/manual", status_code=status.HTTP_202_ACCEPTED, response_model=JobResponse)
async def create_manual_job(
    req: ManualClipCreateRequest,
    db: aiosqlite.Connection = Depends(get_db),
) -> JobResponse:
    """Create a new manual clipping job for exact timestamp segment(s) (bypasses auto-clipper)."""
    _validate_source_url(req.source_url)
    try:
        from clipforge.ingest.url import validate_and_canonicalize_url
        _, video_id = validate_and_canonicalize_url(req.source_url)
    except Exception:
        video_id = None

    clip_tuples: list[tuple[float, float, str | None]] = []
    if req.clips:
        for item in req.clips:
            try:
                start_s = parse_timestamp_to_seconds(item.start_time)
                end_s = parse_timestamp_to_seconds(item.end_time)
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))
            if start_s < 0:
                raise HTTPException(status_code=400, detail="Start time must be >= 0")
            if end_s <= start_s:
                raise HTTPException(status_code=400, detail="End time must be greater than start time")
            if end_s - start_s < 1.0:
                raise HTTPException(status_code=400, detail="Clip duration must be at least 1.0 second")
            clip_tuples.append((start_s, end_s, item.title))
    elif req.start_time is not None and req.end_time is not None:
        try:
            start_s = parse_timestamp_to_seconds(req.start_time)
            end_s = parse_timestamp_to_seconds(req.end_time)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        if start_s < 0:
            raise HTTPException(status_code=400, detail="Start time must be >= 0")
        if end_s <= start_s:
            raise HTTPException(status_code=400, detail="End time must be greater than start time")
        if end_s - start_s < 1.0:
            raise HTTPException(status_code=400, detail="Clip duration must be at least 1.0 second")
        clip_tuples.append((start_s, end_s, req.title))
    else:
        raise HTTPException(status_code=400, detail="No clip timestamps provided")

    job_id = str(uuid.uuid4())
    now_iso = datetime.now(UTC).isoformat()
    params_dict = {
        "manual": True,
        "clips": [
            {"start_s": s, "end_s": e, "title": t}
            for (s, e, t) in clip_tuples
        ],
        "reframe_mode": req.reframe_mode,
        "subtitle_style": req.subtitle_style,
        "subtitle_position": req.subtitle_position,
    }
    params_json = json.dumps(params_dict)

    video_title: str | None = req.title
    duration_s: float | None = None
    try:
        from clipforge.ingest.probe import probe_video
        meta = await asyncio.wait_for(
            probe_video(req.source_url, cookies_path=settings.cookies_file),
            timeout=8.0,
        )
        if meta:
            video_title = meta.title or video_title
            duration_s = meta.duration_s
            if not video_id:
                video_id = meta.video_id
    except Exception:
        pass

    if not duration_s:
        max_end = max([e for (_, e, _) in clip_tuples], default=60.0)
        duration_s = max_end + 10.0

    await db.execute(
        """
        INSERT INTO jobs (id, source_url, video_id, title, duration_s, genre, language, params_json, status, stage, progress, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?, 'awaiting_review', 1.0, ?, ?)
        """,
        (
            job_id,
            req.source_url,
            video_id,
            video_title,
            duration_s,
            req.language,
            params_json,
            JobStatus.AWAITING_REVIEW.value,
            now_iso,
            now_iso,
        ),
    )

    for idx, (c_start, c_end, c_label) in enumerate(clip_tuples):
        cand_id = f"cand_manual_{uuid.uuid4().hex[:8]}"
        c_title = c_label or f"Manual Clip #{idx + 1}"
        await db.execute(
            """
            INSERT INTO candidates (
                id, job_id, rank, start_s, end_s, peak_s, title, category,
                status, final_score, hook_text, evidence_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 'kept', ?, ?, '{}')
            """,
            (
                cand_id,
                job_id,
                idx + 1,
                c_start,
                c_end,
                c_start,
                c_title,
                round(0.99 - (idx * 0.01), 3),
                c_title,
            ),
        )
    await db.commit()

    return JobResponse(
        id=job_id,
        source_url=req.source_url,
        video_id=video_id,
        title=video_title,
        duration_s=duration_s,
        genre="manual",
        language=req.language,
        status=JobStatus.AWAITING_REVIEW,
        stage="awaiting_review",
        progress=1.0,
        created_at=now_iso,
        updated_at=now_iso,
    )


@router.post("/{job_id}/manual-clips", status_code=status.HTTP_200_OK)
@router.post("/{job_id}/clips", status_code=status.HTTP_200_OK)
async def add_manual_clips_to_job(
    job_id: str,
    req: AddManualClipsRequest,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Add one or more manual clips to an existing project/job without creating a new project."""
    async with db.execute(
        "SELECT id, source_url, genre, language, params_json, status, video_id, title FROM jobs WHERE id = ?",
        (job_id,),
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise JobNotFoundError(f"Job {job_id} not found")

    if not req.clips:
        raise HTTPException(status_code=400, detail="No clips provided")

    clip_tuples: list[tuple[float, float, str | None]] = []
    for item in req.clips:
        try:
            start_s = parse_timestamp_to_seconds(item.start_time)
            end_s = parse_timestamp_to_seconds(item.end_time)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        if start_s < 0:
            raise HTTPException(status_code=400, detail="Start time must be >= 0")
        if end_s <= start_s:
            raise HTTPException(status_code=400, detail="End time must be greater than start time")
        if end_s - start_s < 1.0:
            raise HTTPException(status_code=400, detail="Clip duration must be at least 1.0 second")
        clip_tuples.append((start_s, end_s, item.title))

    async with db.execute(
        "SELECT COALESCE(MAX(rank), 0) FROM candidates WHERE job_id = ?", (job_id,)
    ) as cur:
        max_r_row = await cur.fetchone()
        base_rank = max_r_row[0] if max_r_row else 0

    for idx, (c_start, c_end, c_label) in enumerate(clip_tuples):
        cand_id = f"cand_manual_{uuid.uuid4().hex[:8]}"
        c_title = c_label or f"Manual Clip #{base_rank + idx + 1}"
        await db.execute(
            """
            INSERT INTO candidates (
                id, job_id, rank, start_s, end_s, peak_s, title, category,
                status, final_score, hook_text, evidence_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 'kept', ?, ?, '{}')
            """,
            (
                cand_id,
                job_id,
                base_rank + idx + 1,
                c_start,
                c_end,
                c_start,
                c_title,
                round(0.99 - (idx * 0.01), 3),
                c_title,
            ),
        )

    now_iso = datetime.now(UTC).isoformat()
    await db.execute(
        "UPDATE jobs SET error_code = NULL, error_message = NULL, status = ?, progress = 1.0, stage = 'awaiting_review', updated_at = ? WHERE id = ?",
        (JobStatus.AWAITING_REVIEW.value, now_iso, job_id),
    )
    await db.commit()

    return {
        "status": "ok",
        "job_id": job_id,
        "clips_count": len(clip_tuples),
        "message": f"{len(clip_tuples)} klip manual berhasil ditambahkan ke tahap Review",
    }


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=JobResponse)
async def create_job(
    req: JobCreateRequest,
    db: aiosqlite.Connection = Depends(get_db),
) -> JobResponse:
    """Create a new clipping job and schedule pipeline execution."""
    _validate_source_url(req.source_url)
    try:
        from clipforge.ingest.url import validate_and_canonicalize_url
        _, video_id = validate_and_canonicalize_url(req.source_url)
    except Exception:
        video_id = None

    job_id = str(uuid.uuid4())
    now_iso = datetime.now(UTC).isoformat()
    params_json = req.model_dump_json()

    # If manual flag or timestamps are provided, execute fast manual pipeline
    is_manual = req.manual or (req.start_time is not None and req.end_time is not None)
    initial_status = JobStatus.RUNNING.value if is_manual else JobStatus.QUEUED.value

    await db.execute(
        """
        INSERT INTO jobs (id, source_url, video_id, genre, language, params_json, status, progress, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?)
        """,
        (
            job_id,
            req.source_url,
            video_id,
            "manual" if is_manual else req.genre,
            req.language,
            params_json,
            initial_status,
            now_iso,
            now_iso,
        ),
    )
    await db.commit()

    if is_manual:
        start_s = parse_timestamp_to_seconds(req.start_time or 0.0)
        end_s = parse_timestamp_to_seconds(req.end_time or 60.0)
        task = asyncio.create_task(
            _execute_manual_clip_pipeline(
                job_id=job_id,
                start_s=start_s,
                end_s=end_s,
                reframe_mode=req.reframe_mode,
                subtitle_style=req.subtitle_style,
                subtitle_position=req.subtitle_position,
            )
        )
    else:
        task = asyncio.create_task(_execute_job_pipeline(job_id))

    engine._active_tasks[job_id] = task

    return JobResponse(
        id=job_id,
        source_url=req.source_url,
        video_id=video_id,
        genre="manual" if is_manual else req.genre,
        language=req.language,
        status=JobStatus(initial_status),
        progress=0.0,
        created_at=now_iso,
        updated_at=now_iso,
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job_status(
    job_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> JobResponse:
    """Retrieve full details of a specific job."""
    async with db.execute(
        """
        SELECT id, source_url, video_id, title, duration_s, genre, language,
               status, stage, progress, error_code, error_message,
               created_at, updated_at, finished_at
        FROM jobs WHERE id = ?
        """,
        (job_id,),
    ) as cursor:
        row = await cursor.fetchone()
        if not row:
            raise JobNotFoundError(f"Job {job_id} not found")

        v_id = row[2]
        if not v_id:
            try:
                from clipforge.ingest.url import validate_and_canonicalize_url
                _, v_id = validate_and_canonicalize_url(row[1])
            except Exception:
                v_id = None

        return JobResponse(
            id=row[0],
            source_url=row[1],
            video_id=v_id,
            title=row[3],
            duration_s=row[4],
            genre=row[5],
            language=row[6],
            status=JobStatus(row[7]),
            stage=row[8],
            progress=row[9],
            error_code=row[10],
            error_message=row[11],
            created_at=row[12],
            updated_at=row[13],
            finished_at=row[14],
        )


@router.post("/{job_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_job(
    job_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, str]:
    """Idempotently cancel a job."""
    async with db.execute("SELECT status FROM jobs WHERE id = ?", (job_id,)) as cursor:
        row = await cursor.fetchone()
        if not row:
            raise JobNotFoundError(f"Job {job_id} not found")
        current_status = JobStatus(row[0])

    if current_status in {JobStatus.DONE, JobStatus.FAILED, JobStatus.CANCELLED}:
        return {"status": current_status.value, "message": "Job already terminated"}

    engine.request_cancel(job_id)
    await transition_job_status(db, job_id, JobStatus.CANCELLED)
    return {"status": JobStatus.CANCELLED.value, "message": "Job cancelled successfully"}


@router.delete("/{job_id}", status_code=status.HTTP_200_OK)
async def delete_job(
    job_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, str]:
    """Delete a job, its database records, and its files on disk."""
    async with db.execute("SELECT id FROM jobs WHERE id = ?", (job_id,)) as cursor:
        row = await cursor.fetchone()
        if not row:
            raise JobNotFoundError(f"Job {job_id} not found")

    # Cancel active tasks if running
    engine.request_cancel(job_id)
    active_task = engine._active_tasks.pop(f"render_{job_id}", None)
    if active_task and not active_task.done():
        active_task.cancel()

    # Clean up disk files
    try:
        import shutil

        from clipforge.jobs.pipeline import get_job_dir

        job_dir = get_job_dir(job_id)
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
    except Exception as exc:
        logger.warning("failed_to_delete_job_files", job_id=job_id, error=str(exc))

    # Clean up DB records in child tables
    await db.execute(
        "DELETE FROM subtitle_words WHERE track_id IN (SELECT id FROM subtitle_tracks WHERE clip_id IN (SELECT id FROM clips WHERE job_id = ?))",
        (job_id,),
    )
    await db.execute(
        "DELETE FROM subtitle_tracks WHERE clip_id IN (SELECT id FROM clips WHERE job_id = ?)",
        (job_id,),
    )
    await db.execute("DELETE FROM clips WHERE job_id = ?", (job_id,))
    await db.execute("DELETE FROM candidates WHERE job_id = ?", (job_id,))
    await db.execute("DELETE FROM stage_runs WHERE job_id = ?", (job_id,))
    await db.execute("DELETE FROM events WHERE job_id = ?", (job_id,))
    await db.execute("DELETE FROM feedback WHERE job_id = ?", (job_id,))
    await db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    await db.commit()

    return {"status": "deleted", "job_id": job_id}


@router.get("/{job_id}/events")
async def stream_job_events(
    job_id: str,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    db: aiosqlite.Connection = Depends(get_db),
) -> StreamingResponse:
    """Stream SSE events for a job with Last-Event-ID replay and 15s heartbeats."""
    async with db.execute("SELECT id FROM jobs WHERE id = ?", (job_id,)) as cursor:
        row = await cursor.fetchone()
        if not row:
            raise JobNotFoundError(f"Job {job_id} not found")

    queue = await broadcaster.subscribe(job_id)

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            # Replay historical events if Last-Event-ID provided
            if last_event_id and last_event_id.isdigit():
                replay_list = await broadcaster.replay_events_since(db, job_id, int(last_event_id))
                for ev in replay_list:
                    yield f"id: {ev.id}\nevent: {ev.type}\ndata: {json.dumps(ev.payload)}\n\n"

            while True:
                try:
                    ev_live: JobEvent = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"id: {ev_live.id}\nevent: {ev_live.type}\ndata: {json.dumps(ev_live.payload)}\n\n"
                except TimeoutError:
                    # Heartbeat comment to keep connection alive
                    yield ": ping\n\n"
        finally:
            await broadcaster.unsubscribe(job_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{job_id}/timeline", response_model=TimelineResponse)
async def get_job_timeline(
    job_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> TimelineResponse:
    """Retrieve multi-modal signal curves and candidate windows for a job."""
    return await get_timeline_for_job(job_id=job_id, db=db, data_dir=settings.data_dir)


@router.get("/{job_id}/candidates", response_model=CandidatesResponse)
async def get_job_candidates(
    job_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> CandidatesResponse:
    """Retrieve proposed candidate windows and signal evidence for review."""
    return await get_candidates_for_job(job_id=job_id, db=db)


class CandidateUpdatePayload(BaseModel):
    status: str | None = None  # kept | rejected | proposed
    user_start_s: float | None = None
    user_end_s: float | None = None


@router.patch("/candidates/{candidate_id}")
async def update_candidate_review(
    candidate_id: str,
    payload: CandidateUpdatePayload,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Update review status or manual timing boundaries for a candidate."""
    async with db.execute(
        "SELECT id, start_s, end_s FROM candidates WHERE id = ?", (candidate_id,)
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Candidate not found")

    updates = []
    params: list[Any] = []

    if payload.status is not None:
        updates.append("status = ?")
        params.append(payload.status)

    if payload.user_start_s is not None:
        updates.append("user_start_s = ?")
        params.append(payload.user_start_s)

    if payload.user_end_s is not None:
        updates.append("user_end_s = ?")
        params.append(payload.user_end_s)

    if updates:
        params.append(candidate_id)
        await db.execute(f"UPDATE candidates SET {', '.join(updates)} WHERE id = ?", tuple(params))
        await db.commit()

    return {"status": "updated", "candidate_id": candidate_id}


class TriggerRenderRequest(BaseModel):
    candidate_ids: list[str] | None = None
    reframe_mode: str | None = None
    subtitle_style: str | None = None
    subtitle_position: str | None = None


@router.post("/{job_id}/render", status_code=status.HTTP_202_ACCEPTED)
async def trigger_job_render(
    job_id: str,
    payload: TriggerRenderRequest | None = None,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Trigger rendering for approved/kept candidate clips in this job."""
    async with db.execute(
        "SELECT id, source_url, genre, language, params_json, status FROM jobs WHERE id = ?",
        (job_id,),
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise JobNotFoundError(f"Job {job_id} not found")
        source_url, genre, language, params_json, current_status = (
            row[1],
            row[2],
            row[3],
            row[4],
            row[5],
        )

    # Double Render Protection / Idempotency
    if current_status == JobStatus.RENDERING.value or f"render_{job_id}" in engine._active_tasks:
        existing_task = engine._active_tasks.get(f"render_{job_id}")
        if existing_task and not existing_task.done():
            return {
                "status": "rendering",
                "job_id": job_id,
                "message": "Render task already in progress",
            }

    params = json.loads(params_json) if params_json else {}
    req_cand_ids = payload.candidate_ids if payload else None
    req_reframe = (payload.reframe_mode if payload else None) or params.get("reframe_mode", "blur")
    req_style = (payload.subtitle_style if payload else None) or params.get(
        "subtitle_style", "classic_white"
    )
    req_position = (payload.subtitle_position if payload else None) or params.get(
        "subtitle_position", "bottom"
    )

    stage_input: dict[str, Any] = {
        "job_id": job_id,
        "source_url": source_url,
        "genre": genre,
        "language": language,
        "clip_count": params.get("clip_count", 5),
        "reframe_mode": req_reframe,
        "subtitle_style": req_style,
        "subtitle_position": req_position,
        "candidate_ids": req_cand_ids,
    }

    # Reset errors and transition to RENDERING
    await db.execute(
        "UPDATE jobs SET error_code = NULL, error_message = NULL WHERE id = ?", (job_id,)
    )
    await db.commit()

    await transition_job_status(db, job_id, JobStatus.RENDERING, progress=0.80)

    async def _run_render_task() -> None:
        from clipforge.db.connection import get_db_connection

        async with get_db_connection() as task_db:
            try:
                success = await engine.run_stage(
                    db=task_db,
                    job_id=job_id,
                    stage=StageName.RENDER_CLIPS,
                    stage_fn=stage_render_clips,
                    stage_input=stage_input,
                    progress=1.0,
                    force=True,
                )
                if success:
                    await transition_job_status(task_db, job_id, JobStatus.DONE, progress=1.0)
                else:
                    await transition_job_status(
                        task_db,
                        job_id,
                        JobStatus.FAILED,
                        error_code="RENDER_FAILED",
                        error_message="Stage render_clips returned failure without output files",
                    )
            except Exception as exc:
                logger.error("Render execution failed", job_id=job_id, error=str(exc))
                await transition_job_status(
                    task_db,
                    job_id,
                    JobStatus.FAILED,
                    error_code="RENDER_FAILED",
                    error_message=str(exc),
                )
            finally:
                engine._active_tasks.pop(f"render_{job_id}", None)

    task = asyncio.create_task(_run_render_task())
    engine._active_tasks[f"render_{job_id}"] = task
    return {"status": "rendering", "job_id": job_id}


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    limit: int = 10,
    db: aiosqlite.Connection = Depends(get_db),
) -> list[JobResponse]:
    """List recent jobs."""
    query = """
        SELECT id, source_url, video_id, title, duration_s, genre, language,
               status, stage, progress, error_code, error_message,
               created_at, updated_at, finished_at
        FROM jobs
        ORDER BY created_at DESC
        LIMIT ?
    """
    results: list[JobResponse] = []
    async with db.execute(query, (limit,)) as cursor:
        async for row in cursor:
            v_id = row[2]
            if not v_id:
                try:
                    from clipforge.ingest.url import validate_and_canonicalize_url
                    _, v_id = validate_and_canonicalize_url(row[1])
                except Exception:
                    v_id = None

            results.append(
                JobResponse(
                    id=row[0],
                    source_url=row[1],
                    video_id=v_id,
                    title=row[3],
                    duration_s=row[4],
                    genre=row[5],
                    language=row[6],
                    status=JobStatus(row[7]),
                    stage=row[8],
                    progress=row[9],
                    error_code=row[10],
                    error_message=row[11],
                    created_at=row[12],
                    updated_at=row[13],
                    finished_at=row[14],
                )
            )
    return results


@router.get("/{job_id}/clips")
async def get_job_clips(
    job_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Get all rendered clips for a given job."""
    query = """
        SELECT id, candidate_id, video_path, srt_path, duration_s, width, height,
               status, qa_json, created_at
        FROM clips
        WHERE job_id = ?
        ORDER BY created_at ASC
    """
    clips: list[dict[str, Any]] = []
    async with db.execute(query, (job_id,)) as cur:
        async for r in cur:
            qa_rep = json.loads(r[8]) if r[8] else None
            clips.append(
                {
                    "id": r[0],
                    "job_id": job_id,
                    "candidate_id": r[1],
                    "file_path": r[2],
                    "srt_path": r[3],
                    "duration_s": r[4],
                    "width": r[5],
                    "height": r[6],
                    "status": r[7],
                    "qa": qa_rep,
                    "created_at": r[9],
                }
            )
    return {"clips": clips, "total": len(clips)}
