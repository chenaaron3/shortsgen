import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

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

  // Only fade the image — background stays visible (no black flash)
  const imageOpacity = interpolate(
    frame,
    [0, FADE_FRAMES, fadeOutStart, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        backgroundColor: "#FAF5ED",
      }}
    >
      {/* <Img
        src={staticFile("background.jpg")}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: .75,
          zIndex: 0,
        }}
      /> */}
      <Img
        src={imageSrc}
        style={{
          position: "absolute",
          top: "13%", // 126/960
          left: "12.5%",
          width: "75%",
          height: "auto",
          objectFit: "contain",
          opacity: imageOpacity,
          zIndex: 1,
        }}
      />
      <Audio src={audioSrc} volume={1} />
    </AbsoluteFill>
  );
};
