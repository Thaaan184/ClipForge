"""Async HTTP client communicating with internal Remotion worker (127.0.0.1:8765)."""

import os
from pathlib import Path
from typing import Any

import httpx
import structlog

from clipforge.core.config import settings

logger = structlog.get_logger(__name__)

WORKER_BASE_URL = (
    os.environ.get("CF_REMOTION_WORKER_URL")
    or os.environ.get("REMOTION_WORKER_URL")
    or getattr(settings, "remotion_worker_url", "http://127.0.0.1:8765")
)
DEFAULT_TIMEOUT = 360.0  # Up to 6 minutes for full renders


class RemotionWorkerClient:
    def __init__(self, base_url: str = WORKER_BASE_URL, timeout: float = DEFAULT_TIMEOUT):
        self.base_url = base_url
        self.timeout = timeout

    async def is_healthy(self) -> bool:
        """Check if Remotion worker is reachable and healthy."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self.base_url}/health")
                return res.status_code == 200 and res.json().get("status") == "ok"
        except Exception:
            return False

    async def get_env_keys(self) -> list[str]:
        """Fetch active environment keys from worker."""
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{self.base_url}/env-keys")
            res.raise_for_status()
            return res.json().get("keys", [])

    async def typecheck(self, workspace_dir: Path) -> dict[str, Any]:
        """Execute typecheck on workspace."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{self.base_url}/typecheck",
                json={"workspace_dir": str(workspace_dir.resolve())},
            )
            res.raise_for_status()
            return res.json()

    async def render_still(
        self,
        workspace_dir: Path,
        output_path: Path,
        frame: int = 0,
        composition_id: str = "Main",
    ) -> dict[str, Any]:
        """Render a single frame as still image."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(
                f"{self.base_url}/still",
                json={
                    "workspace_dir": str(workspace_dir.resolve()),
                    "output_path": str(output_path.resolve()),
                    "frame": frame,
                    "composition_id": composition_id,
                },
            )
            res.raise_for_status()
            return res.json()

    async def render_preview(
        self,
        workspace_dir: Path,
        output_path: Path,
        composition_id: str = "Main",
        concurrency: int = 2,
    ) -> dict[str, Any]:
        """Render fast low-resolution MP4 preview."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            res = await client.post(
                f"{self.base_url}/preview",
                json={
                    "workspace_dir": str(workspace_dir.resolve()),
                    "output_path": str(output_path.resolve()),
                    "composition_id": composition_id,
                    "concurrency": concurrency,
                },
            )
            res.raise_for_status()
            return res.json()

    async def render_final(
        self,
        workspace_dir: Path,
        output_path: Path,
        composition_id: str = "Main",
        concurrency: int = 4,
    ) -> dict[str, Any]:
        """Render full-resolution 1080x1920 30fps raw video."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            res = await client.post(
                f"{self.base_url}/render",
                json={
                    "workspace_dir": str(workspace_dir.resolve()),
                    "output_path": str(output_path.resolve()),
                    "composition_id": composition_id,
                    "concurrency": concurrency,
                },
            )
            if res.status_code != 200:
                err_text = res.text
                logger.error("worker_render_final_failed", status=res.status_code, body=err_text)
                raise RuntimeError(f"Remotion worker render failed (HTTP {res.status_code}): {err_text}")
            return res.json()


worker_client = RemotionWorkerClient()
