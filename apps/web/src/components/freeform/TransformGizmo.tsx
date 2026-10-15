import React, { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { LayerConfig } from "../../types";

interface TransformGizmoProps {
  layer: LayerConfig;
  canvasScale: number; // Scale from canvas 1080x1920 to viewport pixels
  viewportOffset: { x: number; y: number };
  onTransformChange: (t: Partial<LayerConfig["transform"]>) => void;
  onSnapGuideChange?: (guides: { x: number | null; y: number | null }) => void;
}

type HandleType = "move" | "rot" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const TransformGizmo: React.FC<TransformGizmoProps> = ({
  layer,
  canvasScale,
  viewportOffset,
  onTransformChange,
  onSnapGuideChange,
}) => {
  const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [initialTransform, setInitialTransform] = useState<LayerConfig["transform"] | null>(null);

  const t = layer.transform;

  // Viewport coordinates of center
  const screenCx = viewportOffset.x + t.cx * canvasScale;
  const screenCy = viewportOffset.y + t.cy * canvasScale;
  const screenW = t.w * canvasScale;
  const screenH = t.h * canvasScale;

  useEffect(() => {
    if (!activeHandle || !startPos || !initialTransform) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = (e.clientX - startPos.x) / canvasScale;
      const dy = (e.clientY - startPos.y) / canvasScale;

      if (activeHandle === "move") {
        let newCx = Math.round(initialTransform.cx + dx);
        let newCy = Math.round(initialTransform.cy + dy);

        // Center snap guides (within 10px)
        let snapX: number | null = null;
        let snapY: number | null = null;
        if (Math.abs(newCx - 540) < 10) {
          newCx = 540;
          snapX = 540;
        }
        if (Math.abs(newCy - 960) < 10) {
          newCy = 960;
          snapY = 960;
        }
        onSnapGuideChange?.({ x: snapX, y: snapY });
        onTransformChange({ cx: newCx, cy: newCy });
      } else if (activeHandle === "rot") {
        const mouseX = (e.clientX - viewportOffset.x) / canvasScale;
        const mouseY = (e.clientY - viewportOffset.y) / canvasScale;
        const angleRad = Math.atan2(mouseY - initialTransform.cy, mouseX - initialTransform.cx);
        let angleDeg = Math.round((angleRad * 180) / Math.PI + 90);

        // Wrap to (-180, 180]
        while (angleDeg <= -180) angleDeg += 360;
        while (angleDeg > 180) angleDeg -= 360;

        // Snap to 0, 90, -90, 180 if close
        if (Math.abs(angleDeg) < 3) angleDeg = 0;
        else if (Math.abs(angleDeg - 90) < 3) angleDeg = 90;
        else if (Math.abs(angleDeg + 90) < 3) angleDeg = -90;
        else if (Math.abs(Math.abs(angleDeg) - 180) < 3) angleDeg = 180;

        onTransformChange({ rotation: angleDeg });
      } else {
        // Resize handles along rotated axes
        const radAngle = (initialTransform.rotation * Math.PI) / 180;
        const cos = Math.cos(-radAngle);
        const sin = Math.sin(-radAngle);
        const localDx = dx * cos - dy * sin;
        const localDy = dx * sin + dy * cos;

        let dw = 0;
        let dh = 0;
        let dCenterLocalX = 0;
        let dCenterLocalY = 0;

        if (activeHandle.includes("e")) {
          dw = localDx;
          dCenterLocalX = localDx / 2;
        }
        if (activeHandle.includes("w")) {
          dw = -localDx;
          dCenterLocalX = localDx / 2;
        }
        if (activeHandle.includes("s")) {
          dh = localDy;
          dCenterLocalY = localDy / 2;
        }
        if (activeHandle.includes("n")) {
          dh = -localDy;
          dCenterLocalY = localDy / 2;
        }

        let newW = Math.max(40, initialTransform.w + dw);
        let newH = Math.max(40, initialTransform.h + dh);

        if (layer.transform.lock_aspect || e.shiftKey) {
          const ratio = initialTransform.w / initialTransform.h;
          if (Math.abs(dw) > Math.abs(dh)) {
            newH = Math.max(40, Math.round(newW / ratio));
          } else {
            newW = Math.max(40, Math.round(newH * ratio));
          }
        }

        // Convert center shift back to world coordinates
        const worldCos = Math.cos(radAngle);
        const worldSin = Math.sin(radAngle);
        const shiftX = dCenterLocalX * worldCos - dCenterLocalY * worldSin;
        const shiftY = dCenterLocalX * worldSin + dCenterLocalY * worldCos;

        onTransformChange({
          w: Math.round(newW),
          h: Math.round(newH),
          cx: Math.round(initialTransform.cx + shiftX),
          cy: Math.round(initialTransform.cy + shiftY),
        });
      }
    };

    const handlePointerUp = () => {
      setActiveHandle(null);
      setStartPos(null);
      setInitialTransform(null);
      onSnapGuideChange?.({ x: null, y: null });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    activeHandle,
    startPos,
    initialTransform,
    canvasScale,
    viewportOffset,
    layer.transform.lock_aspect,
    onTransformChange,
    onSnapGuideChange,
  ]);

  if (layer.locked) return null;

  const startDrag = (handle: HandleType, e: React.PointerEvent) => {
    e.stopPropagation();
    setActiveHandle(handle);
    setStartPos({ x: e.clientX, y: e.clientY });
    setInitialTransform({ ...layer.transform });
  };

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${screenCx}px`,
        top: `${screenCy}px`,
        width: `${screenW}px`,
        height: `${screenH}px`,
        transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
      }}
    >
      {/* Box Border */}
      <div className="absolute inset-0 border border-[#00FFCC] pointer-events-none" />

      {/* Rotation handle with stalk */}
      <div
        className="absolute left-1/2 -top-6 -translate-x-1/2 flex flex-col items-center pointer-events-auto cursor-grab"
        onPointerDown={(e) => startDrag("rot", e)}
      >
        <div className="w-5 h-5 rounded-full bg-[#00FFCC] text-black flex items-center justify-center shadow">
          <RotateCw size={10} />
        </div>
        <div className="w-0.5 h-3 bg-[#00FFCC]" />
      </div>

      {/* 8 Resize Handles */}
      {[
        { id: "nw", pos: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
        { id: "n", pos: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize" },
        { id: "ne", pos: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
        { id: "e", pos: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize" },
        { id: "se", pos: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize" },
        { id: "s", pos: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize" },
        { id: "sw", pos: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize" },
        { id: "w", pos: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize" },
      ].map((h) => (
        <div
          key={h.id}
          className={`absolute w-3 h-3 bg-white border border-[#00FFCC] rounded-sm pointer-events-auto ${h.pos}`}
          onPointerDown={(e) => startDrag(h.id as HandleType, e)}
        />
      ))}
    </div>
  );
};
