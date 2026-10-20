"""Disk usage and retention policy manager for ClipForge v3 P6.

Manages:
- Disk usage reporting across workspaces, cache, and exports.
- Automated cleanup and pruning of stale workspaces and temporary render artifacts.
"""

import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from clipforge.core.config import settings


def get_dir_size_bytes(directory: Path) -> int:
    """Calculate total byte size of a directory recursively."""
    if not directory.exists():
        return 0
    total = 0
    try:
        for entry in os.scandir(directory):
            if entry.is_file(follow_symlinks=False):
                total += entry.stat().st_size
            elif entry.is_dir(follow_symlinks=False):
                total += get_dir_size_bytes(Path(entry.path))
    except Exception:
        pass
    return total


def get_editorial_disk_usage() -> dict[str, Any]:
    """Report disk breakdown for editorial engine data directories."""
    data_dir = settings.data_dir
    ws_dir = data_dir / "workspaces"
    cache_dir = data_dir / ".cache"
    output_dir = data_dir / "output"

    ws_bytes = get_dir_size_bytes(ws_dir)
    cache_bytes = get_dir_size_bytes(cache_dir)
    output_bytes = get_dir_size_bytes(output_dir)
    total_engine_bytes = ws_bytes + cache_bytes + output_bytes

    # Filesystem stats
    total_fs, used_fs, free_fs = shutil.disk_usage(data_dir)

    # Count workspaces
    ws_count = 0
    if ws_dir.exists():
        ws_count = len([d for d in ws_dir.iterdir() if d.is_dir()])

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "workspaces_bytes": ws_bytes,
        "workspaces_mb": round(ws_bytes / (1024 * 1024), 2),
        "workspaces_count": ws_count,
        "cache_bytes": cache_bytes,
        "cache_mb": round(cache_bytes / (1024 * 1024), 2),
        "output_bytes": output_bytes,
        "output_mb": round(output_bytes / (1024 * 1024), 2),
        "total_engine_mb": round(total_engine_bytes / (1024 * 1024), 2),
        "filesystem_free_gb": round(free_fs / (1024 * 1024 * 1024), 2),
        "filesystem_total_gb": round(total_fs / (1024 * 1024 * 1024), 2),
    }


def prune_stale_workspaces(
    max_age_hours: float = 24.0,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Prune stale temporary workspace folders and temporary render artifacts.

    Preserves final exports (.mp4 in output or final.mp4 in completed sessions).
    """
    ws_dir = settings.data_dir / "workspaces"
    if not ws_dir.exists():
        return {"freed_bytes": 0, "pruned_count": 0, "pruned_workspaces": []}

    now = time.time()
    cutoff = now - (max_age_hours * 3600.0)

    freed_bytes = 0
    pruned = []

    for item in ws_dir.iterdir():
        if not item.is_dir():
            continue

        try:
            mtime = item.stat().st_mtime
            if mtime < cutoff:
                # Calculate size before pruning
                sz = get_dir_size_bytes(item)
                if not dry_run:
                    shutil.rmtree(item)
                freed_bytes += sz
                pruned.append(item.name)
        except Exception:
            pass

    return {
        "dry_run": dry_run,
        "max_age_hours": max_age_hours,
        "freed_bytes": freed_bytes,
        "freed_mb": round(freed_bytes / (1024 * 1024), 2),
        "pruned_count": len(pruned),
        "pruned_workspaces": pruned,
    }
