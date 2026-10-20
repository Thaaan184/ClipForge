import React from "react";
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export interface SilenceRange {
  start: number;
  end: number;
}

export interface DuckedMusicProps {
  src: string;
  silences?: SilenceRange[];
  loudVolume?: number;  // Volume during silence (speech absent)
  duckedVolume?: number; // Volume during speech
}

export const DuckedMusic: React.FC<DuckedMusicProps> = ({
  src,
  silences = [],
  loudVolume = 0.45,
  duckedVolume = 0.12,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // Determine if current time falls inside a silence range
  const isSilent = silences.some(
    (range) => currentTime >= range.start && currentTime <= range.end
  );

  const targetVolume = isSilent ? loudVolume : duckedVolume;

  return <Audio src={staticFile(src)} volume={targetVolume} />;
};
