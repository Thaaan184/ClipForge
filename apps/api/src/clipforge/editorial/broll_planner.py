"""B-Roll Asset Placement Planner for ClipForge v3 P5.

Matches video/image B-roll assets to transcript segments:
- Does not exceed segment duration.
- Avoids covering peak moments unless explicitly requested by user.
- Enforces safe margins and timing transitions.
"""

from typing import Any
from pydantic import BaseModel, Field
import structlog

logger = structlog.get_logger(__name__)


class BRollPlacement(BaseModel):
    asset_id: str
    asset_path: str
    asset_type: str  # video | image
    start_s: float
    duration_s: float
    end_s: float
    segment_text: str
    reason: str
    covers_peak: bool = False


def plan_broll_placements(
    assets: list[dict[str, Any]],
    transcript_words: list[dict[str, Any]],
    peaks: list[dict[str, Any]],
    clip_duration: float,
    allow_cover_peaks: bool = False,
) -> list[BRollPlacement]:
    """Plan non-conflicting B-roll placements aligned to context."""
    placements: list[BRollPlacement] = []

    # Filter b-roll assets (video or image)
    broll_assets = [
        a for a in assets
        if a.get("type") in ("video", "image") and not a.get("label", "").lower().startswith("logo")
    ]
    if not broll_assets or not transcript_words:
        return placements

    peak_times = [p.get("t", 0.0) for p in peaks]

    # Create word segments of 3-5 seconds
    segments: list[dict[str, Any]] = []
    seg_words: list[dict[str, Any]] = []
    seg_start = transcript_words[0].get("start", 0.0)

    for w in transcript_words:
        seg_words.append(w)
        w_end = w.get("end", 0.0)
        if (w_end - seg_start) >= 3.0:
            text = " ".join(item.get("w", "") for item in seg_words)
            segments.append({
                "start": seg_start,
                "end": w_end,
                "duration": round(w_end - seg_start, 2),
                "text": text,
            })
            seg_words = []
            seg_start = w_end

    if seg_words:
        w_end = seg_words[-1].get("end", seg_start + 2.0)
        text = " ".join(item.get("w", "") for item in seg_words)
        segments.append({
            "start": seg_start,
            "end": w_end,
            "duration": round(w_end - seg_start, 2),
            "text": text,
        })

    # Match each B-roll asset to the best non-overlapping segment
    used_windows: list[tuple[float, float]] = []

    for asset in broll_assets:
        label = asset.get("label", "").lower()
        hint = asset.get("hint", "").lower()
        query_words = set(label.split() + hint.split())

        best_seg = None
        best_score = -1

        for seg in segments:
            # Check overlap with already placed b-roll
            overlap = any(
                not (seg["end"] <= w[0] or seg["start"] >= w[1])
                for w in used_windows
            )
            if overlap:
                continue

            seg_tokens = set(seg["text"].lower().split())
            common = query_words.intersection(seg_tokens)
            score = len(common)

            # Check if this segment contains any peak
            has_peak = any(seg["start"] <= pt <= seg["end"] for pt in peak_times)

            if not allow_cover_peaks and has_peak:
                # Deprioritize or avoid covering peaks
                score -= 10

            if score > best_score:
                best_score = score
                best_seg = seg

        # If no specific keyword match found, choose first available non-peak segment
        if best_seg is None:
            for seg in segments:
                overlap = any(
                    not (seg["end"] <= w[0] or seg["start"] >= w[1])
                    for w in used_windows
                )
                has_peak = any(seg["start"] <= pt <= seg["end"] for pt in peak_times)
                if not overlap and (allow_cover_peaks or not has_peak):
                    best_seg = seg
                    break

        if best_seg:
            start_s = best_seg["start"]
            end_s = best_seg["end"]

            # Double check peak avoidance: if peak falls in window and not allowed, trim window
            if not allow_cover_peaks:
                for pt in peak_times:
                    if start_s <= pt <= end_s:
                        if (pt - start_s) >= 1.5:
                            # trim before peak
                            end_s = round(pt - 0.2, 2)
                        else:
                            # start after peak
                            start_s = round(pt + 0.3, 2)

            duration_s = round(max(0.0, end_s - start_s), 2)
            if duration_s >= 1.0:
                used_windows.append((start_s, end_s))
                placements.append(
                    BRollPlacement(
                        asset_id=asset.get("id", "asset"),
                        asset_path=asset.get("path", ""),
                        asset_type=asset.get("type", "video"),
                        start_s=start_s,
                        duration_s=duration_s,
                        end_s=end_s,
                        segment_text=best_seg["text"],
                        reason=f"Matched context '{best_seg['text'][:30]}...'",
                        covers_peak=any(start_s <= pt <= end_s for pt in peak_times),
                    )
                )

    return placements
