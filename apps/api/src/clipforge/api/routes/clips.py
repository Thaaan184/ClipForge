"""API routes for clip retrieval, video streaming, subtitle editing, and WYSIWYG preview."""

import json
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from clipforge.core.config import settings
from clipforge.core.logging import logger
from clipforge.db.connection import get_db
from clipforge.render.editorial_source import render_editorial_source
from clipforge.render.engine import render_single_clip
from clipforge.render.preview import render_subtitle_preview_frame
from clipforge.render.scene.schema import SceneGraph
from clipforge.subtitles import (
    SubtitleWord,
    create_kinetic_chunks,
    export_srt,
    generate_ass_script,
    load_style_preset,
    validate_and_normalize_words,
)

router = APIRouter(prefix="/api/clips", tags=["Clips"])


class ClipResponse(BaseModel):
    id: str
    candidate_id: str
    job_id: str
    status: str
    video_path: str | None = None
    thumb_path: str | None = None
    srt_path: str | None = None
    width: int = 1080
    height: int = 1920
    duration_s: float | None = None
    render_params: dict[str, Any] = Field(default_factory=dict)
    qa: dict[str, Any] | None = None
    created_at: str
    project_title: str | None = None
    editorial_source_path: str | None = None
    editorial_source_meta: dict[str, Any] | None = None


class FinishedClipResponse(BaseModel):
    id: str
    clip_id: str
    job_id: str | None = None
    project_title: str | None = None
    video_path: str
    thumb_path: str | None = None
    srt_path: str | None = None
    duration_s: float | None = None
    width: int = 1080
    height: int = 1920
    subtitles_json: str | None = None
    editorial_source_path: str | None = None
    editorial_source_meta: dict[str, Any] | None = None
    created_at: str
    updated_at: str


class SubtitlesUpdatePayload(BaseModel):
    words: list[SubtitleWord]
    style_preset: str | dict[str, Any] = "none"
    subtitle_position: str = "bottom"


class SubtitlesPreviewPayload(BaseModel):
    t_s: float = 1.0
    style_preset: str | dict[str, Any] = "none"
    reframe_mode: str = "blur"
    words: list[SubtitleWord] | None = None
    subtitle_position: str = "bottom"


def _normalize_style_preset(style: str | dict[str, Any] | None) -> str:
    if isinstance(style, dict):
        return str(style.get("preset", "none"))
    if isinstance(style, str) and style.strip():
        return style.strip()
    return "none"


