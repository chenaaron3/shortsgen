import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Composition,
  interpolate,
  Series,
  staticFile,
} from 'remotion';

import { CaptionsOverlay } from './CaptionsOverlay';
import {
  ChromaticAberration,
  LightLeak,
  ProgressBar,
  VignetteEffect,
} from './effects';
import { defaultEffectsConfig } from './effectsConfig';
import { SceneSlide } from './SceneSlide';

import type { VideoManifest } from "./types";

const FPS = 30;
const WIDTH = 540;
const HEIGHT = 960;

type ShortVideoProps = {
  manifest: VideoManifest;
};

export const ShortVideo: React.FC<ShortVideoProps> = ({ manifest }) => {
  const effectsConfig = defaultEffectsConfig;

  if (!manifest || !manifest.scenes?.length) {
    return (
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#333",
          color: "#fff",
          fontFamily: "system-ui",
          padding: 40,
        }}
      >
        <p>No manifest. Run: python generation/scripts/run.py pipeline/prepare_remotion_assets.py CACHE_KEY</p>
        <p>Then set props: {"{cacheKey: 'CACHE_KEY'}"}</p>
      </AbsoluteFill>
    );
  }

  const basePath = `shortgen/${manifest.cacheKey}`;
  const { durationInFrames, fps } = manifest;
  const fadeFrames = Math.round(1.5 * fps); // 1.5s fade in/out
  const fadeOutStart = Math.max(fadeFrames, durationInFrames - fadeFrames);

  return (
    <>
      <Audio
        src={staticFile("background_music.mp3")}
        volume={(f) =>
          interpolate(
            f,
            [0, fadeFrames, fadeOutStart, durationInFrames],
            [0, 0.05, 0.05, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          )
        }
      />
      <Series>
        {manifest.scenes.map((scene, i) => {
          const imageSrc = staticFile(`${basePath}/${scene.imagePath}`);
          const voiceSrc = staticFile(`${basePath}/${scene.voicePath}`);
          const sceneDurationInFrames = Math.ceil(
            scene.durationInSeconds * manifest.fps
          );

          return (
            <Series.Sequence
              key={i}
              durationInFrames={sceneDurationInFrames}
              name={`Scene ${i + 1}`}
            >
              <SceneSlide
                imageSrc={imageSrc}
                audioSrc={voiceSrc}
                durationInFrames={sceneDurationInFrames}
                sceneIndex={i}
                effectsConfig={effectsConfig}
                isFirstScene={i === 0}
              />
            </Series.Sequence>
          );
        })}
      </Series>
      <LightLeak
        enabled={effectsConfig.lightLeak.enabled}
        intensity={effectsConfig.lightLeak.intensity}
        color={effectsConfig.lightLeak.color}
      />
      <ChromaticAberration
        enabled={effectsConfig.chromaticAberration.enabled}
        offset={effectsConfig.chromaticAberration.offset}
      />
      <VignetteEffect
        enabled={effectsConfig.vignette.enabled}
        intensity={effectsConfig.vignette.intensity}
      />
      <ProgressBar
        enabled={effectsConfig.progressBar.enabled}
        height={effectsConfig.progressBar.height}
        color={effectsConfig.progressBar.color}
        position={effectsConfig.progressBar.position}
        durationInFrames={durationInFrames}
      />
      <CaptionsOverlay
        captions={manifest.captions}
        fps={manifest.fps}
        width={manifest.width}
        height={manifest.height}
        durationInFrames={durationInFrames}
        pillBackground={effectsConfig.captions.pillBackground}
      />
    </>
  );
};

type ShortVideoCompositionProps = {
  cacheKey?: string;
};

export const ShortVideoComposition: React.FC<ShortVideoCompositionProps> = ({
  cacheKey: cacheKeyProp = "",
}) => {
  const id = cacheKeyProp ? `ShortVideo-${cacheKeyProp.replace(/_/g, "-")}` : "ShortVideo";

  return (
    <Composition
      id={id}
      component={ShortVideo}
      durationInFrames={1}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={
        { cacheKey: cacheKeyProp } as unknown as ShortVideoProps
      }
      calculateMetadata={async ({ props }) => {
        const { cacheKey } = props as unknown as ShortVideoCompositionProps;
        if (!cacheKey) {
          return {
            durationInFrames: 1,
            props: {
              manifest: null as unknown as VideoManifest,
            },
          };
        }

        const manifestUrl = staticFile(`shortgen/${cacheKey}/manifest.json`);
        const res = await fetch(manifestUrl);
        if (!res.ok) {
          throw new Error(
            `Failed to load manifest: ${manifestUrl}. Run: python generation/scripts/run.py pipeline/prepare_remotion_assets.py ${cacheKey}`
          );
        }
        const manifest: VideoManifest = await res.json();

        return {
          durationInFrames: manifest.durationInFrames,
          fps: manifest.fps,
          width: manifest.width,
          height: manifest.height,
          props: {
            manifest,
          },
        };
      }}
    />
  );
};
