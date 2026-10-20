import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface SubtitleCue {
  id: string;
  startFrame: number;
  endFrame: number;
  text: string;
  speaker?: "troll" | "gun" | "punchline" | "system";
  position?: "bottom" | "center" | "top";
  shake?: boolean;
  fontSize?: number;
}

export const SUBTITLES: SubtitleCue[] = [
  // Scene 1
  {
    id: "s1-clutch",
    startFrame: 480,
    endFrame: 600,
    text: "CLUTCH! TAPI TUNGGU DULU... 👀",
    speaker: "system",
    position: "bottom",
    fontSize: 44,
  },
  // Scene 2: The Bait
  {
    id: "s2-bait",
    startFrame: 660,
    endFrame: 840,
    text: "OP DI MID! AMANIN! LARI LARI LARI!! 🏃‍♂️💨",
    speaker: "troll",
    position: "bottom",
    shake: true,
    fontSize: 48,
  },
  // Scene 3: The Marathon
  {
    id: "s3-sing",
    startFrame: 900,
    endFrame: 1200,
    text: "🎵 (Nyanyi santai sambil nunggu defuse) 🎵",
    speaker: "troll",
    position: "bottom",
    fontSize: 40,
  },
  {
    id: "s3-manuver",
    startFrame: 1200,
    endFrame: 1350,
    text: "Salah manuver mas... 🤣",
    speaker: "troll",
    position: "bottom",
    fontSize: 46,
  },
  {
    id: "s3-where-awp",
    startFrame: 1560,
    endFrame: 1720,
    text: "AWP-NYA DI MANA?! 🤨",
    speaker: "gun",
    position: "bottom",
    shake: true,
    fontSize: 54,
  },
  // Scene 4: Realization & Punchline
  {
    id: "s4-babi",
    startFrame: 2220,
    endFrame: 2440,
    text: "EH! B*BI!! 🐷🤬",
    speaker: "punchline",
    position: "center",
    shake: true,
    fontSize: 76,
  },
  {
    id: "s4-prank",
    startFrame: 2320,
    endFrame: 2600,
    text: "KENA PRANK HALFTIME 💀🤣",
    speaker: "punchline",
    position: "bottom",
    shake: true,
    fontSize: 58,
  },
  {
    id: "s4-dukung",
    startFrame: 2460,
    endFrame: 2680,
    text: "Gua dukung anj*ng wkwkwk 🤣",
    speaker: "troll",
    position: "bottom",
    fontSize: 46,
  },
  {
    id: "s4-nahan",
    startFrame: 2800,
    endFrame: 2980,
    text: "Gua dari tadi diem nahan ketawa 😭",
    speaker: "troll",
    position: "bottom",
    fontSize: 44,
  },
];

export const DynamicSubtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Find active cues
  const activeCues = SUBTITLES.filter(
    (c) => frame >= c.startFrame && frame <= c.endFrame
  );

  if (activeCues.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 80,
      }}
    >
      {activeCues.map((cue) => {
        const rel = frame - cue.startFrame;
        const pop = spring({
          frame: rel,
          fps,
          config: { damping: 12, stiffness: 140, mass: 0.7 },
        });

        // Exit fade
        const exitDuration = 12;
        const exitFrame = cue.endFrame - cue.startFrame;
        const opacity = interpolate(
          rel,
          [0, 6, exitFrame - exitDuration, exitFrame],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        // Shake if specified
        let shakeX = 0;
        let shakeY = 0;
        if (cue.shake) {
          shakeX = Math.sin(frame * 1.5) * 6;
          shakeY = Math.cos(frame * 1.8) * 5;
        }

        // Color coding
        let color = "#FFD700"; // Teammates (Troll) default
        let glow = "rgba(255, 215, 0, 0.7)";
        let bg = "rgba(10, 15, 25, 0.82)";
        let border = "3px solid #FFD700";

        if (cue.speaker === "gun") {
          color = "#00FFFF";
          glow = "rgba(0, 255, 255, 0.8)";
          border = "3px solid #00FFFF";
        } else if (cue.speaker === "punchline") {
          color = "#FF3333";
          glow = "rgba(255, 51, 51, 0.9)";
          bg = "rgba(20, 0, 0, 0.9)";
          border = "4px solid #FF3333";
        } else if (cue.speaker === "system") {
          color = "#FFFFFF";
          glow = "rgba(255, 255, 255, 0.7)";
          border = "3px solid #FFFFFF";
        }

        // Positioning
        let top = "auto";
        let bottom = "220px";
        if (cue.position === "center") {
          top = "50%";
          bottom = "auto";
        } else if (cue.position === "top") {
          top = "180px";
          bottom = "auto";
        }

        return (
          <div
            key={cue.id}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top,
              bottom,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              transform: `translate3d(${shakeX}px, ${shakeY}px, 0) scale(${pop})`,
              opacity,
            }}
          >
            <div
              style={{
                maxWidth: "88%",
                background: bg,
                border,
                borderRadius: 22,
                padding: "14px 32px",
                boxShadow: `0 12px 36px rgba(0,0,0,0.85), 0 0 30px ${glow}`,
                textAlign: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "'Montserrat', 'Rubik', 'Impact', sans-serif",
                  fontWeight: 900,
                  fontSize: cue.fontSize || 48,
                  color,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  WebkitTextStroke: "4px #000000",
                  textShadow:
                    "0 0 15px rgba(0,0,0,0.9), 3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000",
                  lineHeight: 1.15,
                  display: "inline-block",
                }}
              >
                {cue.text}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
