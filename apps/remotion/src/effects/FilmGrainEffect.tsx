import React from 'react';
import { useCurrentFrame } from 'remotion';

const DUST_SPOT_COUNT = 25;
const SCRATCH_COUNT = 5;

/** Deterministic 0–1 value from seed (reproducible) */
function hash(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export type FilmGrainEffectProps = {
  intensity?: number;
};

/**
 * Spotty, old movie film overlay: grain texture + dust spots + light scratches.
 * Parent must have position: relative.
 */
export const FilmGrainEffect: React.FC<FilmGrainEffectProps> = ({
  intensity = 1,
}) => {
  const frame = useCurrentFrame();

  if (intensity <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Film grain via SVG feTurbulence */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="shortgen-film-grain" x="0" y="0">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={`${0.015 + hash(frame * 0.1) * 0.005} 0.015`}
              numOctaves={3}
              stitchTiles="stitch"
            />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0.15 0"
            />
          </filter>
        </defs>
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          filter: "url(#shortgen-film-grain)",
          opacity: intensity,
        }}
      />

      {/* Dust spots - appear/disappear over time */}
      {Array.from({ length: DUST_SPOT_COUNT }, (_, i) => {
        const x = hash(i * 7.3) * 100;
        const y = hash(i * 11.7) * 100;
        const size = 1 + hash(i * 13) * 3;
        const phase = (frame + i * 17) % 60;
        const visible = phase < 20 || (phase > 40 && phase < 45);
        const spotOpacity = visible ? hash(i * 19) * 0.4 + 0.1 : 0;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              backgroundColor: "rgba(255, 255, 255, 0.6)",
              opacity: spotOpacity * intensity,
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}

      {/* Light scratches - thin horizontal lines */}
      {Array.from({ length: SCRATCH_COUNT }, (_, i) => {
        const y = hash(i * 23 + 1) * 100;
        const len = 30 + hash(i * 31) * 40;
        const left = hash(i * 41) * (100 - len);
        const phase = (frame + i * 7) % 90;
        const visible = phase < 3;
        const scratchOpacity = visible ? 0.08 * intensity : 0;

        return (
          <div
            key={`scratch-${i}`}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${y}%`,
              width: `${len}%`,
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
              opacity: scratchOpacity,
            }}
          />
        );
      })}
    </div>
  );
};