async def sync_finished_clip(db: aiosqlite.Connection, clip_id: str) -> dict[str, Any] | None:
    """Copy rendered clip files to permanent storage and upsert to finished_clips."""
    query = """
        SELECT c.id, c.candidate_id, c.job_id, c.status, c.video_path, c.thumb_path, c.srt_path,
               c.width, c.height, c.duration_s, j.title, c.scene_json,
               c.editorial_source_path, c.editorial_source_meta_json
        FROM clips c
        LEFT JOIN jobs j ON c.job_id = j.id
        WHERE c.id = ?
    """
    async with db.execute(query, (clip_id,)) as cur:
        row = await cur.fetchone()
        if not row:
            return None

    (
        c_id,
        cand_id,
        job_id,
        status,
        video_path,
        thumb_path,
        srt_path,
        width,
        height,
        duration_s,
        j_title,
        scene_json,
        ed_path,
        ed_meta_json,
    ) = row

    # Permanent storage directory for finished clips
    perm_dir = settings.data_dir / "finished_clips" / clip_id
    perm_dir.mkdir(parents=True, exist_ok=True)

    final_video_path = video_path or ""
    if video_path:
        orig_video = Path(video_path)
        if orig_video.exists():
            perm_video = perm_dir / f"{clip_id}.mp4"
            try:
                if (
                    not perm_video.exists()
                    or orig_video.stat().st_mtime > perm_video.stat().st_mtime
                ):
                    shutil.copy2(orig_video, perm_video)
                final_video_path = str(perm_video)
            except Exception as exc:
                logger.warning("copy_finished_video_failed", clip_id=clip_id, error=str(exc))

    final_ed_path = ed_path or ""
    if ed_path and Path(ed_path).exists():
        perm_ed = perm_dir / f"{clip_id}_editorial_source.mp4"
        try:
            if not perm_ed.exists() or Path(ed_path).stat().st_mtime > perm_ed.stat().st_mtime:
                shutil.copy2(Path(ed_path), perm_ed)
            final_ed_path = str(perm_ed)
        except Exception:
            pass

    final_srt_path = srt_path or ""
    if srt_path and Path(srt_path).exists():
        perm_srt = perm_dir / f"{clip_id}.srt"
        try:
            shutil.copy2(Path(srt_path), perm_srt)
            final_srt_path = str(perm_srt)
        except Exception:
            pass

    # Fetch latest subtitle words
    words_json = "[]"
    async with db.execute(
        "SELECT id FROM subtitle_tracks WHERE clip_id = ? ORDER BY revision DESC LIMIT 1",
        (clip_id,),
    ) as cur:
        t_row = await cur.fetchone()
        if t_row:
            t_id = t_row[0]
            async with db.execute(
                "SELECT idx, start_s, end_s, text, confidence FROM subtitle_words WHERE track_id = ? ORDER BY idx ASC",
                (t_id,),
            ) as w_cur:
                w_rows = await w_cur.fetchall()
                words_list = [
                    {
                        "idx": r[0],
                        "start_s": r[1],
                        "end_s": r[2],
                        "text": r[3],
                        "confidence": r[4],
                    }
                    for r in w_rows
                ]
                words_json = json.dumps(words_list)

    now_iso = datetime.now(UTC).isoformat()
    project_title = j_title or (f"Proyek {job_id[:8]}" if job_id else "ClipForge Project")

    await db.execute(
        """
        INSERT INTO finished_clips (
            id, clip_id, job_id, project_title, video_path, thumb_path, srt_path,
            duration_s, width, height, subtitles_json, scene_json,
            editorial_source_path, editorial_source_meta_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            project_title = excluded.project_title,
            video_path = excluded.video_path,
            thumb_path = excluded.thumb_path,
            srt_path = excluded.srt_path,
            duration_s = excluded.duration_s,
            width = excluded.width,
            height = excluded.height,
            subtitles_json = excluded.subtitles_json,
            scene_json = excluded.scene_json,
            editorial_source_path = excluded.editorial_source_path,
            editorial_source_meta_json = excluded.editorial_source_meta_json,
            updated_at = excluded.updated_at
        """,
        (
            clip_id,
            clip_id,
            job_id,
            project_title,
            final_video_path,
            thumb_path,
            final_srt_path,
            duration_s,
            width or 1080,
            height or 1920,
            words_json,
            scene_json,
            final_ed_path,
            ed_meta_json,
            now_iso,
            now_iso,
        ),
    )
    await db.commit()

    return {
        "id": clip_id,
        "clip_id": clip_id,
        "job_id": job_id,
        "project_title": project_title,
        "video_path": final_video_path,
        "thumb_path": thumb_path,
        "srt_path": final_srt_path,
        "duration_s": duration_s,
        "width": width or 1080,
        "height": height or 1920,
        "subtitles_json": words_json,
        "created_at": now_iso,
        "updated_at": now_iso,
    }


@router.get("", response_model=list[ClipResponse])
async def list_all_clips(
    limit: int = 50, db: aiosqlite.Connection = Depends(get_db)
) -> list[ClipResponse]:
    """Retrieve all clips across all jobs with project title."""
    query = """
        SELECT c.id, c.candidate_id, c.job_id, c.status, c.video_path, c.thumb_path, c.srt_path,
               c.width, c.height, c.duration_s, c.render_params_json, c.qa_json, c.created_at,
               j.title, c.editorial_source_path, c.editorial_source_meta_json
        FROM clips c
        LEFT JOIN jobs j ON c.job_id = j.id
        ORDER BY c.created_at DESC
        LIMIT ?
    """
    async with db.execute(query, (limit,)) as cur:
        rows = await cur.fetchall()

    return [
        ClipResponse(
            id=r[0],
            candidate_id=r[1],
            job_id=r[2],
            status=r[3],
            video_path=r[4],
            thumb_path=r[5],
            srt_path=r[6],
            width=r[7] or 1080,
            height=r[8] or 1920,
            duration_s=r[9],
            render_params=json.loads(r[10]) if r[10] else {},
            qa=json.loads(r[11]) if r[11] else None,
            created_at=r[12],
            project_title=r[13],
            editorial_source_path=r[14] if len(r) > 14 else None,
            editorial_source_meta=json.loads(r[15]) if len(r) > 15 and r[15] else None,
        )
        for r in rows
    ]


