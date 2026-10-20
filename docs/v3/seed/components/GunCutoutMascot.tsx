import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export interface GunCutoutMascotProps {
  mode?: "running" | "thinking" | "triggered" | "idle";
  size?: number;
  badgeText?: string;
  subText?: string;
  sweat?: boolean;
  style?: React.CSSProperties;
}

export const GunCutoutMascot: React.FC<GunCutoutMascotProps> = ({
  mode = "running",
  size = 200,
  badgeText,
  subText,
  sweat = false,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 12fps Stepped Frame (Stop-motion feel ala South Park / Spider-Verse)
  const steppedFrame = Math.floor(frame / 4);

  // Cartoon Squash & Stretch bounce entry
  const entrySpring = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 180, mass: 0.8 },
  });

  // Mode calculations
  let rot = 0;
  let scaleX = entrySpring;
  let scaleY = entrySpring;
  let filter = "none";
  let shakeX = 0;
  let shakeY = 0;

  if (mode === "running") {
    // Stepped gait wobble
    rot = (steppedFrame % 2 === 0 ? 1 : -1) * 8;
    scaleX = entrySpring * (1 + (steppedFrame % 2 === 0 ? 0.08 : -0.08));
    scaleY = entrySpring * (1 - (steppedFrame % 2 === 0 ? 0.08 : -0.08));
    shakeY = Math.abs(Math.sin(steppedFrame * 0.8)) * -12;
  } else if (mode === "thinking") {
    rot = Math.sin(steppedFrame * 0.5) * 4;
    scaleX = entrySpring;
    scaleY = entrySpring;
  } else if (mode === "triggered") {
    // Heavy comic rage shake & red comic tint
    rot = (steppedFrame % 2 === 0 ? 1 : -1) * 14;
    scaleX = entrySpring * 1.45;
    scaleY = entrySpring * 1.45;
    shakeX = (steppedFrame % 3 - 1) * 10;
    shakeY = (steppedFrame % 2 === 0 ? 1 : -1) * 10;
    filter = "drop-shadow(0 0 16px #FF2A2A) sepia(0.6) saturate(3) hue-rotate(-50deg)";
  }

  return (
    <div
      style={{
        display: "inline-block",
        position: "relative",
        transform: `translate(${shakeX}px, ${shakeY}px) rotate(${rot}deg) scale(${scaleX}, ${scaleY})`,
        transformOrigin: "bottom center",
        ...style,
      }}
    >
      {/* Cartoon Sweat Drops (Running Mode) */}
      {(sweat || mode === "running") && (
        <>
          <div
            style={{
              position: "absolute",
              top: -10,
              right: -15,
              fontSize: 34,
              transform: `scale(${0.8 + (steppedFrame % 2) * 0.3}) rotate(${20 + (steppedFrame % 3) * 10}deg)`,
              filter: "drop-shadow(2px 2px 0px #000)",
              zIndex: 10,
            }}
          >
            💦
          </div>
          <div
            style={{
              position: "absolute",
              top: 30,
              left: -20,
              fontSize: 28,
              transform: `scale(${0.7 + ((steppedFrame + 1) % 2) * 0.4}) rotate(-25deg)`,
              filter: "drop-shadow(2px 2px 0px #000)",
              zIndex: 10,
            }}
          >
            💦
          </div>
        </>
      )}

      {/* Comic Gear for Thinking Mode */}
      {mode === "thinking" && (
        <div
          style={{
            position: "absolute",
            top: -55,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: 38,
              transform: `rotate(${steppedFrame * 25}deg)`,
              filter: "drop-shadow(3px 3px 0px #000)",
            }}
          >
            ⚙️
          </div>
          <div
            style={{
              fontSize: 28,
              transform: `rotate(${-steppedFrame * 35}deg)`,
              filter: "drop-shadow(3px 3px 0px #000)",
            }}
          >
            ⚙️
          </div>
        </div>
      )}

      {/* Paper-cutout Mascot Sticker: 6px solid white outline + 4px black shadow outline */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: "#FFFDF0",
          border: "6px solid #FFFFFF",
          outline: "4px solid #000000",
          boxShadow: "8px 8px 0px #000000",
          overflow: "hidden",
          position: "relative",
          filter,
        }}
      >
        <Img
          src={staticFile("gun_face.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scale(1.2)",
          }}
        />
      </div>

      {/* Comic Text Badge Attached to Mascot */}
      {badgeText && (
        <div
          style={{
            position: "absolute",
            bottom: -22,
            left: "50%",
            transform: "translateX(-50%) rotate(-3deg)",
            backgroundColor: mode === "triggered" ? "#FF2A2A" : "#FFDE00",
            color: mode === "triggered" ? "#FFFDF0" : "#000000",
            border: "4px solid #000000",
            boxShadow: "5px 5px 0px #000000",
            padding: "6px 16px",
            fontFamily: "'Bangers', 'Luckiest Guy', sans-serif",
            fontSize: 22,
            letterSpacing: 1,
            whiteSpace: "nowrap",
            WebkitTextStroke: "1px #000",
            zIndex: 12,
            borderRadius: 6,
          }}
        >
          {badgeText}
          {subText && (
            <div
              style={{
                fontSize: 14,
                letterSpacing: 0.5,
                color: mode === "triggered" ? "#FFFDF0" : "#222222",
                WebkitTextStroke: "0px",
                fontFamily: "sans-serif",
                fontWeight: 900,
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
