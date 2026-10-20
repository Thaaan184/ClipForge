import React from "react";
import { Img, staticFile } from "remotion";

interface StickerImageProps {
  src: string;
  width?: number | string;
  height?: number | string;
  rotation?: number;
  borderWidth?: number;
  borderColor?: string;
  shadowOffset?: number;
  rgbSplit?: boolean;
  scale?: number;
  style?: React.CSSProperties;
}

export const StickerImage: React.FC<StickerImageProps> = ({
  src,
  width = 540,
  height = "auto",
  rotation = 0,
  borderWidth = 14,
  borderColor = "#FFFFFF",
  shadowOffset = 14,
  rgbSplit = false,
  scale = 1.0,
  style = {},
}) => {
  const imgSrc = src.startsWith("http") || src.startsWith("data:") ? src : staticFile(src);

  const containerStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-block",
    transform: `rotate(${rotation}deg) scale(${scale})`,
    filter: `drop-shadow(${shadowOffset}px ${shadowOffset}px 0px rgba(0, 0, 0, 0.95))`,
    ...style,
  };

  const imageStyle: React.CSSProperties = {
    width,
    height,
    display: "block",
    border: `${borderWidth}px solid ${borderColor}`,
    boxSizing: "border-box",
    borderRadius: 8,
    objectFit: "cover",
  };

  if (!rgbSplit) {
    return (
      <div style={containerStyle}>
        <Img src={imgSrc} style={imageStyle} />
      </div>
    );
  }

  // Chromatic Aberration / RGB Split mode using screen blending layers
  return (
    <div style={containerStyle}>
      {/* Base / Green layer */}
      <div style={{ position: "relative" }}>
        <Img
          src={imgSrc}
          style={{
            ...imageStyle,
            filter: "contrast(1.2) brightness(1.1)",
          }}
        />
        {/* Red Offset Layer */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: "translate(-8px, -4px)",
            mixBlendMode: "screen",
            opacity: 0.8,
            pointerEvents: "none",
          }}
        >
          <Img
            src={imgSrc}
            style={{
              ...imageStyle,
              filter: "url(#red-filter) drop-shadow(0 0 10px red)",
            }}
          />
        </div>
        {/* Cyan Offset Layer */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: "translate(8px, 4px)",
            mixBlendMode: "screen",
            opacity: 0.8,
            pointerEvents: "none",
          }}
        >
          <Img
            src={imgSrc}
            style={{
              ...imageStyle,
              filter: "url(#cyan-filter) drop-shadow(0 0 10px cyan)",
            }}
          />
        </div>
      </div>
    </div>
  );
};
