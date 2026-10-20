import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface CartoonTextBoxProps {
  children: React.ReactNode;
  bg?: string;
  textColor?: string;
  borderColor?: string;
  borderWidth?: number;
  shadowOffset?: number;
  shadowColor?: string;
  rotation?: number;
  scale?: number;
  padding?: string;
  fontSize?: number;
  style?: React.CSSProperties;
  burst?: boolean;
}

export const CartoonTextBox: React.FC<CartoonTextBoxProps> = ({
  children,
  bg = "#FFDE00",
  textColor = "#000000",
  borderColor = "#000000",
  borderWidth = 5,
  shadowOffset = 6,
  shadowColor = "#000000",
  rotation = -2,
  scale = 1,
  padding = "14px 28px",
  fontSize = 38,
  style = {},
  burst = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Cartoon bouncy entry physics
  const bounce = spring({
    frame,
    fps,
    config: {
      damping: 10,
      stiffness: 180,
      mass: 0.8,
    },
  });

  const finalScale = scale * bounce;

  return (
    <div
      style={{
        display: "inline-block",
        position: "relative",
        transform: `scale(${finalScale}) rotate(${rotation}deg)`,
        transformOrigin: "center center",
        ...style,
      }}
    >
      {/* Optional comic speech burst spikes behind container */}
      {burst && (
        <svg
          style={{
            position: "absolute",
            top: -24,
            left: -24,
            width: "calc(100% + 48px)",
            height: "calc(100% + 48px)",
            zIndex: 0,
            pointerEvents: "none",
          }}
          viewBox="0 0 200 100"
          preserveAspectRatio="none"
        >
          <polygon
            points="10,50 0,30 25,20 15,0 45,15 65,0 80,18 110,2 120,20 150,5 155,25 185,15 175,38 200,45 180,60 195,75 165,70 170,95 140,80 125,98 105,82 85,100 70,80 40,95 45,72 15,80 25,58"
            fill={bg}
            stroke={borderColor}
            strokeWidth="5"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Comic Neo-brutalist Box */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          backgroundColor: bg,
          color: textColor,
          border: `${borderWidth}px solid ${borderColor}`,
          borderRadius: 8,
          boxShadow: `${shadowOffset}px ${shadowOffset}px 0px ${shadowColor}`,
          padding,
          fontFamily: "'Bangers', 'Luckiest Guy', 'Impact', sans-serif",
          fontSize,
          letterSpacing: 2,
          lineHeight: 1.15,
          textTransform: "uppercase",
          textAlign: "center",
          WebkitTextStroke: "1.5px #000000",
          textShadow: "2px 2px 0px rgba(0,0,0,0.3)",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
};
