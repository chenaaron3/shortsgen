import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

type SceneFlashProps = {
  enabled: boolean;
  intensity: number;
  color: string;
  isFirstScene?: boolean;
  skipFirstScene?: boolean;
};

export const SceneFlash: React.FC<SceneFlashProps> = ({
  enabled,
  intensity,
  color,
  isFirstScene = false,
  skipFirstScene = true,
}) => {
  const frame = useCurrentFrame();

  if (!enabled) return null;
  if (skipFirstScene && isFirstScene) return null;

  const opacity = interpolate(
    frame,
    [0, 3, 8],
    [intensity, intensity * 0.6, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color,
        opacity,
        pointerEvents: "none",
        zIndex: 40,
      }}
    />
  );
};
