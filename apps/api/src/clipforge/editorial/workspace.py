"""Workspace Manager for Editorial Studio v3.

Handles per-session workspace lifecycle, filesystem layout, template initialization,
and git-based version tracking.
"""

import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import structlog

from clipforge.core.config import settings
from clipforge.editorial.leak_guard import audit_workspace_security
from clipforge.editorial.manifest import save_manifest
from clipforge.editorial.models import EditorialManifest

logger = structlog.get_logger(__name__)

TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "worker" / "template"
WORKER_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "worker"


def get_workspaces_root() -> Path:
    """Return root directory for all editorial workspaces."""
    ws_dir = settings.data_dir / "workspaces"
    ws_dir.mkdir(parents=True, exist_ok=True)
    shared_nm = ws_dir / "node_modules"
    worker_nm = WORKER_DIR / "node_modules"
    if not shared_nm.exists() and worker_nm.exists():
        try:
            shared_nm.symlink_to(worker_nm.resolve())
        except Exception:
            pass
    return ws_dir


def get_workspace_dir(session_id: str) -> Path:
    """Return directory path for a specific editorial session workspace."""
    return get_workspaces_root() / session_id


def init_workspace(
    session_id: str,
    clip_id: str,
    editorial_source_path: Path,
    manifest: EditorialManifest,
) -> dict[str, Any]:
    """
    Initialize a new workspace:
    1. Copies template (src/, kit/, context/, tsconfig.json).
    2. Symlinks/copies editorial_source.mp4 to public/clip_source.mp4.
    3. Writes context/manifest.json.
    4. Initializes local git repo and makes initial commit.
    """
    ws_dir = get_workspace_dir(session_id)
    if ws_dir.exists():
        shutil.rmtree(ws_dir)

    ws_dir.mkdir(parents=True, exist_ok=True)
    public_dir = ws_dir / "public"
    public_dir.mkdir(parents=True, exist_ok=True)
    (public_dir / "assets").mkdir(parents=True, exist_ok=True)

    # 1. Copy template files
    if not TEMPLATE_DIR.exists():
        raise FileNotFoundError(f"Template directory not found: {TEMPLATE_DIR}")

    shutil.copytree(TEMPLATE_DIR / "src", ws_dir / "src")
    shutil.copytree(TEMPLATE_DIR / "kit", ws_dir / "kit")
    shutil.copytree(TEMPLATE_DIR / "context", ws_dir / "context")
    shutil.copy2(TEMPLATE_DIR / "tsconfig.json", ws_dir / "tsconfig.json")

    # 2. Hardlink or copy editorial source video (avoid symlink escape)
    target_clip = public_dir / "clip_source.mp4"
    if editorial_source_path.exists():
        try:
            os.link(editorial_source_path, target_clip)
        except Exception:
            shutil.copy2(editorial_source_path, target_clip)
    else:
        logger.warning("editorial_source_missing_at_workspace_init", path=str(editorial_source_path))

    # 3. Write manifest.json
    manifest_path = ws_dir / "context" / "manifest.json"
    save_manifest(manifest, manifest_path)

    # 4. Security audit before git init
    sec_res = audit_workspace_security(ws_dir)
    if not sec_res["passed"]:
        raise ValueError(f"Security leak-guard violation on workspace init: {sec_res['errors']}")

    # 5. Git repository initialization
    try:
        subprocess.run(["git", "init"], cwd=str(ws_dir), check=True, capture_output=True)
        subprocess.run(
            ["git", "config", "user.name", "ClipForge AI Agent"],
            cwd=str(ws_dir),
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "config", "user.email", "agent@clipforge.local"],
            cwd=str(ws_dir),
            check=True,
            capture_output=True,
        )
        subprocess.run(["git", "add", "."], cwd=str(ws_dir), check=True, capture_output=True)
        commit_res = subprocess.run(
            ["git", "commit", "-m", "chore: initial editorial workspace (v1)"],
            cwd=str(ws_dir),
            check=True,
            capture_output=True,
        )
        rev_proc = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=str(ws_dir), check=True, capture_output=True, text=True
        )
        commit_sha = rev_proc.stdout.strip()
    except subprocess.CalledProcessError as exc:
        err = exc.stderr.decode("utf-8", errors="replace") if exc.stderr else str(exc)
        logger.error("git_init_failed", error=err)
        commit_sha = "init"

    logger.info("editorial_workspace_initialized", session_id=session_id, sha=commit_sha)

    return {
        "workspace_dir": str(ws_dir.resolve()),
        "manifest_path": str(manifest_path.resolve()),
        "commit_sha": commit_sha,
    }


def commit_workspace_version(workspace_dir: Path, summary: str = "update") -> str:
    """Commit current workspace state to git and return new commit SHA."""
    # Check if there are changes
    status_proc = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=str(workspace_dir),
        capture_output=True,
        text=True,
        check=True,
    )
    if not status_proc.stdout.strip():
        # No changes, return current HEAD
        rev = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(workspace_dir),
            capture_output=True,
            text=True,
            check=True,
        )
        return rev.stdout.strip()

    subprocess.run(["git", "add", "."], cwd=str(workspace_dir), check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", summary],
        cwd=str(workspace_dir),
        check=True,
        capture_output=True,
    )
    rev_proc = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=str(workspace_dir),
        check=True,
        capture_output=True,
        text=True,
    )
    return rev_proc.stdout.strip()


def restore_workspace_version(workspace_dir: Path, commit_sha: str) -> None:
    """Restore workspace to a specific git commit SHA."""
    subprocess.run(
        ["git", "checkout", "-f", commit_sha],
        cwd=str(workspace_dir),
        check=True,
        capture_output=True,
    )
    logger.info("workspace_restored", workspace=str(workspace_dir), commit=commit_sha)
