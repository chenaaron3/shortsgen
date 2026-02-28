import React from 'react';
import { useCurrentFrame } from 'remotion';

type ProgressBarProps = {
  enabled: boolean;
  height: number;
  color: string;
  position: "top" | "bottom";
  durationInFrames: number;
};

export const ProgressBar: React.FC<ProgressBarProps> = ({
  enabled,
  height,
  color,
  position,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  if (!enabled) return null;

  const progress = (frame / durationInFrames) * 100;

  return (
    <div
      style={{
        position: "absolute",
        [position]: 0,
        left: 0,
        width: `${progress}%`,
        height,
        backgroundColor: color,
        pointerEvents: "none",
        zIndex: 95,
      }}
    />
  );
};
