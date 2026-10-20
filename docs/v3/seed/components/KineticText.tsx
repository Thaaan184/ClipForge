import React from "react";

interface KineticTextProps {
  text: string;
  fontSize?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowOffset?: number;
  rotation?: number;
  scale?: number;
  letterSpacing?: number;
  lineHeight?: number;
  textAlign?: "center" | "left" | "right";
  style?: React.CSSProperties;
}

export const KineticText: React.FC<KineticTextProps> = ({
  text,
  fontSize = 90,
  color = "#CCFF00",
  strokeColor = "#111111",
  strokeWidth = 10,
  shadowColor = "#000000",
  shadowOffset = 12,
  rotation = 0,
  scale = 1.0,
  letterSpacing = 2,
  lineHeight = 1.05,
  textAlign = "center",
  style = {},
}) => {
  return (
    <div
      style={{
        display: "inline-block",
        transform: `rotate(${rotation}deg) scale(${scale})`,
        fontFamily: "'Impact', 'Arial Black', sans-serif",
        fontSize,
        lineHeight,
        letterSpacing,
        textAlign,
        color,
        WebkitTextStroke: `${strokeWidth}px ${strokeColor}`,
        paintOrder: "stroke fill",
        filter: `drop-shadow(${shadowOffset}px ${shadowOffset}px 0px ${shadowColor})`,
        textTransform: "uppercase",
        userSelect: "none",
        ...style,
      }}
    >
      {text}
    </div>
  );
};
