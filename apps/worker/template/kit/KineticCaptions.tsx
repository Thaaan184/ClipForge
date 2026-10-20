import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { getSafeZoneBounds } from "./safezone";

export interface WordData {
  w: string;
  start: number;
  end: number;
  conf?: number;
}

export interface KineticCaptionsProps {
  words: WordData[];
  fontSize?: number;
  activeColor?: string;
  textColor?: string;
  backgroundColor?: string;
}

export const KineticCaptions: React.FC<KineticCaptionsProps> = ({
  words = [],
  fontSize = 44,
  activeColor = "#FFE600",
  textColor = "#FFFFFF",
  backgroundColor = "rgba(0, 0, 0, 0.65)",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // Find currently active word
  const activeWordIndex = words.findIndex(
    (w) => currentTime >= w.start && currentTime <= w.end
  );

  if (activeWordIndex === -1 && words.length > 0) {
    // If no word is currently active, hide captions
    return null;
  }

  // Create a small sliding window of up to 4 words around active word
  const startIndex = Math.max(0, activeWordIndex - 1);
  const visibleWords = words.slice(startIndex, startIndex + 4);

  const safeBounds = getSafeZoneBounds();

  return (
    <div
      style={{
        position: "absolute",
        bottom: safeBounds.bottomPx + 40,
        left: 0,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "12px",
          padding: "12px 24px",
          backgroundColor,
          borderRadius: "16px",
          maxWidth: "85%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {visibleWords.map((word, idx) => {
          const isActive = currentTime >= word.start && currentTime <= word.end;
          return (
            <span
              key={`${word.w}-${idx}`}
              style={{
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontWeight: 900,
                fontSize,
                color: isActive ? activeColor : textColor,
                textTransform: "uppercase",
                transform: isActive ? "scale(1.15)" : "scale(1.0)",
                transition: "transform 0.1s ease",
                textShadow: "0 2px 8px rgba(0,0,0,0.8)",
              }}
            >
              {word.w}
            </span>
          );
        })}
      </div>
    </div>
  );
};
