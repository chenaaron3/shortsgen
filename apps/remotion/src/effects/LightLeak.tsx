import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

type LightLeakProps = {
  enabled: boolean;
  intensity: number;
  color: string;
};

export const LightLeak: React.FC<LightLeakProps> = ({
  enabled,
  intensity,
  color,
}) => {
  const frame = useCurrentFrame();

  if (!enabled) return null;

  const pulse = interpolate(Math.sin(frame * 0.05), [-1, 1], [0.3, 1]);

  const posX = 30 + Math.sin(frame * 0.02) * 20;
  const posY = 20 + Math.cos(frame * 0.03) * 10;

  const alpha = Math.round(intensity * pulse * 40)
    .toString(16)
    .padStart(2, "0");

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(
          ellipse at ${posX}% ${posY}%,
          ${color}${alpha},
          transparent 60%
        )`,
        pointerEvents: "none",
        zIndex: 80,
      }}
    />
  );
};
