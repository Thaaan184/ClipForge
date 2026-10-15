import React, { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useSceneStore } from "../../lib/scene/store";
import { hitTestLayer } from "../../lib/scene/geometry";
import { LayerConfig } from "../../types";
import { TransformGizmo } from "./TransformGizmo";

interface CanvasViewportProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  sourceWidth: number;
  sourceHeight: number;
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  videoRef,
  sourceWidth,
  sourceHeight,
}) => {
  const { scene, selectedLayerId, setSelectedLayerId, updateLayerTransform, setEditingLayerId } =
    useSceneStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewportScale, setViewportScale] = useState(1);
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  // User Zoom & Pan state
  const [userZoom, setUserZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);

  const effectiveScale = viewportScale * userZoom;

  // Calculate scaling to fit 1080x1920 in viewport container
  const updateLayout = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const padding = 32;
    const availW = Math.max(100, rect.width - padding * 2);
    const availH = Math.max(100, rect.height - padding * 2);

    const scale = Math.min(availW / 1080, availH / 1920);
    setViewportScale(scale);
  }, []);

  useEffect(() => {
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [updateLayout]);

  // Spacebar listener for canvas panning
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

  // Zoom helpers
  const handleZoomIn = () => {
    setUserZoom((prev) => Math.min(4, Math.round((prev + 0.25) * 100) / 100));
  };

  const handleZoomOut = () => {
    setUserZoom((prev) => {
      const next = Math.max(0.25, Math.round((prev - 0.25) * 100) / 100);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setUserZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setUserZoom((prev) => {
      const next = Math.min(4, Math.max(0.25, Math.round((prev + delta) * 100) / 100));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  // Main Canvas2D render loop (~60 FPS)
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !scene) {
        animId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const cw = 1080;
      const ch = 1920;

      // 1. Draw Background
      ctx.save();
      const bg = scene.background;
      if (bg.type === "solid") {
        ctx.fillStyle = bg.color;
        ctx.fillRect(0, 0, cw, ch);
      } else if (bg.type === "gradient" && bg.gradient && bg.gradient.stops.length >= 2) {
        const angleRad = ((bg.gradient.angle - 90) * Math.PI) / 180;
        const x1 = cw / 2 - (Math.cos(angleRad) * cw) / 2;
        const y1 = ch / 2 - (Math.sin(angleRad) * ch) / 2;
        const x2 = cw / 2 + (Math.cos(angleRad) * cw) / 2;
        const y2 = ch / 2 + (Math.sin(angleRad) * ch) / 2;
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        const stops = bg.gradient.stops;
        stops.forEach((st, idx) => {
          grad.addColorStop(idx / (stops.length - 1), st);
        });
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);
      } else if (bg.type === "blur_source" && video && video.readyState >= 2) {
        ctx.filter = `blur(${bg.blur_sigma || 40}px)`;
        ctx.drawImage(video, -40, -40, cw + 80, ch + 80);
        ctx.filter = "none";
      } else {
        ctx.fillStyle = "#0A0A0A";
        ctx.fillRect(0, 0, cw, ch);
      }
      ctx.restore();

      // 2. Draw Visible Layers (sorted by z-index)
      const sortedLayers = [...scene.layers]
        .filter((l) => l.visible)
        .sort((a, b) => a.transform.z - b.transform.z);

      sortedLayers.forEach((layer) => {
        const { transform: t, style: s, shape: sh } = layer;

        ctx.save();
        ctx.translate(t.cx, t.cy);
        ctx.rotate((t.rotation * Math.PI) / 180);
        ctx.globalAlpha = s.opacity;

        const hw = t.w / 2;
        const hh = t.h / 2;

        // Shadow path
        if (s.shadow && s.shadow.enabled) {
          ctx.save();
          ctx.shadowColor = s.shadow.color;
          ctx.shadowBlur = s.shadow.blur;
          ctx.shadowOffsetX = s.shadow.offset_x;
          ctx.shadowOffsetY = s.shadow.offset_y;

          ctx.beginPath();
          if (sh.type === "rect") {
            if (s.corner_radius > 0 && typeof (ctx as any).roundRect === "function") {
              (ctx as any).roundRect(-hw, -hh, t.w, t.h, s.corner_radius);
            } else {
              ctx.rect(-hw, -hh, t.w, t.h);
            }
          } else if (sh.type === "ellipse") {
            ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
          } else if (sh.type === "lasso" && sh.points && sh.points.length > 0) {
            const minX = sh.bbox.x;
            const minY = sh.bbox.y;
            const scaleX = t.w / Math.max(1, sh.bbox.w);
            const scaleY = t.h / Math.max(1, sh.bbox.h);
            sh.points.forEach((pt, idx) => {
              const lx = (pt[0] - minX) * scaleX - hw;
              const ly = (pt[1] - minY) * scaleY - hh;
              if (idx === 0) ctx.moveTo(lx, ly);
              else ctx.lineTo(lx, ly);
            });
            ctx.closePath();
          }
          ctx.fillStyle = "#000000";
          ctx.fill();
          ctx.restore();
        }

        // Clip to shape
        ctx.beginPath();
        if (sh.type === "rect") {
          if (s.corner_radius > 0 && typeof (ctx as any).roundRect === "function") {
            (ctx as any).roundRect(-hw, -hh, t.w, t.h, s.corner_radius);
          } else {
            ctx.rect(-hw, -hh, t.w, t.h);
          }
        } else if (sh.type === "ellipse") {
          ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
        } else if (sh.type === "lasso" && sh.points && sh.points.length > 0) {
          const minX = sh.bbox.x;
          const minY = sh.bbox.y;
          const scaleX = t.w / Math.max(1, sh.bbox.w);
          const scaleY = t.h / Math.max(1, sh.bbox.h);
          sh.points.forEach((pt, idx) => {
            const lx = (pt[0] - minX) * scaleX - hw;
            const ly = (pt[1] - minY) * scaleY - hh;
            if (idx === 0) ctx.moveTo(lx, ly);
            else ctx.lineTo(lx, ly);
          });
          ctx.closePath();
        }
        ctx.clip();

        // Draw source video texture inside clipped region
        if (video && video.readyState >= 2) {
          const vScaleX = video.videoWidth / Math.max(1, sourceWidth);
          const vScaleY = video.videoHeight / Math.max(1, sourceHeight);

          const srcX = sh.bbox.x * vScaleX;
          const srcY = sh.bbox.y * vScaleY;
          const srcW = sh.bbox.w * vScaleX;
          const srcH = sh.bbox.h * vScaleY;

          ctx.drawImage(video, srcX, srcY, srcW, srcH, -hw, -hh, t.w, t.h);
        } else {
          ctx.fillStyle = "#222222";
          ctx.fillRect(-hw, -hh, t.w, t.h);
        }

        // Inner / outer border stroke
        if (s.border_width > 0) {
          ctx.strokeStyle = s.border_color;
          ctx.lineWidth = s.border_width * 2;
          ctx.stroke();
        }

        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [scene, videoRef, sourceWidth, sourceHeight]);

  const [dragState, setDragState] = useState<{
    layerId: string;
    startMouseX: number;
    startMouseY: number;
    initialTransform: LayerConfig["transform"];
  } | null>(null);

  // Pointer down on canvas: Pan OR Hold-and-drag layer
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Pan mode: Space pressed OR Middle click
    if (isSpaceDown || e.button === 1) {
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

    if (!scene) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 1080;
    const clickY = ((e.clientY - rect.top) / rect.height) * 1920;

    // Check hit on layers top-to-bottom
    const sorted = [...scene.layers].sort((a, b) => b.transform.z - a.transform.z);
    for (const lyr of sorted) {
      if (!lyr.visible || lyr.locked) continue;
      if (hitTestLayer(clickX, clickY, lyr)) {
        setSelectedLayerId(lyr.id);
        setDragState({
          layerId: lyr.id,
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          initialTransform: { ...lyr.transform },
        });
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {}
        return;
      }
    }

    // Clicked empty canvas space -> deselect layer and allow panning
    setSelectedLayerId(null);
    setDragState(null);
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

    if (!dragState) {
      // Hover cursor feedback
      if (!scene || !canvasRef.current) return;
      if (isSpaceDown) {
        canvasRef.current.style.cursor = "grab";
        return;
      }
      const rect = canvasRef.current.getBoundingClientRect();
      const hoverX = ((e.clientX - rect.left) / rect.width) * 1080;
      const hoverY = ((e.clientY - rect.top) / rect.height) * 1920;
      const hasHit = scene.layers.some(
        (l) => l.visible && !l.locked && hitTestLayer(hoverX, hoverY, l)
      );
      canvasRef.current.style.cursor = hasHit ? "move" : "default";
      return;
    }

    const dx = (e.clientX - dragState.startMouseX) / effectiveScale;
    const dy = (e.clientY - dragState.startMouseY) / effectiveScale;

    let newCx = Math.round(dragState.initialTransform.cx + dx);
    let newCy = Math.round(dragState.initialTransform.cy + dy);

    const halfW = dragState.initialTransform.w / 2;
    const halfH = dragState.initialTransform.h / 2;
    const SNAP_THRESHOLD = 12;

    let snapX: number | null = null;
    let snapY: number | null = null;

    // Snapping X: Center (540), Left (0), Right (1080)
    if (Math.abs(newCx - 540) < SNAP_THRESHOLD) {
      newCx = 540;
      snapX = 540;
    } else if (Math.abs(newCx - halfW) < SNAP_THRESHOLD) {
      newCx = Math.round(halfW);
      snapX = 0;
    } else if (Math.abs(newCx + halfW - 1080) < SNAP_THRESHOLD) {
      newCx = Math.round(1080 - halfW);
      snapX = 1080;
    }

    // Snapping Y: Center (960), Top (0), Bottom (1920)
    if (Math.abs(newCy - 960) < SNAP_THRESHOLD) {
      newCy = 960;
      snapY = 960;
    } else if (Math.abs(newCy - halfH) < SNAP_THRESHOLD) {
      newCy = Math.round(halfH);
      snapY = 0;
    } else if (Math.abs(newCy + halfH - 1920) < SNAP_THRESHOLD) {
      newCy = Math.round(1920 - halfH);
      snapY = 1920;
    }

    setSnapGuides({ x: snapX, y: snapY });
    updateLayerTransform(dragState.layerId, { cx: newCx, cy: newCy });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (canvasRef.current) {
      try {
        canvasRef.current.releasePointerCapture(e.pointerId);
      } catch {}
    }
    setDragState(null);
    setIsPanning(false);
    panStartRef.current = null;
    setSnapGuides({ x: null, y: null });
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!scene) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 1080;
    const clickY = ((e.clientY - rect.top) / rect.height) * 1920;

    const sorted = [...scene.layers].sort((a, b) => b.transform.z - a.transform.z);
    for (const lyr of sorted) {
      if (hitTestLayer(clickX, clickY, lyr)) {
        setSelectedLayerId(lyr.id);
        setEditingLayerId(lyr.id);
        return;
      }
    }
  };

  const selectedLayer = scene?.layers.find((l) => l.id === selectedLayerId);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="relative flex-1 h-full bg-[#0D0D0D] flex items-center justify-center overflow-hidden select-none"
    >
      {/* 9:16 Canvas Box */}
      <div
        className="relative shadow-2xl border border-[#333333] transition-transform duration-75"
        style={{
          width: `${1080 * effectiveScale}px`,
          height: `${1920 * effectiveScale}px`,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
        }}
      >
        <canvas
          ref={canvasRef}
          width={1080}
          height={1920}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          className="w-full h-full cursor-default"
        />

        {/* Snap Guide Lines */}
        {snapGuides.x !== null && (
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-[#FF6A00] pointer-events-none z-30"
            style={{ left: `${snapGuides.x * effectiveScale}px` }}
          />
        )}
        {snapGuides.y !== null && (
          <div
            className="absolute left-0 right-0 h-[1px] bg-[#FF6A00] pointer-events-none z-30"
            style={{ top: `${snapGuides.y * effectiveScale}px` }}
          />
        )}

        {/* Transform Gizmo overlay for selected layer */}
        {selectedLayer && (
          <TransformGizmo
            layer={selectedLayer}
            canvasScale={effectiveScale}
            viewportOffset={{ x: 0, y: 0 }}
            onTransformChange={(t) => updateLayerTransform(selectedLayer.id, t)}
            onSnapGuideChange={setSnapGuides}
          />
        )}
      </div>

      {/* Floating Zoom Bar for Canvas Panel */}
      <div className="absolute bottom-2 right-2 z-30 flex items-center gap-1 bg-[#141414]/90 border border-[#333333] backdrop-blur-sm rounded px-1.5 py-1 text-xs font-mono shadow-xl">
        <button
          onClick={handleZoomOut}
          disabled={userZoom <= 0.25}
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
          {Math.round(userZoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          disabled={userZoom >= 4.0}
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

      {/* Canvas Dimensions Badge (bottom left) */}
      <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-[10px] font-mono text-[#888888] border border-[#222222] pointer-events-none">
        9:16 1080×1920 | Scroll untuk Zoom | Spasi + Drag untuk Geser
      </div>
    </div>
  );
};
