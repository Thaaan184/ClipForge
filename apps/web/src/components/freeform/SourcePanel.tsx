import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, X, Square, Circle, Edit3, MousePointer, Play, Pause } from "lucide-react";
import { useSceneStore } from "../../lib/scene/store";
import { simplifyLasso } from "../../lib/scene/geometry";

interface SourcePanelProps {
  proxyUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceId: string;
  clipStart: number;
  clipEnd: number;
  currentTime: number;
  onTimeUpdate: (t: number) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export const SourcePanel: React.FC<SourcePanelProps> = ({
  proxyUrl,
  sourceWidth,
  sourceHeight,
  sourceId,
  clipStart,
  clipEnd,
  currentTime,
  onTimeUpdate,
  videoRef,
}) => {
  const {
    scene,
    activeTool,
    setActiveTool,
    draftShape,
    setDraftShape,
    addLayerFromDraft,
    selectedLayerId,
    editingLayerId,
    setEditingLayerId,
    updateLayerShape,
    setSelectedLayerId,
  } = useSceneStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [frameDims, setFrameDims] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Calculate exact inner video display dimensions to prevent letterbox offsets
  const updateFrameDims = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pad = 16;
    const cW = Math.max(0, rect.width - pad);
    const cH = Math.max(0, rect.height - pad);
    if (cW <= 0 || cH <= 0) return;

    const video = videoRef.current;
    let vAspect = 16 / 9;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      vAspect = video.videoWidth / video.videoHeight;
    } else if (sourceWidth > 0 && sourceHeight > 0) {
      vAspect = sourceWidth / sourceHeight;
    }

    const cAspect = cW / cH;
    let vW = cW;
    let vH = cH;

    if (cAspect > vAspect) {
      // Container is wider than video -> height is constraint
      vH = cH;
      vW = Math.round(cH * vAspect);
    } else {
      // Container is taller than video -> width is constraint
      vW = cW;
      vH = Math.round(cW / vAspect);
    }

