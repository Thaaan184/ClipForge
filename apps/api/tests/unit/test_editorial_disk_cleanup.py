"""Unit tests for ClipForge v3 P6 Disk Usage and Retention Cleanup."""

import os
import time
import pytest
from pathlib import Path

from clipforge.editorial.disk_cleanup import (
    get_dir_size_bytes,
    get_editorial_disk_usage,
    prune_stale_workspaces,
)


def test_get_dir_size(tmp_path):
    sub = tmp_path / "subdir"
    sub.mkdir()
    (sub / "f1.bin").write_bytes(b"a" * 1024)
    (sub / "f2.bin").write_bytes(b"b" * 2048)
    assert get_dir_size_bytes(sub) == 3072


def test_get_editorial_disk_usage(monkeypatch, tmp_path):
    fake_settings = type("FakeSettings", (), {"data_dir": tmp_path})
    monkeypatch.setattr("clipforge.editorial.disk_cleanup.settings", fake_settings)

    ws_dir = tmp_path / "workspaces" / "ws1"
    ws_dir.mkdir(parents=True)
    (ws_dir / "preview.mp4").write_bytes(b"x" * 5000)

    usage = get_editorial_disk_usage()
    assert usage["workspaces_count"] == 1
    assert usage["workspaces_bytes"] == 5000
    assert "filesystem_free_gb" in usage


def test_prune_stale_workspaces(monkeypatch, tmp_path):
    fake_settings = type("FakeSettings", (), {"data_dir": tmp_path})
    monkeypatch.setattr("clipforge.editorial.disk_cleanup.settings", fake_settings)

    workspaces = tmp_path / "workspaces"
    workspaces.mkdir()

    # Fresh workspace
    fresh_ws = workspaces / "fresh_session"
    fresh_ws.mkdir()
    (fresh_ws / "test.txt").write_text("fresh")

    # Stale workspace (older than 48 hours)
    stale_ws = workspaces / "stale_session"
    stale_ws.mkdir()
    (stale_ws / "test.txt").write_text("stale data")

    # Backdate mtime
    old_time = time.time() - (50 * 3600)
    os.utime(stale_ws, (old_time, old_time))

    # Dry run check
    dry_res = prune_stale_workspaces(max_age_hours=24.0, dry_run=True)
    assert dry_res["pruned_count"] == 1
    assert "stale_session" in dry_res["pruned_workspaces"]
    assert stale_ws.exists()

    # Real prune
    real_res = prune_stale_workspaces(max_age_hours=24.0, dry_run=False)
    assert real_res["pruned_count"] == 1
    assert not stale_ws.exists()
    assert fresh_ws.exists()
