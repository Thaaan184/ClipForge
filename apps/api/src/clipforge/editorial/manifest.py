"""Manifest builder for Editorial Studio v3.

Transforms clip, candidate, transcript, and signal data into a clip-relative manifest.json.
"""

import json
from pathlib import Path
from typing import Any

import aiosqlite
import structlog

from clipforge.core.config import settings
from clipforge.editorial.models import (
    EditorialManifest,
    ManifestAsset,
    ManifestClip,
    ManifestPeak,
    ManifestSafeZone,
    ManifestScout,
    ManifestScript,
    ManifestSignals,
    ManifestSilence,
    ManifestWord,
)

logger = structlog.get_logger(__name__)


async def build_editorial_manifest(
    db: aiosqlite.Connection,
    clip_id: str,
    session_id: str | None = None,
    style_pack: str = "gaming_hype",
    script_mode: str = "none",
    script_text: str = "",
) -> EditorialManifest:
    """Construct an EditorialManifest model from SQLite database and filesystem state."""
    # 1. Fetch clip, candidate, and job metadata
    query = """
        SELECT c.id, c.job_id, c.candidate_id, c.width, c.height, c.duration_s, c.editorial_source_path,
               cand.start_s, cand.end_s, cand.title, cand.hook_text, cand.category, cand.reason, cand.final_score,
               j.language, j.genre
        FROM clips c
        JOIN candidates cand ON c.candidate_id = cand.id
        JOIN jobs j ON c.job_id = j.id
        WHERE c.id = ?
    """
    async with db.execute(query, (clip_id,)) as cur:
        row = await cur.fetchone()
        if not row:
            raise ValueError(f"Clip not found: {clip_id}")

    (
        c_id,
        j_id,
        cand_id,
        width,
        height,
        duration_s,
        ed_path,
        start_s,
        end_s,
        title,
        hook,
        category,
        reason,
        score,
        language,
        genre,
    ) = row

    cand_duration = duration_s or max(0.1, end_s - start_s)

    # 2. Fetch transcript words (already clip-relative if in subtitle_words)
    words: list[ManifestWord] = []
    async with db.execute(
        """
        SELECT w.text, w.start_s, w.end_s, w.confidence
        FROM subtitle_words w
        JOIN subtitle_tracks t ON w.track_id = t.id
        WHERE t.clip_id = ?
        ORDER BY t.revision DESC, w.idx ASC
        """,
        (clip_id,),
    ) as cur:
        rows = await cur.fetchall()
        for r in rows:
            words.append(
                ManifestWord(
                    w=r[0],
                    start=round(float(r[1]), 3),
                    end=round(float(r[2]), 3),
                    conf=round(float(r[3] or 1.0), 3),
                )
            )

    # Fallback to job transcript if no clip words found
    if not words:
        transcript_file = settings.data_dir / "jobs" / j_id / "transcript.json"
        if transcript_file.exists():
            try:
                t_data = json.loads(transcript_file.read_text(encoding="utf-8"))
                for raw_w in t_data.get("words", []):
                    w_start = float(raw_w.get("start", raw_w.get("start_s", 0.0)))
                    w_end = float(raw_w.get("end", raw_w.get("end_s", 0.0)))
                    if w_end <= start_s or w_start >= end_s:
                        continue
                    rel_s = max(0.0, round(w_start - start_s, 3))
                    rel_e = min(cand_duration, round(w_end - start_s, 3))
                    words.append(
                        ManifestWord(
                            w=raw_w.get("word", raw_w.get("text", "")),
                            start=rel_s,
                            end=rel_e,
                            conf=float(raw_w.get("confidence", 1.0)),
                        )
                    )
            except Exception as exc:
                logger.warning(
                    "manifest_transcript_fallback_error",
                    clip_id=clip_id,
                    error=str(exc),
                )

    # 3. Compute VAD silences (gaps in speech)
    silences: list[ManifestSilence] = []
    if words:
        # Check starting gap
        if words[0].start > 0.4:
            silences.append(ManifestSilence(start=0.0, end=words[0].start))
        # Intermediate gaps
        for i in range(len(words) - 1):
            gap_start = words[i].end
            gap_end = words[i + 1].start
            if gap_end - gap_start >= 0.4:
                silences.append(
                    ManifestSilence(
                        start=round(gap_start, 3), end=round(gap_end, 3)
                    )
                )
        # Ending gap
        if cand_duration - words[-1].end >= 0.4:
            silences.append(
                ManifestSilence(
                    start=round(words[-1].end, 3),
                    end=round(cand_duration, 3),
                )
            )
    else:
        # If no words, entire duration is treated as silence for VAD
        silences.append(
            ManifestSilence(start=0.0, end=round(cand_duration, 3))
        )

    # 4. Fetch signals (peaks)
    peaks: list[ManifestPeak] = []
    signals_file = settings.data_dir / "jobs" / j_id / "signals.json"
    if signals_file.exists():
        try:
            s_data = json.loads(signals_file.read_text(encoding="utf-8"))
            raw_peaks = s_data.get("peaks", [])
            for p in raw_peaks:
                p_t = float(p.get("t", 0.0))
                if start_s <= p_t <= end_s:
                    peaks.append(
                        ManifestPeak(
                            t=round(p_t - start_s, 3),
                            score=float(p.get("score", 0.8)),
                            kinds=p.get("kinds", ["audio_onset"]),
                        )
                    )
        except Exception:
            pass

    # If no signals file, synthesize a peak at relative peak_s if available
    if not peaks:
        async with db.execute(
            "SELECT peak_s, signal_score FROM candidates WHERE id = ?",
            (cand_id,),
        ) as cur:
            cand_p = await cur.fetchone()
            if cand_p and cand_p[0] is not None:
                rel_peak = max(0.0, min(cand_duration, float(cand_p[0]) - start_s))
                peaks.append(
                    ManifestPeak(
                        t=round(rel_peak, 3),
                        score=float(cand_p[1] or 0.85),
                        kinds=["peak_moment"],
                    )
                )

    # 5. Fetch assets for session if session_id is provided
    assets: list[ManifestAsset] = []
    if session_id:
        async with db.execute(
            """
            SELECT id, type, path, label, hint, duration_s, bpm
            FROM editorial_assets
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (session_id,),
        ) as cur:
            a_rows = await cur.fetchall()
            for ar in a_rows:
                assets.append(
                    ManifestAsset(
                        id=ar[0],
                        type=ar[1],
                        path=ar[2],
                        label=ar[3] or "",
                        hint=ar[4] or "",
                        description="",
                        duration=float(ar[5] or 0.0),
                        bpm=float(ar[6]) if ar[6] is not None else None,
                    )
                )

    # 6. Assemble complete manifest
    manifest = EditorialManifest(
        manifest_version=1,
        clip=ManifestClip(
            id=c_id,
            source_job_id=j_id,
            duration=round(cand_duration, 3),
            fps=30,
            width=1080,
            height=1920,
            source_file="public/clip_source.mp4",
        ),
        transcript={
            "language": language or "id",
            "words": [w.model_dump() for w in words],
        },
        signals=ManifestSignals(
            peaks=peaks,
            vad_silences=silences,
        ),
        scout=ManifestScout(
            category=category or "gameplay_highlight",
            title=title or "Highlight",
            hook=hook or "",
            reason=reason or "",
            confidence=float(score or 0.9),
        ),
        assets=assets,
        style_pack=style_pack,
        script=ManifestScript(mode=script_mode, text=script_text),  # type: ignore
        safe_zone=ManifestSafeZone(),
    )

    return manifest


def save_manifest(manifest: EditorialManifest, path: Path) -> None:
    """Save EditorialManifest to a JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(manifest.model_dump(), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    logger.info("editorial_manifest_saved", path=str(path))