@router.get("/finished", response_model=list[FinishedClipResponse])
async def list_finished_clips(
    db: aiosqlite.Connection = Depends(get_db),
) -> list[FinishedClipResponse]:
    """Retrieve all permanently finished and saved editorial clips."""
    # Auto-sync any completed editorial sessions not yet recorded in finished_clips
    try:
        async with db.execute(
            """
            SELECT es.id, es.clip_id, c.job_id, j.title, ev.final_path, c.duration_s, es.updated_at
            FROM editorial_sessions es
            LEFT JOIN clips c ON es.clip_id = c.id
            LEFT JOIN jobs j ON c.job_id = j.id
            LEFT JOIN editorial_versions ev ON es.id = ev.session_id AND es.current_version = ev.version_num
            WHERE es.status = 'DONE' AND es.clip_id NOT IN (SELECT clip_id FROM finished_clips WHERE clip_id IS NOT NULL)
            """
        ) as cur_sync:
            done_sessions = await cur_sync.fetchall()
            for ds in done_sessions:
                sess_id, c_id, j_id, j_title, f_path, dur, u_at = ds
                if c_id and f_path and Path(f_path).exists():
                    fc_id = f"fc_{c_id.replace('-', '')[:10]}"
                    await db.execute(
                        """
                        INSERT INTO finished_clips (
                            id, clip_id, job_id, project_title, video_path, thumb_path, srt_path,
                            duration_s, width, height, subtitles_json, created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, 1080, 1920, '[]', ?, ?)
                        """,
                        (fc_id, c_id, j_id, j_title or "ClipForge Proyek", f_path, dur or 40.0, u_at, u_at),
                    )
            if done_sessions:
                await db.commit()
    except Exception:
        pass

    query = """
        SELECT id, clip_id, job_id, project_title, video_path, thumb_path, srt_path,
               duration_s, width, height, subtitles_json, created_at, updated_at,
               editorial_source_path, editorial_source_meta_json
        FROM finished_clips
        ORDER BY updated_at DESC
    """
    async with db.execute(query) as cur:
        rows = await cur.fetchall()

    return [
        FinishedClipResponse(
            id=r[0],
            clip_id=r[1],
            job_id=r[2],
            project_title=r[3],
            video_path=r[4],
            thumb_path=r[5],
            srt_path=r[6],
            duration_s=r[7],
            width=r[8] or 1080,
            height=r[9] or 1920,
            subtitles_json=r[10],
            created_at=r[11],
            updated_at=r[12],
            editorial_source_path=r[13] if len(r) > 13 else None,
            editorial_source_meta=json.loads(r[14]) if len(r) > 14 and r[14] else None,
        )
        for r in rows
    ]


@router.get("/finished/{clip_id}/video")
async def stream_finished_clip_video(
    clip_id: str, db: aiosqlite.Connection = Depends(get_db)
) -> FileResponse:
    """Stream permanent finished MP4 video."""
    async with db.execute(
        "SELECT video_path FROM finished_clips WHERE id = ? OR clip_id = ?", (clip_id, clip_id)
    ) as cur:
        row = await cur.fetchone()
        if not row or not row[0]:
            raise HTTPException(status_code=404, detail="Finished clip video not found")

    video_path = Path(row[0])
    if not video_path.exists():
        # Fallback to clip directory
        async with db.execute("SELECT video_path FROM clips WHERE id = ?", (clip_id,)) as cur2:
            r2 = await cur2.fetchone()
            if r2 and r2[0] and Path(r2[0]).exists():
                video_path = Path(r2[0])
            else:
                raise HTTPException(status_code=404, detail="Finished video file missing on disk")

    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=f"{clip_id}.mp4",
    )


@router.get("/finished/{clip_id}/srt")
async def stream_finished_clip_srt(
    clip_id: str, db: aiosqlite.Connection = Depends(get_db)
) -> FileResponse:
    """Download permanent finished SRT."""
    async with db.execute(
        "SELECT srt_path FROM finished_clips WHERE id = ? OR clip_id = ?", (clip_id, clip_id)
    ) as cur:
        row = await cur.fetchone()
        if not row or not row[0]:
            raise HTTPException(status_code=404, detail="Finished clip SRT not found")

    srt_path = Path(row[0])
    if not srt_path.exists():
        raise HTTPException(status_code=404, detail="Finished SRT file missing on disk")

    return FileResponse(
        path=str(srt_path),
        media_type="text/plain",
        filename=f"{clip_id}.srt",
    )


@router.delete("/finished/{clip_id}")
async def delete_finished_clip(
    clip_id: str, db: aiosqlite.Connection = Depends(get_db)
) -> dict[str, str]:
    """Delete a finished clip permanently from the global repository."""
    async with db.execute(
        "SELECT id, clip_id FROM finished_clips WHERE id = ? OR clip_id = ?",
        (clip_id, clip_id),
    ) as cur:
        row = await cur.fetchone()

    if row:
        rec_id, target_clip_id = row[0], row[1]
        for cid in filter(None, [rec_id, target_clip_id, clip_id]):
            perm_dir = settings.data_dir / "finished_clips" / cid
            if perm_dir.exists():
                shutil.rmtree(perm_dir, ignore_errors=True)

    await db.execute("DELETE FROM finished_clips WHERE id = ? OR clip_id = ?", (clip_id, clip_id))
    await db.commit()
    return {"status": "deleted", "clip_id": clip_id}


