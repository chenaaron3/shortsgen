import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';

import { GlitchEffect, SceneFlash } from './effects';

import type { EffectsConfig } from './effectsConfig';

const FADE_FRAMES = 8; // ~0.27s subtle image fade at 30fps

const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const PAN_DIRECTIONS = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
];

type SceneSlideProps = {
  imageSrc: string;
  audioSrc: string;
  durationInFrames: number;
  sceneIndex: number;
  effectsConfig: EffectsConfig;
  isFirstScene?: boolean;
  imageWidth?: number;
  imageHeight?: number;
};

export const SceneSlide: React.FC<SceneSlideProps> = ({
  imageSrc,
  audioSrc,
  durationInFrames,
  sceneIndex,
  effectsConfig,
  isFirstScene = false,
  imageWidth,
  imageHeight,
}) => {
  const frame = useCurrentFrame();
  const fadeOutStart = Math.max(FADE_FRAMES, durationInFrames - FADE_FRAMES);

  const { kenBurns, transitions, glitch } = effectsConfig;

  // Only fade the image — background stays visible (no black flash)
  const imageOpacity = interpolate(
    frame,
    [0, FADE_FRAMES, fadeOutStart, durationInFrames],
    [0, 1, 1, 0],
    clampOpts
  );

  // Glitch intensity: peak at frame 5–12, fade out by glitch.durationFrames
  const glitchIntensity =
    glitch.enabled && isFirstScene
      ? interpolate(
        frame,
        [0, 5, 12, glitch.durationFrames],
        [0, 1, 1, 0],
        clampOpts
      )
      : 0;

  // Ken Burns: zoom (only if enabled)
  const kenBurnsScale = kenBurns.enabled
    ? interpolate(
      frame,
      [0, durationInFrames],
      [1, 1 + kenBurns.zoomAmount],
      clampOpts
    )
    : 1;

  // Ken Burns: pan direction (only if both kenBurns and panEnabled)
  const dir = PAN_DIRECTIONS[sceneIndex % PAN_DIRECTIONS.length] ?? PAN_DIRECTIONS[0]!;
  const panX =
    kenBurns.enabled && kenBurns.panEnabled
      ? interpolate(
        frame,
        [0, durationInFrames],
        [0, dir.x * kenBurns.panAmount],
        clampOpts
      )
      : 0;
  const panY =
    kenBurns.enabled && kenBurns.panEnabled
      ? interpolate(
        frame,
        [0, durationInFrames],
        [0, dir.y * kenBurns.panAmount],
        clampOpts
      )
      : 0;

  // Zoom punch: quick scale-down animation on scene entry
  const punchScale = transitions.zoomPunch.enabled
    ? interpolate(
      frame,
      [0, transitions.zoomPunch.durationFrames],
      [transitions.zoomPunch.scale, 1],
      clampOpts
    )
    : 1;

  // Shake effect: position jitter synced with zoom punch timing
  const { shake } = transitions;
  const shakeFalloff = shake.enabled
    ? interpolate(frame, [0, shake.durationFrames], [1, 0], clampOpts)
    : 0;
  const shakeX = shake.enabled
    ? Math.sin(frame * 1.5) * shake.intensity * shakeFalloff
    : 0;
  const shakeY = shake.enabled
    ? Math.cos(frame * 2) * shake.intensity * shakeFalloff
    : 0;

  // Combined scale = Ken Burns * zoom punch
  const finalScale = kenBurnsScale * punchScale;

  // Tall images (portrait) span the entire screen; square/landscape use contained layout
  const isTall = imageWidth != null && imageHeight != null && imageHeight > imageWidth;

  const imageWrapperStyle: React.CSSProperties = isTall
    ? {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
        transform: `scale(${finalScale}) translate(calc(${panX}% + ${shakeX}px), calc(${panY}% + ${shakeY}px))`,
        transformOrigin: "center center",
      }
    : {
        position: "absolute",
        top: "20%",
        left: "10%",
        width: "80%",
        height: "auto",
        zIndex: 1,
        transform: `scale(${finalScale}) translate(calc(${panX}% + ${shakeX}px), calc(${panY}% + ${shakeY}px))`,
        transformOrigin: "center center",
      };

  const baseImageStyle: React.CSSProperties = isTall
    ? {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        opacity: imageOpacity,
        display: "block",
      }
    : {
        width: "100%",
        height: "auto",
        objectFit: "contain",
        opacity: imageOpacity,
        display: "block",
      };

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        backgroundColor: "#FAF5ED",
      }}
    >
      <SceneFlash
        enabled={transitions.flash.enabled}
        intensity={transitions.flash.intensity}
        color={transitions.flash.color}
        isFirstScene={isFirstScene}
        skipFirstScene={transitions.flash.skipFirstScene}
      />
      {/* Image wrapper: base image + glitch overlay */}
      <div style={imageWrapperStyle}>
        <div style={isTall ? { position: "relative" as const, width: "100%", height: "100%" } : { position: "relative" as const }}>
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
