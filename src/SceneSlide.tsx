import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';

import { FilmGrainEffect, GlitchEffect } from './effects';

const FADE_FRAMES = 8; // ~0.27s subtle image fade at 30fps
const GLITCH_FRAMES = 25; // ~0.8s of glitch on first scene

type SceneSlideProps = {
  imageSrc: string;
  audioSrc: string;
  durationInFrames: number;
  isFirstScene?: boolean;
};

export const SceneSlide: React.FC<SceneSlideProps> = ({
  imageSrc,
  audioSrc,
  durationInFrames,
  isFirstScene = false,
}) => {
  const frame = useCurrentFrame();
  const fadeOutStart = Math.max(FADE_FRAMES, durationInFrames - FADE_FRAMES);

  // Only fade the image — background stays visible (no black flash)
  const imageOpacity = interpolate(
    frame,
    [0, FADE_FRAMES, fadeOutStart, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Glitch intensity: peak at frame 5–12, fade out by GLITCH_FRAMES
  const glitchIntensity = isFirstScene
    ? interpolate(
      frame,
      [0, 5, 12, GLITCH_FRAMES],
      [0, 1, 1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    )
    : 0;

  const imageWrapperStyle = {
    position: "absolute" as const,
    top: "13%",
    left: "12.5%",
    width: "75%",
    height: "auto" as const,
    zIndex: 1,
  };

  const baseImageStyle = {
    width: "100%",
    height: "auto" as const,
    objectFit: "contain" as const,
    opacity: imageOpacity,
    display: "block" as const,
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        backgroundColor: "#FAF5ED",
      }}
    >
      {/* Image wrapper: base image + glitch overlay */}
      <div style={imageWrapperStyle}>
        <div style={{ position: "relative" as const }}>
          <Img src={imageSrc} style={baseImageStyle} />
          <GlitchEffect
            imageSrc={imageSrc}
            intensity={glitchIntensity}
            opacity={imageOpacity}
          />
        </div>
      </div>
      <Audio src={audioSrc} volume={1} />
    </AbsoluteFill>
  );
};
