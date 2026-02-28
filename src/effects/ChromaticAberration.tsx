import React from 'react';
import { AbsoluteFill } from 'remotion';

type ChromaticAberrationProps = {
  enabled: boolean;
  offset: number;
};

export const ChromaticAberration: React.FC<ChromaticAberrationProps> = ({
  enabled,
  offset,
}) => {
  if (!enabled) return null;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        zIndex: 85,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundColor: "rgba(255,0,0,0.15)",
          transform: `translateX(${offset}px)`,
          mixBlendMode: "multiply",
        }}
      />
      <AbsoluteFill
        style={{
          backgroundColor: "rgba(0,255,255,0.15)",
          transform: `translateX(${-offset}px)`,
          mixBlendMode: "multiply",
        }}
      />
    </AbsoluteFill>
  );
};
