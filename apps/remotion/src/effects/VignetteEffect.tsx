import React from 'react';
import { AbsoluteFill } from 'remotion';

type VignetteEffectProps = {
  enabled: boolean;
  intensity: number;
};

export const VignetteEffect: React.FC<VignetteEffectProps> = ({
  enabled,
  intensity,
}) => {
  if (!enabled) return null;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(
          ellipse at center,
          transparent 40%,
          rgba(0, 0, 0, ${intensity * 0.6}) 100%
        )`,
        pointerEvents: "none",
        zIndex: 90,
      }}
    />
  );
};
