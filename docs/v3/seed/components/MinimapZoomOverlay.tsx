import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

export interface MinimapZoomOverlayProps {
  active?: boolean;
  startFrame?: number;
  endFrame?: number;
}

export const MinimapZoomOverlay: React.FC<MinimapZoomOverlayProps> = ({
  active = true,
  startFrame = 900,
  endFrame = 1560,
}) => {
  const frame = useCurrentFrame();

  if (!active || frame < startFrame || frame > endFrame) {
    return null;
  }

  const relFrame = frame - startFrame;
  const totalFrames = endFrame - startFrame;

  // Fade in and out
  const opacity = interpolate(
    relFrame,
    [0, 20, totalFrames - 30, totalFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Animated dashed path tracking Chamber's marathon run
  // Route: Mid -> B Main -> Defender Spawn -> A Screens / A Site
  const pathProgress = interpolate(relFrame, [20, totalFrames - 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pathLength = 850;
  const strokeDashoffset = pathLength * (1 - pathProgress);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity,
        zIndex: 45,
      }}
    >
      {/* Spotlight Radial Mask: Highlights Minimap (top-left), dims the rest */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 320px 320px, rgba(0,0,0,0) 240px, rgba(10,12,20,0.55) 450px, rgba(5,7,12,0.85) 900px)",
        }}
      />

      {/* Minimap Reticle & Radar Sweep HUD */}
      <svg
        style={{
          position: "absolute",
          left: 40,
          top: 40,
          width: 580,
          height: 560,
          overflow: "visible",
        }}
      >
        {/* Radar Ring Glow */}
        <circle
          cx="300"
          cy="290"
          r="250"
          fill="none"
          stroke="#00FFFF"
          strokeWidth="4"
          strokeDasharray="16 8"
          opacity="0.85"
          filter="drop-shadow(0 0 12px #00FFFF)"
        />

        {/* Tactical Crosshairs */}
        <line x1="300" y1="20" x2="300" y2="70" stroke="#00FFFF" strokeWidth="3" opacity="0.8" />
        <line x1="300" y1="510" x2="300" y2="560" stroke="#00FFFF" strokeWidth="3" opacity="0.8" />
        <line x1="30" y1="290" x2="80" y2="290" stroke="#00FFFF" strokeWidth="3" opacity="0.8" />
        <line x1="520" y1="290" x2="570" y2="290" stroke="#00FFFF" strokeWidth="3" opacity="0.8" />

        {/* Chamber Marathon Dashed Run Path: Mid -> B -> Spawn -> A */}
        <path
          d="M 320 330 Q 210 380 180 300 Q 140 180 220 140 Q 320 90 410 170"
          fill="none"
          stroke="#39FF14"
          strokeWidth="8"
          strokeDasharray={pathLength}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          filter="drop-shadow(0 0 14px #39FF14)"
        />

        {/* Start Point (Mid OP) */}
        <circle cx="320" cy="330" r="10" fill="#FFD700" filter="drop-shadow(0 0 10px #FFD700)" />
        <text
          x="340"
          y="338"
          fill="#FFD700"
          fontFamily="'Montserrat', 'Rubik', sans-serif"
          fontWeight="900"
          fontSize="22"
          filter="drop-shadow(2px 2px 0px #000)"
        >
          AWP MID 🎯
        </text>

        {/* Gun's current animated position icon along path */}
        <circle
          cx={
            pathProgress < 0.35
              ? interpolate(pathProgress, [0, 0.35], [320, 180])
              : pathProgress < 0.7
              ? interpolate(pathProgress, [0.35, 0.7], [180, 220])
              : interpolate(pathProgress, [0.7, 1.0], [220, 410])
          }
          cy={
            pathProgress < 0.35
              ? interpolate(pathProgress, [0, 0.35], [330, 300])
              : pathProgress < 0.7
              ? interpolate(pathProgress, [0.35, 0.7], [300, 140])
              : interpolate(pathProgress, [0.7, 1.0], [140, 170])
          }
          r="14"
          fill="#00FFFF"
          stroke="#FFFFFF"
          strokeWidth="4"
          filter="drop-shadow(0 0 16px #00FFFF)"
        />
      </svg>

      {/* Tactical Route Label */}
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 620,
          background: "rgba(5, 10, 22, 0.94)",
          border: "3px solid #39FF14",
          borderRadius: 18,
          padding: "10px 24px",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.8), 0 0 25px rgba(57, 255, 20, 0.5)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 28 }}>🏃‍♂️💨</span>
        <span
          style={{
            fontFamily: "'Montserrat', 'Rubik', sans-serif",
            fontSize: 24,
            fontWeight: 900,
            color: "#39FF14",
            letterSpacing: 1.2,
          }}
        >
          RUTE MUTER: MID ➔ B ➔ SPAWN ➔ A
        </span>
      </div>
    </div>
  );
};
