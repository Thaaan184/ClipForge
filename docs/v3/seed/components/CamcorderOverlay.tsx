import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

export const CamcorderOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Blinking REC dot every 30 frames (0.5s @ 60fps)
  const isRecVisible = Math.floor(frame / 30) % 2 === 0;

  // Format timecode HH:MM:SS:FF
  const totalSeconds = Math.floor(frame / fps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frameRemainder = frame % fps;
  const timecode = `00:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frameRemainder).padStart(2, "0")}`;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 50, padding: 48, boxSizing: "border-box" }}>
      {/* Top Bar: REC + Mode + Battery */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              backgroundColor: isRecVisible ? "#FF0033" : "transparent",
              boxShadow: isRecVisible ? "0 0 16px #FF0033" : "none",
              transition: "opacity 0.1s ease",
            }}
          />
          <span
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontWeight: 900,
              fontSize: 34,
              color: "#FFFFFF",
              letterSpacing: 3,
              textShadow: "0 2px 8px rgba(0,0,0,0.85)",
            }}
          >
            REC ●
          </span>
        </div>

        <div
          style={{
            fontFamily: "'Courier New', Courier, monospace",
            fontWeight: 800,
            fontSize: 26,
            color: "#CCFF00",
            letterSpacing: 2,
            textShadow: "0 2px 8px rgba(0,0,0,0.85)",
            border: "2px solid #CCFF00",
            padding: "4px 12px",
            borderRadius: 4,
          }}
        >
          Y2K CAM
        </div>

        {/* Battery Icon */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 52,
              height: 26,
              border: "3px solid #FFFFFF",
              borderRadius: 4,
              padding: 2,
              display: "flex",
              gap: 2,
              boxShadow: "0 2px 8px rgba(0,0,0,0.85)",
            }}
          >
            <div style={{ flex: 1, backgroundColor: "#00FF66", borderRadius: 1 }} />
            <div style={{ flex: 1, backgroundColor: "#00FF66", borderRadius: 1 }} />
            <div style={{ flex: 1, backgroundColor: "#00FF66", borderRadius: 1 }} />
          </div>
          <div style={{ width: 4, height: 12, backgroundColor: "#FFFFFF", borderRadius: "0 2px 2px 0" }} />
        </div>
      </div>

      {/* Center Viewfinder Reticle / Crosshair */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 80,
          height: 80,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: 0.65,
        }}
      >
        <div style={{ position: "absolute", width: "100%", height: 2, backgroundColor: "rgba(255,255,255,0.7)" }} />
        <div style={{ position: "absolute", height: "100%", width: 2, backgroundColor: "rgba(255,255,255,0.7)" }} />
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.8)",
          }}
        />
      </div>

      {/* Viewfinder Corners */}
      {/* Top Left */}
      <div style={{ position: "absolute", top: 40, left: 40, width: 40, height: 40, borderTop: "4px solid #FFFFFF", borderLeft: "4px solid #FFFFFF" }} />
      {/* Top Right */}
      <div style={{ position: "absolute", top: 40, right: 40, width: 40, height: 40, borderTop: "4px solid #FFFFFF", borderRight: "4px solid #FFFFFF" }} />
      {/* Bottom Left */}
      <div style={{ position: "absolute", bottom: 40, left: 40, width: 40, height: 40, borderBottom: "4px solid #FFFFFF", borderLeft: "4px solid #FFFFFF" }} />
      {/* Bottom Right */}
      <div style={{ position: "absolute", bottom: 40, right: 40, width: 40, height: 40, borderBottom: "4px solid #FFFFFF", borderRight: "4px solid #FFFFFF" }} />

      {/* Bottom Bar: Audio Meter & Timecode */}
      <div
        style={{
          position: "absolute",
          bottom: 48,
          left: 48,
          right: 48,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: 20, color: "#AAAAAA", fontWeight: 700 }}>
            AUDIO CH1 [||||||||||||....]
          </span>
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: 20, color: "#AAAAAA", fontWeight: 700 }}>
            AUTO WB / 60FPS / ISO 400
          </span>
        </div>

        <div
          style={{
            fontFamily: "'Courier New', Courier, monospace",
            fontWeight: 900,
            fontSize: 36,
            color: "#FFFFFF",
            letterSpacing: 4,
            textShadow: "0 2px 10px rgba(0,0,0,0.9)",
          }}
        >
          {timecode}
        </div>
      </div>
    </AbsoluteFill>
  );
};
