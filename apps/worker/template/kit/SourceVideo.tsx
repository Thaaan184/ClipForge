import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";

export interface SourceVideoProps {
  src?: string;
  volume?: number;
}

export const SourceVideo: React.FC<SourceVideoProps> = ({
  src = "clip_source.mp4",
  volume = 1.0,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      <OffthreadVideo
        src={staticFile(src)}
        volume={volume}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </AbsoluteFill>
  );
};
