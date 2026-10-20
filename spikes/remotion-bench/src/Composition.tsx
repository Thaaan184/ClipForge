import React from "react";
import { AbsoluteFill, OffthreadVideo, Audio, staticFile } from "remotion";

export const BenchComposition: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={staticFile("sample.mp4")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <Audio src={staticFile("audio.mp3")} volume={0.5} />
    </AbsoluteFill>
  );
};