@router.post("/{clip_id}/save")
async def save_clip_to_finished(
    clip_id: str, db: aiosqlite.Connection = Depends(get_db)
) -> dict[str, Any]:
    """Explicitly save and publish a clip into the permanent Hasil Klip repository."""
    res = await sync_finished_clip(db, clip_id)
    if not res:
        raise HTTPException(status_code=404, detail="Clip not found or not rendered yet")
    return {"status": "saved", "finished_clip": res}


@router.get("/{clip_id}", response_model=ClipResponse)
async def get_clip(clip_id: str, db: aiosqlite.Connection = Depends(get_db)) -> ClipResponse:
    """Fetch clip metadata and QA report."""
    query = """
        SELECT c.id, c.candidate_id, c.job_id, c.status, c.video_path, c.thumb_path, c.srt_path,
               c.width, c.height, c.duration_s, c.render_params_json, c.qa_json, c.created_at,
               j.title, c.editorial_source_path, c.editorial_source_meta_json
        FROM clips c
        LEFT JOIN jobs j ON c.job_id = j.id
        WHERE c.id = ?
    """
    async with db.execute(query, (clip_id,)) as cursor:
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Clip not found")

        render_params = json.loads(row[10]) if row[10] else {}
        qa = json.loads(row[11]) if row[11] else None
        ed_meta = json.loads(row[15]) if len(row) > 15 and row[15] else None

        return ClipResponse(
            id=row[0],
            candidate_id=row[1],
            job_id=row[2],
            status=row[3],
            video_path=row[4],
            thumb_path=row[5],
            srt_path=row[6],
            width=row[7] or 1080,
            height=row[8] or 1920,
            duration_s=row[9],
            render_params=render_params,
            qa=qa,
            created_at=row[12],
            project_title=row[13],
            editorial_source_path=row[14] if len(row) > 14 else None,
            editorial_source_meta=ed_meta,
        )


@router.get("/{clip_id}/video")
async def stream_clip_video(
    clip_id: str, db: aiosqlite.Connection = Depends(get_db)
) -> FileResponse:
    """Stream final rendered MP4 video with HTTP Range support."""
    async with db.execute("SELECT video_path FROM clips WHERE id = ?", (clip_id,)) as cursor:
        row = await cursor.fetchone()
        if not row or not row[0]:
            # Fallback to finished_clips
            async with db.execute(
                "SELECT video_path FROM finished_clips WHERE clip_id = ?", (clip_id,)
            ) as f_cur:
                f_row = await f_cur.fetchone()
                if f_row and f_row[0]:
                    row = f_row
                else:
                    raise HTTPException(status_code=404, detail="Clip video not found")

    video_path = Path(row[0])
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file missing on disk")

    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=f"{clip_id}.mp4",
    )


@router.get("/{clip_id}/thumb")
async def stream_clip_thumb(
    clip_id: str, db: aiosqlite.Connection = Depends(get_db)
) -> FileResponse:
    """Stream generated clip thumbnail image."""
    async with db.execute("SELECT thumb_path FROM clips WHERE id = ?", (clip_id,)) as cursor:
        row = await cursor.fetchone()
        if not row or not row[0]:
            async with db.execute(
                "SELECT thumb_path FROM finished_clips WHERE clip_id = ?", (clip_id,)
            ) as f_cur:
                f_row = await f_cur.fetchone()
                if f_row and f_row[0]:
                    row = f_row
                else:
                    raise HTTPException(status_code=404, detail="Clip thumbnail not found")

    thumb_path = Path(row[0])
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail file missing on disk")

    return FileResponse(
        path=str(thumb_path),
        media_type="image/jpeg",
        filename=f"{clip_id}_thumb.jpg",
    )


