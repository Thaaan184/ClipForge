"""Script Aligner & Beat Sheet Generator for ClipForge v3 P5.

Aligns user-submitted script text against ASR transcript words:
- Modes:
  - 'strict' ('ikuti persis'): Replaces caption text with script words while preserving word timing.
  - 'guide' ('jadikan panduan'): Matches thematic beats without forcing verbatim caption override.
- Generates structured Beat Sheet with timestamped segments and confidence scores.
- Flags unaligned script lines for user review.
"""

import re
from difflib import SequenceMatcher
from typing import Any, Literal
from pydantic import BaseModel, Field
import structlog

logger = structlog.get_logger(__name__)


class ScriptBeat(BaseModel):
    index: int
    line_text: str
    start_s: float
    end_s: float
    confidence: float
    aligned: bool
    matched_transcript: str = ""
    target_action: str = "caption"  # caption | hook | callout | broll


class BeatSheet(BaseModel):
    mode: Literal["strict", "guide", "none"] = "guide"
    alignment_rate: float
    total_lines: int
    aligned_lines: int
    beats: list[ScriptBeat]
    unaligned_lines: list[str] = Field(default_factory=list)


def clean_token(text: str) -> str:
    """Normalize token by removing punctuation and lowercasing."""
    cleaned = re.sub(r"^[\s#*\-\d.]+", "", text)
    cleaned = re.sub(r"[^\w\s]", "", cleaned).lower().strip()
    return cleaned


def align_script_to_transcript(
    script_text: str,
    transcript_words: list[dict[str, Any]],
    mode: Literal["strict", "guide"] = "strict",
    clip_duration: float = 30.0,
) -> BeatSheet:
    """Align script lines with timestamped words using token sequence alignment."""
    # Split script into non-empty lines
    raw_lines = [line.strip() for line in script_text.splitlines() if line.strip()]
    if not raw_lines:
        return BeatSheet(
            mode=mode,
            alignment_rate=0.0,
            total_lines=0,
            aligned_lines=0,
            beats=[],
            unaligned_lines=[],
        )

    if not transcript_words:
        # Fallback if no transcript: evenly distribute beats across duration
        step = clip_duration / max(len(raw_lines), 1)
        beats = [
            ScriptBeat(
                index=i,
                line_text=line,
                start_s=round(i * step, 2),
                end_s=round(min((i + 1) * step, clip_duration), 2),
                confidence=0.5,
                aligned=False,
                target_action="caption",
            )
            for i, line in enumerate(raw_lines)
        ]
        return BeatSheet(
            mode=mode,
            alignment_rate=0.0,
            total_lines=len(raw_lines),
            aligned_lines=0,
            beats=beats,
            unaligned_lines=raw_lines,
        )

    # Prepare transcript tokens
    t_tokens = [clean_token(w.get("w", "")) for w in transcript_words]
    full_transcript_str = " ".join(t_tokens)

    beats: list[ScriptBeat] = []
    unaligned: list[str] = []
    aligned_count = 0
    cur_word_idx = 0
    total_words = len(transcript_words)

    for i, line in enumerate(raw_lines):
        line_tokens = [clean_token(t) for t in line.split() if clean_token(t)]
        if not line_tokens:
            continue

        line_str = " ".join(line_tokens)
        line_n = len(line_tokens)
        best_match_k = -1
        best_match_len = line_n
        best_ratio = 0.0

        # Scan candidate token windows in transcript
        search_start = max(0, cur_word_idx - 2)
        search_max_start = min(total_words, search_start + line_n * 3 + 6)

        for k in range(search_start, search_max_start):
            for delta in (-1, 0, 1, 2):
                span_len = line_n + delta
                if span_len <= 0 or k + span_len > total_words:
                    continue
                cand_str = " ".join(t_tokens[k : k + span_len])
                r = SequenceMatcher(None, line_str, cand_str).ratio()
                if r > best_ratio:
                    best_ratio = r
                    best_match_k = k
                    best_match_len = span_len

        # Threshold for alignment
        align_threshold = 0.35 if mode == "guide" else 0.45
        is_aligned = (best_ratio >= align_threshold and best_match_k >= 0)

        if is_aligned:
            start_pos = best_match_k
            end_pos = min(total_words - 1, start_pos + best_match_len - 1)

            start_t = transcript_words[start_pos].get("start", 0.0)
            end_t = transcript_words[end_pos].get("end", start_t + 1.5)

            cur_word_idx = end_pos + 1
            aligned_count += 1

            matched_text = " ".join(t.get("w", "") for t in transcript_words[start_pos : end_pos + 1])
            beats.append(
                ScriptBeat(
                    index=i,
                    line_text=line,
                    start_s=round(start_t, 2),
                    end_s=round(end_t, 2),
                    confidence=round(best_ratio, 2),
                    aligned=True,
                    matched_transcript=matched_text,
                    target_action="caption" if i > 0 else "hook",
                )
            )
        else:
            # Unaligned line: assign interpolative time
            last_end = beats[-1].end_s if beats else 0.0
            next_t = min(clip_duration, last_end + 2.0)
            unaligned.append(line)
            beats.append(
                ScriptBeat(
                    index=i,
                    line_text=line,
                    start_s=round(last_end, 2),
                    end_s=round(next_t, 2),
                    confidence=round(best_ratio, 2),
                    aligned=False,
                    matched_transcript="",
                    target_action="callout",
                )
            )

    alignment_rate = round(aligned_count / len(raw_lines), 2) if raw_lines else 0.0

    return BeatSheet(
        mode=mode,
        alignment_rate=alignment_rate,
        total_lines=len(raw_lines),
        aligned_lines=aligned_count,
        beats=beats,
        unaligned_lines=unaligned,
    )
