import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  X,
  Square,
  Circle,
  Edit3,
  MousePointer,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Hand,
} from "lucide-react";
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

  // Fixed unscaled aspect-accurate frame dimensions (Fit size)
  const [baseDims, setBaseDims] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);

  // Calculate unscaled base dimensions (100% Fit) keeping 16:9 aspect ratio locked
  const updateBaseDims = useCallback(() => {
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
    let vW: number;
    let vH: number;

    if (cAspect > vAspect) {
      // Container is wider -> fit height
      vH = Math.round(cH);
      vW = Math.round(cH * vAspect);
    } else {
      // Container is taller -> fit width
      vW = Math.round(cW);
      vH = Math.round(cW / vAspect);
    }

    setBaseDims({ width: vW, height: vH });
  }, [sourceWidth, sourceHeight, videoRef]);

  // Center video when baseDims changes or container initializes
  useEffect(() => {
    if (!containerRef.current || baseDims.width <= 0 || baseDims.height <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPan({
      x: Math.round((rect.width - baseDims.width) / 2),
      y: Math.round((rect.height - baseDims.height) / 2),
    });
  }, [baseDims.width, baseDims.height]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateBaseDims();

    const observer = new ResizeObserver(() => {
      updateBaseDims();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [updateBaseDims]);

  // Spacebar listener for quick pan mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.target as HTMLElement)?.tagName !== "INPUT") {
        setIsSpaceDown(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpaceDown(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Reset zoom & center
  const handleResetZoom = useCallback(() => {
    setZoom(1);
    if (containerRef.current && baseDims.width > 0 && baseDims.height > 0) {
      const rect = containerRef.current.getBoundingClientRect();
      setPan({
        x: Math.round((rect.width - baseDims.width) / 2),
        y: Math.round((rect.height - baseDims.height) / 2),
      });
    } else {
      setPan({ x: 0, y: 0 });
    }
  }, [baseDims]);

  // Zoom In / Out from center of container
  const handleZoomStep = (direction: 1 | -1) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const nextZoom = Math.min(5, Math.max(0.5, Math.round((zoom + direction * 0.25) * 100) / 100));
    if (nextZoom === zoom) return;

    const newPanX = centerX - (centerX - pan.x) * (nextZoom / zoom);
    const newPanY = centerY - (centerY - pan.y) * (nextZoom / zoom);

    setZoom(nextZoom);
    setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
  };

  // Zoom directly into mouse cursor on mouse wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mX = e.clientX - rect.left;
    const mY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nextZoom = Math.min(5, Math.max(0.5, Math.round(zoom * factor * 100) / 100));
    if (nextZoom === zoom) return;

    const newPanX = mX - (mX - pan.x) * (nextZoom / zoom);
    const newPanY = mY - (mY - pan.y) * (nextZoom / zoom);

    setZoom(nextZoom);
    setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
  };

  // Convert client coordinates (screen clientX/clientY) -> Source pixel space (0..sourceWidth, 0..sourceHeight)
  const clientToSource = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || sourceWidth <= 0 || sourceHeight <= 0) {
        return { x: 0, y: 0 };
      }
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };

      const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      return {
        x: normX * sourceWidth,
        y: normY * sourceHeight,
      };
    },
    [sourceWidth, sourceHeight]
  );

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

  // Redraw overlay canvas (rendered at baseDims, CSS scales it smoothly)
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || baseDims.width <= 0 || baseDims.height <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = baseDims.width * window.devicePixelRatio;
    canvas.height = baseDims.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, baseDims.width, baseDims.height);
    const sx = sourceWidth / baseDims.width;
    const sy = sourceHeight / baseDims.height;

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
  }, [scene, selectedLayerId, draftShape, baseDims, sourceWidth, sourceHeight]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // Pointer events for drawing shapes & panning
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Pan mode: Space held OR Hand tool active OR Middle mouse button
    if (isSpaceDown || activeTool === "pan" || e.button === 1) {
      setIsPanning(true);
      panStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      return;
    }

    const { x: srcX, y: srcY } = clientToSource(e.clientX, e.clientY);

    if (activeTool === "select") {
      if (!scene) return;
      // Hit test existing layers in reverse order
      const reversed = [...scene.layers].reverse();
      for (const lyr of reversed) {
        if (!lyr.visible) continue;
        const b = lyr.shape.bbox;
        if (srcX >= b.x && srcX <= b.x + b.w && srcY >= b.y && srcY <= b.y + b.h) {
          setSelectedLayerId(lyr.id);
          return;
        }
      }
      return;
    }

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}

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
        const pts = [...draftShape.points, [srcX, srcY] as [number, number]];
        const minX = Math.min(...pts.map((p) => p[0]));
        const maxX = Math.max(...pts.map((p) => p[0]));
        const minY = Math.min(...pts.map((p) => p[1]));
        const maxY = Math.max(...pts.map((p) => p[1]));

        const startPt = pts[0];
        const distToStart = Math.hypot(srcX - startPt[0], srcY - startPt[1]);
        const sx = sourceWidth / baseDims.width;
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
    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      setPan({
        x: Math.round(panStartRef.current.panX + dx),
        y: Math.round(panStartRef.current.panY + dy),
      });
      return;
    }

    if (!isDrawing || !dragStart || !draftShape) return;
    const { x: curX, y: curY } = clientToSource(e.clientX, e.clientY);

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

    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      return;
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
      updateLayerShape(editingLayerId, {
        type: draftShape.type,
        bbox: draftShape.bbox,
        points: draftShape.points && draftShape.points.length >= 3 ? draftShape.points : null,
      });
      setEditingLayerId(null);
      setDraftShape(null);
    } else {
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

  const getCanvasCursor = () => {
    if (isPanning) return "cursor-grabbing";
    if (isSpaceDown || activeTool === "pan") return "cursor-grab";
    if (activeTool === "select") return "cursor-pointer";
    return "cursor-crosshair";
  };

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
          <button
            onClick={() => setActiveTool("pan")}
            title="Geser Tampilan Video (Hand Tool / Spasi)"
            className={`p-1.5 rounded text-xs transition ${
              activeTool === "pan" ? "bg-[#00FFCC] text-black" : "text-[#AAAAAA] hover:bg-[#222222]"
            }`}
          >
            <Hand size={14} />
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
        onWheel={handleWheel}
        className="relative flex-1 bg-black overflow-hidden"
      >
        <div
          className="relative shadow-lg"
          style={{
            width: baseDims.width > 0 ? `${baseDims.width}px` : "100%",
            height: baseDims.height > 0 ? `${baseDims.height}px` : "100%",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <video
            ref={videoRef}
            src={proxyUrl}
            playsInline
            muted
            loop
            onLoadedMetadata={updateBaseDims}
            className="w-full h-full object-fill pointer-events-none block"
          />

          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`absolute inset-0 w-full h-full ${getCanvasCursor()}`}
          />

          {/* Draft Confirmation Buttons Near Shape */}
          {draftShape && draftShape.isComplete && baseDims.width > 0 && (
            <div
              className="absolute z-20 flex items-center gap-1 bg-[#141414] border border-[#FF6A00] rounded px-2 py-1 shadow-lg"
              style={{
                left: `${Math.max(
                  10,
                  Math.min(
                    baseDims.width - 150,
                    (draftShape.bbox.x + draftShape.bbox.w / 2) / (sourceWidth / baseDims.width) - 60
                  )
                )}px`,
                top: `${Math.max(
                  10,
                  Math.min(
                    baseDims.height - 40,
                    (draftShape.bbox.y + draftShape.bbox.h) / (sourceHeight / baseDims.height) + 10
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

        {/* Floating Zoom Bar for Source Panel */}
        <div className="absolute bottom-2 right-2 z-30 flex items-center gap-1 bg-[#141414]/90 border border-[#333333] backdrop-blur-sm rounded px-1.5 py-1 text-xs font-mono shadow-xl">
          <button
            onClick={() => handleZoomStep(-1)}
            disabled={zoom <= 0.5}
            title="Zoom Out (-)"
            className="p-1 hover:text-[#00FFCC] text-[#AAAAAA] disabled:opacity-30 rounded hover:bg-[#222222]"
          >
            <ZoomOut size={13} />
          </button>
          <button
            onClick={handleResetZoom}
            title="Klik untuk Reset Zoom (Fit)"
            className="px-1.5 py-0.5 hover:text-white text-[#888888] hover:bg-[#222222] rounded text-[11px]"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => handleZoomStep(1)}
            disabled={zoom >= 5.0}
            title="Zoom In (+)"
            className="p-1 hover:text-[#00FFCC] text-[#AAAAAA] disabled:opacity-30 rounded hover:bg-[#222222]"
          >
            <ZoomIn size={13} />
          </button>
          <div className="w-[1px] h-3 bg-[#333333] mx-0.5" />
          <button
            onClick={handleResetZoom}
            title="Fit ke Layar"
            className="p-1 hover:text-[#FF6A00] text-[#AAAAAA] rounded hover:bg-[#222222]"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Bottom Hint */}
      <div className="px-3 py-1 bg-[#0A0A0A] border-t border-[#2A2A2A] text-[10px] text-[#666666] flex justify-between">
        <span>Tahan Spasi / Hand Tool untuk geser | Scroll mouse zoom ke kursor</span>
        <span>Enter = Simpan Cut | Esc = Batal</span>
      </div>
    </div>
  );
};
