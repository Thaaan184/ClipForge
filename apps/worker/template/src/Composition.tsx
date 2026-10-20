import React from "react";
import { AbsoluteFill } from "remotion";
import { SourceVideo } from "../kit/SourceVideo";
import { KineticCaptions } from "../kit/KineticCaptions";
import { PunchZoom } from "../kit/PunchZoom";
import manifestData from "../context/manifest.json";

export const EditorialComposition: React.FC = () => {
  const words = (manifestData as any).transcript?.words || [];
  const peaks = (manifestData as any).signals?.peaks || [];

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <PunchZoom peaks={peaks} zoomFactor={1.12}>
        <SourceVideo src="clip_source.mp4" />
      </PunchZoom>
      <KineticCaptions words={words} />
    </AbsoluteFill>
  );
};
