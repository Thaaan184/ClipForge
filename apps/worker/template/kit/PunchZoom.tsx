import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export interface PunchZoomProps {
  children: React.ReactNode;
  peaks?: Array<{ t: number; score?: number }>;
  zoomFactor?: number;
}

export const PunchZoom: React.FC<PunchZoomProps> = ({
  children,
  peaks = [],
  zoomFactor = 1.12,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  let currentScale = 1.0;

  for (const peak of peaks) {
    const timeDelta = currentTime - peak.t;
    // Zoom window: starts 0.1s before peak, peaks at peak, settles back over 0.4s
    if (timeDelta >= -0.1 && timeDelta <= 0.4) {
      const zoomIntensity = interpolate(
        timeDelta,
        [-0.1, 0.0, 0.4],
        [1.0, zoomFactor, 1.0],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }
      );
      currentScale = Math.max(currentScale, zoomIntensity);
    }
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `scale(${currentScale})`,
        transformOrigin: "center center",
        transition: "transform 0.05s linear",
      }}
    >
      {children}
    </div>
  );
};
