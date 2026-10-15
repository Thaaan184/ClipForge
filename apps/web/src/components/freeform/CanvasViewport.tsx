import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSceneStore } from "../../lib/scene/store";
import { hitTestLayer } from "../../lib/scene/geometry";
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
        // Draw blurred stretched video
        ctx.filter = `blur(${bg.blur_sigma || 40}px)`;
        // Enlarge slightly to cover blur boundary
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

          // Trace shape path for shadow cast
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
          // Absolute pixel crop in video coordinates
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
          ctx.lineWidth = s.border_width * 2; // Clip clips half of stroke width
          ctx.stroke();
        }

        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [scene, videoRef, sourceWidth, sourceHeight]);

  // Click on canvas to select layer
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!scene) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 1080;
    const clickY = ((e.clientY - rect.top) / rect.height) * 1920;

    // Top to bottom in z-index order
    const sorted = [...scene.layers].sort((a, b) => b.transform.z - a.transform.z);
    for (const lyr of sorted) {
      if (!lyr.visible || lyr.locked) continue;
      if (hitTestLayer(clickX, clickY, lyr)) {
        setSelectedLayerId(lyr.id);
        return;
      }
    }
    // Deselect if click empty canvas
    setSelectedLayerId(null);
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
      className="relative flex-1 h-full bg-[#0D0D0D] flex items-center justify-center overflow-hidden select-none"
    >
      {/* 9:16 Canvas Box */}
      <div
        className="relative shadow-2xl border border-[#333333]"
        style={{
          width: `${1080 * viewportScale}px`,
          height: `${1920 * viewportScale}px`,
        }}
      >
        <canvas
          ref={canvasRef}
          width={1080}
          height={1920}
          onClick={handleCanvasClick}
          onDoubleClick={handleDoubleClick}
          className="w-full h-full cursor-default"
        />

        {/* Snap Guide Lines */}
        {snapGuides.x !== null && (
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-[#FF6A00] pointer-events-none z-30"
            style={{ left: `${snapGuides.x * viewportScale}px` }}
          />
        )}
        {snapGuides.y !== null && (
          <div
            className="absolute left-0 right-0 h-[1px] bg-[#FF6A00] pointer-events-none z-30"
            style={{ top: `${snapGuides.y * viewportScale}px` }}
          />
        )}

        {/* Transform Gizmo overlay for selected layer */}
        {selectedLayer && (
          <TransformGizmo
            layer={selectedLayer}
            canvasScale={viewportScale}
            viewportOffset={{ x: 0, y: 0 }}
            onTransformChange={(t) => updateLayerTransform(selectedLayer.id, t)}
            onSnapGuideChange={setSnapGuides}
          />
        )}
      </div>

      {/* Canvas Dimensions Badge */}
      <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded text-[10px] font-mono text-[#888888] border border-[#222222]">
        9:16 1080×1920 ({Math.round(viewportScale * 100)}%)
      </div>
    </div>
  );
};
