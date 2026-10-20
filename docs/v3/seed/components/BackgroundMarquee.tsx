import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

interface BackgroundMarqueeProps {
  primaryColor?: string;
  secondaryColor?: string;
  speed?: number;
}

export const BackgroundMarquee: React.FC<BackgroundMarqueeProps> = ({
  primaryColor = "#CCFF00",
  secondaryColor = "#FF0055",
  speed = 4,
}) => {
  const frame = useCurrentFrame();

  // Marquee scroll offset
  const offset = (frame * speed) % 800;

  const phrase1 = "HIPDUT CULT // BARUDAK ENERGI // KOPLO DIGOYANG // 130 BPM // SIKAT MIRING // ";
  const phrase2 = "MATUR SUWUN BARUDAK // STREETWEAR LOKAL // LOCAL PRIDE // WEEEAAA // ";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#111111",
        overflow: "hidden",
        zIndex: 0,
      }}
    >
      {/* Halftone / Dot Grid Matrix Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(255, 255, 255, 0.12) 2px, transparent 2px)",
          backgroundSize: "28px 28px",
          opacity: 0.8,
        }}
      />

      {/* Diagonal Strip 1 (Neon Yellow / Green) */}
      <div
        style={{
          position: "absolute",
          top: "18%",
          left: "-30%",
          width: "160%",
          height: 110,
          backgroundColor: primaryColor,
          transform: "rotate(-12deg)",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          boxShadow: "0 12px 30px rgba(0,0,0,0.6)",
          borderTop: "6px solid #111111",
          borderBottom: "6px solid #111111",
        }}
      >
        <div
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            transform: `translateX(-${offset}px)`,
            fontFamily: "'Impact', 'Arial Black', sans-serif",
            fontSize: 48,
            color: "#111111",
            letterSpacing: 2,
          }}
        >
          <span>{phrase1.repeat(4)}</span>
        </div>
      </div>

      {/* Diagonal Strip 2 (Hot Pink) */}
      <div
        style={{
          position: "absolute",
          top: "48%",
          left: "-30%",
          width: "160%",
          height: 95,
          backgroundColor: secondaryColor,
          transform: "rotate(10deg)",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          boxShadow: "0 12px 30px rgba(0,0,0,0.6)",
          borderTop: "6px solid #111111",
          borderBottom: "6px solid #111111",
        }}
      >
        <div
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            transform: `translateX(-${(frame * (speed * 1.3)) % 800}px)`,
            fontFamily: "'Impact', 'Arial Black', sans-serif",
            fontSize: 42,
            color: "#FFFFFF",
            letterSpacing: 2,
            textShadow: "2px 2px 0px #111111",
          }}
        >
          <span>{phrase2.repeat(4)}</span>
        </div>
      </div>

      {/* Diagonal Strip 3 (Deep Gold / Black) */}
      <div
        style={{
          position: "absolute",
          top: "76%",
          left: "-30%",
          width: "160%",
          height: 90,
          backgroundColor: "#FFD700",
          transform: "rotate(-8deg)",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          boxShadow: "0 12px 30px rgba(0,0,0,0.6)",
          borderTop: "6px solid #111111",
          borderBottom: "6px solid #111111",
        }}
      >
        <div
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            transform: `translateX(-${(frame * (speed * 0.9)) % 800}px)`,
            fontFamily: "'Impact', 'Arial Black', sans-serif",
            fontSize: 40,
            color: "#111111",
            letterSpacing: 2,
          }}
        >
          <span>{phrase1.repeat(4)}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
