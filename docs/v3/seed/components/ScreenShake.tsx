import React from "react";
import { useCurrentFrame } from "remotion";

export interface ScreenShakeProps {
  children: React.ReactNode;
  active?: boolean;
  intensity?: number;
  decay?: number;
  startFrame?: number;
}

export const ScreenShake: React.FC<ScreenShakeProps> = ({
  children,
  active = false,
  intensity = 15,
  decay = 0.96,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();

  if (!active || frame < startFrame) {
    return <div style={{ width: "100%", height: "100%" }}>{children}</div>;
  }

  const elapsed = frame - startFrame;
  const currentIntensity = Math.max(0, intensity * Math.pow(decay, elapsed * 0.05));

  const x = Math.sin(frame * 0.85) * currentIntensity + Math.cos(frame * 1.4) * (currentIntensity * 0.35);
  const y = Math.cos(frame * 0.75) * currentIntensity + Math.sin(frame * 1.2) * (currentIntensity * 0.35);
  const rotate = Math.sin(frame * 0.5) * (currentIntensity * 0.08);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg)`,
      }}
    >
      {children}
    </div>
  );
};