@router.get("/{clip_id}/subtitles")
async def get_clip_subtitles(
    clip_id: str, db: aiosqlite.Connection = Depends(get_db)
) -> dict[str, Any]:
    """Retrieve the latest subtitle track and words for a clip."""
    # Find latest track
    q_track = """
        SELECT id, revision, style_json, language
        FROM subtitle_tracks
        WHERE clip_id = ?
        ORDER BY revision DESC
        LIMIT 1
    """
    async with db.execute(q_track, (clip_id,)) as cursor:
        track_row = await cursor.fetchone()

    if not track_row:
        # Check finished_clips subtitles_json
        async with db.execute(
            "SELECT subtitles_json FROM finished_clips WHERE clip_id = ?", (clip_id,)
        ) as f_cur:
            f_row = await f_cur.fetchone()
            if f_row and f_row[0]:
                saved_words = json.loads(f_row[0])
                return {
                    "clip_id": clip_id,
                    "track_id": f"finished-{clip_id}",
                    "revision": 1,
                    "language": "id",
                    "style": {"preset": "none"},
                    "words": saved_words,
                }
        return {"clip_id": clip_id, "revision": 0, "words": [], "style": "none"}

    track_id, revision, style_json, language = (
        track_row[0],
        track_row[1],
        track_row[2],
        track_row[3],
    )

    # Fetch words
    q_words = """
        SELECT idx, start_s, end_s, text, confidence
        FROM subtitle_words
        WHERE track_id = ?
        ORDER BY idx ASC
    """
    words = []
    try:
        q_words_ext = """
            SELECT idx, start_s, end_s, text, confidence, speaker, pos_y
            FROM subtitle_words
            WHERE track_id = ?
            ORDER BY idx ASC
        """
        async with db.execute(q_words_ext, (track_id,)) as cursor:
            async for r in cursor:
                words.append(
                    {
                        "idx": r[0],
                        "start_s": r[1],
                        "end_s": r[2],
                        "text": r[3],
                        "confidence": r[4],
                        "speaker": r[5] if len(r) > 5 and r[5] else "speaker_1",
                        "pos_y": r[6] if len(r) > 6 else None,
                    }
                )
    except Exception:
        async with db.execute(q_words, (track_id,)) as cursor:
            async for r in cursor:
                words.append(
                    {
                        "idx": r[0],
                        "start_s": r[1],
                        "end_s": r[2],
                        "text": r[3],
                        "confidence": r[4],
                        "speaker": "speaker_1",
                        "pos_y": None,
                    }
                )

    return {
        "clip_id": clip_id,
        "track_id": track_id,
        "revision": revision,
        "language": language,
        "style": json.loads(style_json) if style_json else {},
        "words": words,
    }


