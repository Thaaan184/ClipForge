"""API routes for Freeform segment inspection and proxy video streaming."""

from typing import Any

from fastapi import APIRouter, Header, HTTPException, status
from fastapi.responses import StreamingResponse

from clipforge.ingest.segment import (
    get_segment_dir,
    get_segment_status,
    open_file_range_stream,
)

router = APIRouter(prefix="/api/segments", tags=["Segments"])


@router.get("/{segment_id}")
async def get_segment_info(segment_id: str) -> dict[str, Any]:
    """Retrieve segment preparation status and metadata."""
    info = await get_segment_status(segment_id)
    if info.get("status") == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Segment '{segment_id}' not found",
        )
    return info


@router.get("/{segment_id}/proxy")
async def stream_segment_proxy(
    segment_id: str,
    range: str | None = Header(None),
) -> StreamingResponse:
    """Stream 720p H.264 preview proxy video with HTTP Range scrubbing."""
    seg_dir = get_segment_dir(segment_id)
    proxy_path = seg_dir / "proxy.mp4"

    if not proxy_path.exists():
        info = await get_segment_status(segment_id)
        if info.get("status") in ("queued", "downloading", "proxying"):
            raise HTTPException(
                status_code=status.HTTP_202_ACCEPTED,
                detail=f"Segment proxy is still preparing (status: {info.get('status')})",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preview proxy for segment '{segment_id}' not ready or failed",
        )

    stream_gen, headers, status_code = await open_file_range_stream(
        proxy_path,
        range_header=range,
        content_type="video/mp4",
    )
    return StreamingResponse(stream_gen, status_code=status_code, headers=headers)
