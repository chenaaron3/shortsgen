import React from 'react';
import { Img, useCurrentFrame } from 'remotion';

const GLITCH_STRIPS = 8;

/** Deterministic offset for glitch slice i at frame f (reproducible per render) */
function glitchOffset(frame: number, stripIndex: number): number {
  const seed =
    Math.sin(frame * 13 + stripIndex * 7) * 10 +
    Math.sin(frame * 23 + stripIndex * 11) * 6;
  return (Math.round(seed) % 12) - 6; // -6 to 6px
}

export type GlitchEffectProps = {
  imageSrc: string;
  intensity: number;
  opacity: number;
};

/** Horizontal slice displacement glitch overlay. Parent must have position: relative. */
export const GlitchEffect: React.FC<GlitchEffectProps> = ({
  imageSrc,
  intensity,
  opacity,
}) => {
  const frame = useCurrentFrame();

  if (intensity <= 0.01) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {Array.from({ length: GLITCH_STRIPS }, (_, i) => {
        const offset = glitchOffset(frame, i) * intensity;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: `${(i * 100) / GLITCH_STRIPS}%`,
              width: "100%",
              height: `${100 / GLITCH_STRIPS}%`,
              overflow: "hidden",
            }}
          >
            <Img
              src={imageSrc}
              style={{
                position: "absolute",
                left: 0,
                top: `${-(i * 100)}%`,
                width: "100%",
                height: `${GLITCH_STRIPS * 100}%`,
                objectFit: "cover",
                objectPosition: "center top",
                opacity,
                transform: `translateX(${offset}px)`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
