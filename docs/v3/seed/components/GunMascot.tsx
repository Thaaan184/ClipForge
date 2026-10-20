import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export interface GunMascotProps {
  mode?: "running" | "thinking" | "triggered" | "spinning";
  size?: number;
  badgeText?: string;
  subText?: string;
  style?: React.CSSProperties;
  startFrame?: number;
}

export const GunMascot: React.FC<GunMascotProps> = ({
  mode = "running",
  size = 220,
  badgeText,
  subText,
  style,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relFrame = Math.max(0, frame - startFrame);

  const pop = spring({
    frame: relFrame,
    fps,
    config: { damping: 12, stiffness: 120, mass: 0.8 },
  });

  let bounceY = 0;
  let tilt = 0;
  let customScale = 1;
  let filter = "none";
  let borderColor = "#00FFFF";
  let glowColor = "rgba(0, 255, 255, 0.7)";

  if (mode === "running") {
    bounceY = Math.abs(Math.sin(relFrame * 0.28)) * -24;
    tilt = Math.sin(relFrame * 0.28) * 10;
    borderColor = "#39FF14";
    glowColor = "rgba(57, 255, 20, 0.7)";
  } else if (mode === "thinking") {
    bounceY = Math.sin(relFrame * 0.1) * 6;
    tilt = Math.sin(relFrame * 0.08) * 3;
    borderColor = "#FFD700";
    glowColor = "rgba(255, 215, 0, 0.7)";
  } else if (mode === "triggered") {
    const shakeX = Math.sin(frame * 1.6) * 12;
    const shakeY = Math.cos(frame * 1.8) * 10;
    bounceY = shakeY;
    tilt = Math.sin(frame * 1.2) * 12;
    customScale = 1.35 + Math.sin(frame * 0.4) * 0.1;
    filter = "sepia(0.6) hue-rotate(-60deg) saturate(3.5) contrast(1.2)";
    borderColor = "#FF3333";
    glowColor = "rgba(255, 51, 51, 0.9)";
  } else if (mode === "spinning") {
    const spin = interpolate(relFrame, [0, 30], [0, 360], {
      extrapolateRight: "clamp",
    });
    tilt = spin;
    borderColor = "#00FFFF";
    glowColor = "rgba(0, 255, 255, 0.8)";
  }

  const spinnerAngle = (frame * 12) % 360;

  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: `scale(${pop * customScale}) translate3d(0, ${bounceY}px, 0) rotate(${tilt}deg)`,
        transformOrigin: "center center",
        pointerEvents: "none",
        zIndex: 50,
        ...style,
      }}
    >
      {/* Thought / Loading element if in thinking mode */}
      {mode === "thinking" && (
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(0, 0, 0, 0.85)",
            border: "2px solid #FFD700",
            borderRadius: 30,
            padding: "8px 18px",
            boxShadow: "0 0 20px rgba(255, 215, 0, 0.6)",
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              border: "3px solid rgba(255, 215, 0, 0.3)",
              borderTop: "3px solid #FFD700",
              borderRadius: "50%",
              transform: `rotate(${spinnerAngle}deg)`,
            }}
          />
          <span
            style={{
              fontFamily: "'Montserrat', 'Rubik', sans-serif",
              fontSize: 22,
              fontWeight: 900,
              color: "#FFD700",
              letterSpacing: 1,
            }}
          >
            LOADING OTAK ???
          </span>
        </div>
      )}

      {/* Main Avatar Cutout with Neon Border */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          border: `5px solid ${borderColor}`,
          boxShadow: `0 0 25px ${glowColor}, 0 0 50px ${glowColor}, inset 0 0 15px rgba(0,0,0,0.5)`,
          background: "radial-gradient(circle, #2a2b36 0%, #0d0e15 100%)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          filter,
        }}
      >
        <Img
          src={staticFile("gun_face.png")}
          style={{
            width: "125%",
            height: "125%",
            objectFit: "cover",
            transform: "translateY(-4%)",
          }}
        />
      </div>

      {/* Comic Badges / Floating speech tags */}
      {badgeText && (
        <div
          style={{
            marginTop: 12,
            background: mode === "triggered" ? "#FF0033" : "rgba(10, 15, 28, 0.92)",
            border: `3px solid ${borderColor}`,
            borderRadius: 16,
            padding: "8px 20px",
            boxShadow: `0 8px 24px rgba(0, 0, 0, 0.8), 0 0 20px ${glowColor}`,
            textAlign: "center",
            maxWidth: 320,
          }}
        >
          <div
            style={{
              fontFamily: "'Montserrat', 'Rubik', 'Impact', sans-serif",
              fontSize: 26,
              fontWeight: 900,
              color: mode === "triggered" ? "#FFFFFF" : borderColor,
              textTransform: "uppercase",
              textShadow: "2px 2px 0px #000000",
              lineHeight: 1.15,
            }}
          >
            {badgeText}
          </div>
          {subText && (
            <div
              style={{
                fontFamily: "'Montserrat', 'Rubik', sans-serif",
                fontSize: 18,
                fontWeight: 800,
                color: "#FFFFFF",
                marginTop: 4,
                textShadow: "1px 1px 0px #000000",
              }}
            >
              {subText}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