    setFrameDims({ width: vW, height: vH });
  }, [sourceWidth, sourceHeight, videoRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateFrameDims();

    const observer = new ResizeObserver(() => {
      updateFrameDims();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [updateFrameDims]);

  // Conversion: display canvas coordinates <-> original source pixels
  const getScale = useCallback(() => {
    if (!canvasRef.current) return { sx: 1, sy: 1, width: 1, height: 1 };
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = sourceWidth / Math.max(1, rect.width);
    const sy = sourceHeight / Math.max(1, rect.height);
    return { sx, sy, width: rect.width, height: rect.height };
  }, [sourceWidth, sourceHeight]);

  // Video playback constraints
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTime = () => {
      onTimeUpdate(video.currentTime);
      if (video.currentTime >= clipEnd) {
        video.currentTime = clipStart;
      }
    };
    video.addEventListener("timeupdate", handleTime);
    return () => video.removeEventListener("timeupdate", handleTime);
  }, [clipStart, clipEnd, onTimeUpdate, videoRef]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      if (video.currentTime < clipStart || video.currentTime >= clipEnd) {
        video.currentTime = clipStart;
      }
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Redraw overlay canvas
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, rect.width, rect.height);
    const { sx, sy } = getScale();

    // 1. Draw existing layers outline
    if (scene) {
      scene.layers.forEach((layer) => {
        if (!layer.visible) return;
        const isSelected = layer.id === selectedLayerId;
        ctx.strokeStyle = isSelected ? "#00FFCC" : "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.setLineDash(isSelected ? [] : [4, 4]);

        const bx = layer.shape.bbox.x / sx;
        const by = layer.shape.bbox.y / sy;
        const bw = layer.shape.bbox.w / sx;
        const bh = layer.shape.bbox.h / sy;

        if (layer.shape.type === "rect") {
          ctx.strokeRect(bx, by, bw, bh);
        } else if (layer.shape.type === "ellipse") {
          ctx.beginPath();
          ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (layer.shape.type === "lasso" && layer.shape.points) {
          ctx.beginPath();
          layer.shape.points.forEach((pt, idx) => {
            const px = pt[0] / sx;
            const py = pt[1] / sy;
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.stroke();
        }

        // Layer name badge
        ctx.setLineDash([]);
        ctx.fillStyle = isSelected ? "#00FFCC" : "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(bx, Math.max(0, by - 18), 60, 16);
        ctx.fillStyle = isSelected ? "#000000" : "#FFFFFF";
        ctx.font = "10px monospace";
        ctx.fillText(layer.name.slice(0, 8), bx + 4, Math.max(12, by - 6));
      });
    }

    // 2. Draw current draft shape
    if (draftShape) {
      ctx.strokeStyle = "#FF6A00";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255, 106, 0, 0.2)";

      const bx = draftShape.bbox.x / sx;
      const by = draftShape.bbox.y / sy;
      const bw = draftShape.bbox.w / sx;
      const bh = draftShape.bbox.h / sy;

      if (draftShape.type === "rect") {
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
      } else if (draftShape.type === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (draftShape.type === "lasso" && draftShape.points.length > 0) {
        ctx.beginPath();
        draftShape.points.forEach((pt, idx) => {
          const px = pt[0] / sx;
          const py = pt[1] / sy;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        if (draftShape.isComplete) {
          ctx.closePath();
          ctx.fill();
        }
        ctx.stroke();
      }
    }
  }, [scene, selectedLayerId, draftShape, getScale, frameDims]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // Pointer events for drawing shapes
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool === "select") {
      const canvas = canvasRef.current;
      if (!canvas || !scene) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (sourceWidth / Math.max(1, rect.width));
      const y = (e.clientY - rect.top) * (sourceHeight / Math.max(1, rect.height));

      // Hit test existing layers in reverse order
      const reversed = [...scene.layers].reverse();
      for (const lyr of reversed) {
        if (!lyr.visible) continue;
        const b = lyr.shape.bbox;
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          setSelectedLayerId(lyr.id);
          return;
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { sx, sy } = getScale();

    const srcX = Math.max(0, Math.min(sourceWidth, x * sx));
    const srcY = Math.max(0, Math.min(sourceHeight, y * sy));

    if (activeTool === "rect" || activeTool === "ellipse") {
      setIsDrawing(true);
      setDragStart({ x: srcX, y: srcY });
      setDraftShape({
        type: activeTool,
        bbox: { x: srcX, y: srcY, w: 0, h: 0 },
        points: [],
        isComplete: false,
      });
    } else if (activeTool === "lasso") {
      if (!draftShape || draftShape.isComplete) {
        setIsDrawing(true);
        setDraftShape({
          type: "lasso",
          bbox: { x: srcX, y: srcY, w: 0, h: 0 },
          points: [[srcX, srcY]],
          isComplete: false,
        });
      } else {
        // Add point to existing lasso
        const pts = [...draftShape.points, [srcX, srcY] as [number, number]];
        const minX = Math.min(...pts.map((p) => p[0]));
        const maxX = Math.max(...pts.map((p) => p[0]));
        const minY = Math.min(...pts.map((p) => p[1]));
        const maxY = Math.max(...pts.map((p) => p[1]));

        // Check if close to start point to auto-close
        const startPt = pts[0];
        const distToStart = Math.hypot(srcX - startPt[0], srcY - startPt[1]);
        if (pts.length >= 3 && distToStart < 15 * sx) {
          const simplified = simplifyLasso(pts, 2.0);
          setDraftShape({
            type: "lasso",
            bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
            points: simplified,
            isComplete: true,
          });
          setIsDrawing(false);
        } else {
          setDraftShape({
            ...draftShape,
            bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
            points: pts,
          });
        }
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !dragStart || !draftShape) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { sx, sy } = getScale();

    const curX = Math.max(0, Math.min(sourceWidth, x * sx));
    const curY = Math.max(0, Math.min(sourceHeight, y * sy));

    if (activeTool === "rect" || activeTool === "ellipse") {
      const minX = Math.min(dragStart.x, curX);
      const minY = Math.min(dragStart.y, curY);
      const w = Math.abs(curX - dragStart.x);
      const h = Math.abs(curY - dragStart.y);

      setDraftShape({
        type: activeTool,
        bbox: { x: minX, y: minY, w: Math.max(20, w), h: Math.max(20, h) },
        points: [],
        isComplete: false,
      });
    }
  };

  const handlePointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (e && canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    }

    if (!isDrawing || !draftShape) return;
    if (activeTool === "rect" || activeTool === "ellipse") {
      setIsDrawing(false);
      if (draftShape.bbox.w > 20 && draftShape.bbox.h > 20) {
        setDraftShape({ ...draftShape, isComplete: true });
      } else {
        setDraftShape(null);
      }
    }
  };

  const handleConfirmDraft = () => {
    if (!draftShape || !draftShape.isComplete) return;

    if (editingLayerId) {
      // Re-editing existing layer shape
      updateLayerShape(editingLayerId, {
        type: draftShape.type,
        bbox: draftShape.bbox,
        points: draftShape.points && draftShape.points.length >= 3 ? draftShape.points : null,
      });
      setEditingLayerId(null);
      setDraftShape(null);
    } else {
      // Add as new layer
      addLayerFromDraft(sourceId);
    }
  };

  const handleCancelDraft = () => {
    setDraftShape(null);
    setEditingLayerId(null);
    setIsDrawing(false);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && draftShape && draftShape.isComplete) {
        handleConfirmDraft();
      } else if (e.key === "Escape") {
        handleCancelDraft();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="flex flex-col h-full bg-[#141414] border-r border-[#2A2A2A] relative select-none">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0A0A0A] border-b border-[#2A2A2A]">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-mono text-[#888888] mr-2 uppercase tracking-wider">
            {editingLayerId ? "[EDIT BENTUK]" : "SOURCE"}
          </span>
          <button
            onClick={() => setActiveTool("select")}
            title="Pilih Layer"
            className={`p-1.5 rounded text-xs transition ${
              activeTool === "select" ? "bg-[#FF6A00] text-black" : "text-[#AAAAAA] hover:bg-[#222222]"
            }`}
          >
            <MousePointer size={14} />
          </button>
          <button
            onClick={() => setActiveTool("rect")}
            title="Bentuk Kotak"
            className={`p-1.5 rounded text-xs transition ${
              activeTool === "rect" ? "bg-[#FF6A00] text-black" : "text-[#AAAAAA] hover:bg-[#222222]"
            }`}
          >
            <Square size={14} />
          </button>
          <button
            onClick={() => setActiveTool("ellipse")}
            title="Bentuk Elips"
            className={`p-1.5 rounded text-xs transition ${
              activeTool === "ellipse" ? "bg-[#FF6A00] text-black" : "text-[#AAAAAA] hover:bg-[#222222]"
            }`}
          >
            <Circle size={14} />
          </button>
          <button
            onClick={() => setActiveTool("lasso")}
            title="Bentuk Bebas (Lasso)"
            className={`p-1.5 rounded text-xs transition ${
              activeTool === "lasso" ? "bg-[#FF6A00] text-black" : "text-[#AAAAAA] hover:bg-[#222222]"
            }`}
          >
            <Edit3 size={14} />
          </button>
        </div>

        {/* Play / Pause & Scrubber */}
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className="p-1 rounded bg-[#2A2A2A] hover:bg-[#3A3A3A] text-white text-xs"
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <span className="text-[10px] font-mono text-[#888888]">
            {currentTime.toFixed(1)}s / {clipEnd.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Video + Interactive Canvas Container */}
      <div
        ref={containerRef}
        className="relative flex-1 bg-black flex items-center justify-center p-2 overflow-hidden"
      >
        <div
          className="relative shadow-lg"
          style={{
            width: frameDims.width > 0 ? `${frameDims.width}px` : "100%",
            height: frameDims.height > 0 ? `${frameDims.height}px` : "100%",
          }}
        >
          <video
            ref={videoRef}
            src={proxyUrl}
            playsInline
            muted
            loop
            onLoadedMetadata={updateFrameDims}
            className="w-full h-full object-fill pointer-events-none block"
          />

          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="absolute inset-0 w-full h-full cursor-crosshair"
          />

          {/* Draft Confirmation Buttons Near Shape */}
          {draftShape && draftShape.isComplete && (
            <div
              className="absolute z-20 flex items-center gap-1 bg-[#141414] border border-[#FF6A00] rounded px-2 py-1 shadow-lg"
              style={{
                left: `${Math.max(
                  10,
                  Math.min(
                    (frameDims.width || 400) - 150,
                    (draftShape.bbox.x + draftShape.bbox.w / 2) / getScale().sx - 60
                  )
                )}px`,
                top: `${Math.max(
                  10,
                  Math.min(
                    (frameDims.height || 300) - 40,
                    (draftShape.bbox.y + draftShape.bbox.h) / getScale().sy + 10
                  )
                )}px`,
              }}
            >
              <button
                onClick={handleConfirmDraft}
                className="flex items-center gap-1 px-2 py-0.5 bg-[#FF6A00] text-black text-xs font-semibold rounded hover:bg-[#e05d00]"
              >
                <Check size={12} /> Jadikan Cut
              </button>
              <button
                onClick={handleCancelDraft}
                className="p-1 text-[#888888] hover:text-white rounded hover:bg-[#2A2A2A]"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Hint */}
      <div className="px-3 py-1 bg-[#0A0A0A] border-t border-[#2A2A2A] text-[10px] text-[#666666] flex justify-between">
        <span>Tarik kursor untuk Rect/Elips | Klik titik demi titik untuk Lasso</span>
        <span>Enter = Simpan | Esc = Batal</span>
      </div>
    </div>
  );
};
