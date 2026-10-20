import React from "react";
import { Composition } from "remotion";
import { EditorialComposition } from "./Composition";
import manifestData from "../context/manifest.json";

export const RemotionRoot: React.FC = () => {
  const fps = manifestData.clip?.fps || 30;
  const durationS = manifestData.clip?.duration || 10;
  const durationInFrames = Math.max(1, Math.round(durationS * fps));

  return (
    <Composition
      id="Main"
      component={EditorialComposition}
      durationInFrames={durationInFrames}
      fps={fps}
      width={1080}
      height={1920}
    />
  );
};
