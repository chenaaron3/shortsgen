import React from "react";
import {
  AbsoluteFill,
  Composition,
  Series,
  staticFile,
} from "remotion";
import { SceneSlide } from "./SceneSlide";
import { CaptionsOverlay } from "./CaptionsOverlay";
import type { VideoManifest } from "./types";

const FPS = 30;
const WIDTH = 540;
const HEIGHT = 960;

type ShortVideoProps = {
  manifest: VideoManifest;
};

export const ShortVideo: React.FC<ShortVideoProps> = ({ manifest }) => {
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
        <p>No manifest. Run: python generation/scripts/prepare_remotion_assets.py CACHE_KEY</p>
        <p>Then set props: {"{cacheKey: 'CACHE_KEY'}"}</p>
      </AbsoluteFill>
    );
  }

  const basePath = `shortgen/${manifest.cacheKey}`;

  return (
    <>
      <Series>
        {manifest.scenes.map((scene, i) => {
          const imageSrc = staticFile(`${basePath}/${scene.imagePath}`);
          const voiceSrc = staticFile(`${basePath}/${scene.voicePath}`);
          const durationInFrames = Math.ceil(
            scene.durationInSeconds * manifest.fps
          );

          return (
            <Series.Sequence
              key={i}
              durationInFrames={durationInFrames}
              name={`Scene ${i + 1}`}
            >
              <SceneSlide
                imageSrc={imageSrc}
                audioSrc={voiceSrc}
                durationInFrames={durationInFrames}
              />
            </Series.Sequence>
          );
        })}
      </Series>
      <CaptionsOverlay
        captions={manifest.captions}
        fps={manifest.fps}
        width={manifest.width}
        height={manifest.height}
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
  const id = cacheKeyProp ? `ShortVideo-${cacheKeyProp}` : "ShortVideo";

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
            `Failed to load manifest: ${manifestUrl}. Run: python generation/scripts/prepare_remotion_assets.py ${cacheKey}`
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