@router.put("/{clip_id}/subtitles")
async def update_clip_subtitles(
    clip_id: str,
    payload: SubtitlesUpdatePayload,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Update words for a clip subtitle track, creating a new revision."""
    async with db.execute("SELECT job_id, duration_s FROM clips WHERE id = ?", (clip_id,)) as cur:
        c_row = await cur.fetchone()
        if not c_row:
            raise HTTPException(status_code=404, detail="Clip not found")
        job_id, clip_dur = c_row[0], c_row[1] or 30.0

    # Get max revision
    async with db.execute(
        "SELECT COALESCE(MAX(revision), 0) FROM subtitle_tracks WHERE clip_id = ?", (clip_id,)
    ) as cur:
        rev_row = await cur.fetchone()
        next_rev = (rev_row[0] if rev_row else 0) + 1

    preset_name = _normalize_style_preset(payload.style_preset)
    sub_pos = payload.subtitle_position or "bottom"
    track_id = str(uuid.uuid4())
    now_iso = datetime.now(UTC).isoformat()
    style_json = json.dumps({"preset": preset_name, "subtitle_position": sub_pos})

    # Validate words
    val_words = validate_and_normalize_words(payload.words, clip_duration_s=clip_dur)

    await db.execute(
        """
        INSERT INTO subtitle_tracks (id, clip_id, revision, source, language, style_json, created_at)
        VALUES (?, ?, ?, 'user_edit', 'id', ?, ?)
        """,
        (track_id, clip_id, next_rev, style_json, now_iso),
    )

    for w in val_words:
        try:
            await db.execute(
                """
                INSERT INTO subtitle_words (track_id, idx, start_s, end_s, text, confidence, speaker, pos_y)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (track_id, w.idx, w.start_s, w.end_s, w.text, w.confidence, w.speaker or "speaker_1", w.pos_y),
            )
        except Exception:
            await db.execute(
                """
                INSERT INTO subtitle_words (track_id, idx, start_s, end_s, text, confidence)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (track_id, w.idx, w.start_s, w.end_s, w.text, w.confidence),
            )

    await db.commit()

    # Re-generate subs.ass in clip folder
    clip_dir = settings.data_dir / "jobs" / job_id / "clips" / clip_id
    if clip_dir.exists():
        style_preset = load_style_preset(preset_name)
        chunks = create_kinetic_chunks(val_words)
        ass_content = generate_ass_script(chunks, style=style_preset, subtitle_position=sub_pos)
        (clip_dir / "subs.ass").write_text(ass_content, encoding="utf-8")
        (clip_dir / "clip.srt").write_text(export_srt(chunks), encoding="utf-8")

    # Automatically persist changes into finished_clips repository
    await sync_finished_clip(db, clip_id)

    return {
        "status": "updated",
        "clip_id": clip_id,
        "track_id": track_id,
        "revision": next_rev,
        "words_count": len(val_words),
    }


@router.post("/{clip_id}/subtitles/preview")
async def preview_subtitle_frame(
    clip_id: str,
    payload: SubtitlesPreviewPayload,
    db: aiosqlite.Connection = Depends(get_db),
) -> FileResponse:
    """Render a single WYSIWYG preview frame at t_s using the real FFmpeg ASS filter pipeline."""
    async with db.execute("SELECT job_id, video_path FROM clips WHERE id = ?", (clip_id,)) as cur:
        c_row = await cur.fetchone()
        if not c_row:
            raise HTTPException(status_code=404, detail="Clip not found")
        job_id = c_row[0]

    clip_dir = settings.data_dir / "jobs" / job_id / "clips" / clip_id
    raw_video = clip_dir / "raw.mp4"
    if not raw_video.exists():
        # Fallback to final video or raw
        if c_row[1] and Path(c_row[1]).exists():
            raw_video = Path(c_row[1])
        else:
            raise HTTPException(status_code=404, detail="Source video for preview not found")

    preset_name = _normalize_style_preset(payload.style_preset)
    has_subtitles = preset_name.lower() not in (
        "none",
        "off",
        "disable",
        "no_subtitles",
        "tanpa_subtitle",
    )

    preview_ass: Path | None = None
    if has_subtitles:
        style_preset = load_style_preset(preset_name)

        if payload.words is not None:
            words = validate_and_normalize_words(payload.words, clip_duration_s=60.0)
        else:
            # Load from current subs.ass if exists or DB
            words = []

        chunks = create_kinetic_chunks(words)
        sub_pos = payload.subtitle_position or "bottom"
        ass_content = generate_ass_script(chunks, style=style_preset, subtitle_position=sub_pos)

        p_ass = clip_dir / "preview.ass"
        p_ass.write_text(ass_content, encoding="utf-8")
        preview_ass = p_ass

    out_png = clip_dir / "preview.png"
    success = render_subtitle_preview_frame(
        raw_video=raw_video,
        ass_path=preview_ass,
        output_png=out_png,
        t_s=payload.t_s,
        mode=payload.reframe_mode,
        fonts_dir=clip_dir / "fonts",
    )

    if not success or not out_png.exists():
        raise HTTPException(status_code=500, detail="Failed to render preview frame")

    return FileResponse(path=str(out_png), media_type="image/png")


class RerenderClipRequest(BaseModel):
    reframe_mode: str | None = None
    subtitle_style: str | None = None
    subtitle_position: str | None = None


@router.post("/{clip_id}/rerender", response_model=ClipResponse)
async def rerender_clip(
    clip_id: str,
    payload: RerenderClipRequest | None = None,
    db: aiosqlite.Connection = Depends(get_db),
) -> ClipResponse:
    """Re-render clip with current subs.ass and reframe configuration."""
    async with db.execute(
        "SELECT job_id, render_params_json, scene_json FROM clips WHERE id = ?", (clip_id,)
    ) as cur:
        c_row = await cur.fetchone()
        if not c_row:
            raise HTTPException(status_code=404, detail="Clip not found")
        job_id, r_params_str, clip_scene_json = c_row[0], c_row[1], c_row[2]

    clip_dir = settings.data_dir / "jobs" / job_id / "clips" / clip_id
    raw_video = clip_dir / "raw.mp4"
    ass_file = clip_dir / "subs.ass"

    r_params = json.loads(r_params_str) if r_params_str else {}
    mode = (
        payload.reframe_mode
        if payload and payload.reframe_mode
        else r_params.get("reframe_mode", "blur")
    )

    clip_scene: SceneGraph | None = None
    if clip_scene_json:
        try:
            clip_scene = SceneGraph.model_validate_json(clip_scene_json)
        except Exception:
            clip_scene = None

    # Check latest subtitle track style or payload
    preset_name = payload.subtitle_style if payload and payload.subtitle_style else None
    if not preset_name:
        async with db.execute(
            "SELECT style_json FROM subtitle_tracks WHERE clip_id = ? ORDER BY revision DESC LIMIT 1",
            (clip_id,),
        ) as cur:
            st_row = await cur.fetchone()
            if st_row and st_row[0]:
                try:
                    style_data = json.loads(st_row[0])
                    if isinstance(style_data, dict) and style_data.get("preset"):
                        preset_name = str(style_data["preset"])
                    elif isinstance(style_data, str):
                        preset_name = style_data
                except Exception:
                    pass
    if not preset_name:
        preset_name = r_params.get("subtitle_style", "none")

    has_subtitles = preset_name.lower() not in (
        "none",
        "off",
        "disable",
        "no_subtitles",
        "tanpa_subtitle",
    )

    if not raw_video.exists():
        raise HTTPException(status_code=400, detail="Missing raw.mp4 for re-render")
    if has_subtitles and not ass_file.exists():
        raise HTTPException(status_code=400, detail="Missing subs.ass for re-render")

    render_result = render_single_clip(
        clip_dir=clip_dir,
        raw_video=raw_video,
        ass_path=ass_file if has_subtitles else None,
        mode=mode,
        scene_graph=clip_scene,
    )

    status_str = "done" if render_result["success"] else "failed"

    r_params["reframe_mode"] = mode
    r_params["subtitle_style"] = preset_name
    if payload and payload.subtitle_position:
        r_params["subtitle_position"] = payload.subtitle_position
    new_r_params_json = json.dumps(r_params)

    await db.execute(
        """
        UPDATE clips
        SET status = ?, video_path = ?, thumb_path = ?, qa_json = ?, render_params_json = ?
        WHERE id = ?
        """,
        (
            status_str,
            render_result["final_path"],
            render_result["thumb_path"],
            json.dumps(render_result["qa"]),
            new_r_params_json,
            clip_id,
        ),
    )
    await db.commit()

    # Automatically persist final re-rendered clip into finished_clips repository
    await sync_finished_clip(db, clip_id)

    return await get_clip(clip_id, db)


@router.get("/{clip_id}/subtitles.srt")
async def download_clip_srt(
    clip_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> FileResponse:
    """Download standard SRT subtitle file for this clip."""
    async with db.execute("SELECT srt_path FROM clips WHERE id = ?", (clip_id,)) as cur:
        row = await cur.fetchone()
        if not row or not row[0]:
            async with db.execute(
                "SELECT srt_path FROM finished_clips WHERE clip_id = ?", (clip_id,)
            ) as f_cur:
                f_row = await f_cur.fetchone()
                if f_row and f_row[0]:
                    row = f_row
                else:
                    raise HTTPException(status_code=404, detail="SRT file not found")

    srt_file = Path(row[0])
    if not srt_file.exists():
        raise HTTPException(status_code=404, detail="SRT file missing on disk")

    return FileResponse(
        path=str(srt_file),
        media_type="text/plain",
        filename=f"{clip_id}.srt",
    )


@router.get("/{clip_id}/scene")
async def get_clip_scene(
    clip_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve snapshot scene graph for a rendered clip."""
    async with db.execute("SELECT scene_json FROM clips WHERE id = ?", (clip_id,)) as cur:
        row = await cur.fetchone()
        if not row or not row[0]:
            async with db.execute(
                "SELECT scene_json FROM finished_clips WHERE clip_id = ?", (clip_id,)
            ) as f_cur:
                f_row = await f_cur.fetchone()
                if f_row and f_row[0]:
                    row = f_row
                else:
                    raise HTTPException(
                        status_code=404,
                        detail="Scene graph snapshot not found for this clip",
                    )
    res_data: dict[str, Any] = json.loads(row[0])
    return res_data


@router.put("/{clip_id}/scene")
async def update_clip_scene(
    clip_id: str,
    scene: SceneGraph,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Update snapshot scene graph for a rendered clip."""
    scene_json = scene.model_dump_json()
    await db.execute("UPDATE clips SET scene_json = ? WHERE id = ?", (scene_json, clip_id))
    await db.execute(
        "UPDATE finished_clips SET scene_json = ? WHERE clip_id = ?", (scene_json, clip_id)
    )
    await db.commit()
    return scene.model_dump()


class EditorialSourceRequest(BaseModel):
    reframe_mode: str | None = None


@router.post("/{clip_id}/editorial-source")
async def create_editorial_source(
    clip_id: str,
    payload: EditorialSourceRequest | None = None,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Render or re-render 9:16 editorial_source.mp4 without subtitles and without loudnorm."""
    async with db.execute(
        "SELECT job_id, render_params_json, duration_s, scene_json FROM clips WHERE id = ?", (clip_id,)
    ) as cur:
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Clip not found")
        job_id, r_params_str, duration_s, scene_json_str = row[0], row[1], row[2], row[3]

    clip_dir = settings.data_dir / "jobs" / job_id / "clips" / clip_id
    raw_video = clip_dir / "raw.mp4"
    if not raw_video.exists():
        raise HTTPException(status_code=400, detail="Missing raw.mp4 to render editorial source")

    r_params = json.loads(r_params_str) if r_params_str else {}
    mode = (
        payload.reframe_mode
        if payload and payload.reframe_mode
        else r_params.get("reframe_mode", "blur")
    )

    scene_graph = None
    if scene_json_str:
        try:
            scene_graph = SceneGraph.model_validate_json(scene_json_str)
        except Exception:
            pass

    res = render_editorial_source(
        clip_dir=clip_dir,
        raw_video=raw_video,
        mode=mode,
        expected_duration_s=duration_s,
        scene_graph=scene_graph,
    )

    if not res["success"] or not res["path"]:
        raise HTTPException(
            status_code=500,
            detail=f"Editorial source render failed: {res.get('qa', {}).get('errors')}",
        )

    ed_path = res["path"]
    ed_meta_json = json.dumps(res["metadata"])

    await db.execute(
        """
        UPDATE clips
        SET editorial_source_path = ?, editorial_source_meta_json = ?
        WHERE id = ?
        """,
        (ed_path, ed_meta_json, clip_id),
    )
    await db.commit()

    # Sync to finished_clips
    await sync_finished_clip(db, clip_id)

    return {
        "clip_id": clip_id,
        "status": "ready",
        "editorial_source_path": ed_path,
        "metadata": res["metadata"],
    }


@router.get("/{clip_id}/editorial-source")
async def stream_editorial_source_video(
    clip_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> FileResponse:
    """Stream clean 9:16 editorial_source.mp4."""
    async with db.execute(
        "SELECT editorial_source_path, job_id, render_params_json, duration_s FROM clips WHERE id = ?",
        (clip_id,),
    ) as cur:
        row = await cur.fetchone()
        if not row:
            async with db.execute(
                "SELECT editorial_source_path FROM finished_clips WHERE clip_id = ?", (clip_id,)
            ) as f_cur:
                f_row = await f_cur.fetchone()
                if f_row and f_row[0] and Path(f_row[0]).exists():
                    return FileResponse(f_row[0], media_type="video/mp4")
            raise HTTPException(status_code=404, detail="Clip not found")

    ed_path = row[0]
    if ed_path and Path(ed_path).exists():
        return FileResponse(ed_path, media_type="video/mp4")

    # If editorial_source hasn't been generated yet, generate on-the-fly from raw.mp4
    job_id, r_params_str, duration_s = row[1], row[2], row[3]
    clip_dir = settings.data_dir / "jobs" / job_id / "clips" / clip_id
    raw_video = clip_dir / "raw.mp4"
    if not raw_video.exists():
        raise HTTPException(
            status_code=404, detail="Editorial source not found and raw.mp4 missing"
        )

    r_params = json.loads(r_params_str) if r_params_str else {}
    mode = r_params.get("reframe_mode", "blur")

    res = render_editorial_source(
        clip_dir=clip_dir,
        raw_video=raw_video,
        mode=mode,
        expected_duration_s=duration_s,
    )
    if not res["success"] or not res["path"]:
        raise HTTPException(
            status_code=500, detail="Failed to generate editorial source on-the-fly"
        )

    await db.execute(
        """
        UPDATE clips
        SET editorial_source_path = ?, editorial_source_meta_json = ?
        WHERE id = ?
        """,
        (res["path"], json.dumps(res["metadata"]), clip_id),
    )
    await db.commit()
    await sync_finished_clip(db, clip_id)

    return FileResponse(res["path"], media_type="video/mp4")


@router.get("/{clip_id}/editorial-source/meta")
async def get_editorial_source_meta(
    clip_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve metadata and QA inspection result of editorial_source.mp4."""
    async with db.execute(
        "SELECT editorial_source_meta_json FROM clips WHERE id = ?", (clip_id,)
    ) as cur:
        row = await cur.fetchone()
        if not row or not row[0]:
            async with db.execute(
                "SELECT editorial_source_meta_json FROM finished_clips WHERE clip_id = ?",
                (clip_id,),
            ) as f_cur:
                f_row = await f_cur.fetchone()
                if f_row and f_row[0]:
                    row = f_row
                else:
                    raise HTTPException(
                        status_code=404,
                        detail="Editorial source metadata not found for this clip",
                    )
    return json.loads(row[0])
