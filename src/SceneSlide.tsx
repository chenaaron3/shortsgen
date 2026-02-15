import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';

const FADE_FRAMES = 8; // ~0.27s subtle image fade at 30fps

type SceneSlideProps = {
  imageSrc: string;
  audioSrc: string;
  durationInFrames: number;
};

export const SceneSlide: React.FC<SceneSlideProps> = ({
  imageSrc,
  audioSrc,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const fadeOutStart = Math.max(FADE_FRAMES, durationInFrames - FADE_FRAMES);

  // Only fade the image — background stays white (no black flash)
  const imageOpacity = interpolate(
    frame,
    [0, FADE_FRAMES, fadeOutStart, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#fff",
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      <Img
        src={imageSrc}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          opacity: imageOpacity,
        }}
      />
      <Audio src={audioSrc} volume={1} />
    </AbsoluteFill>
  );
};
