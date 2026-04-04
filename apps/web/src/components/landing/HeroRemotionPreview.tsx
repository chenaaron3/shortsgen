"use client";

import dynamic from "next/dynamic";

import {
  LANDING_PREVIEW_ASSET_BASE_URL,
} from "./landingPreviewData";
import landingPreviewManifestJson from "~/../public/landing-preview/run-bb1af5f4-7ee0fd33/manifest.json";

import { manifestSchema } from "@shortgen/types";
import type React from "react";

const Player = dynamic(
  () => import("@remotion/player").then((mod) => mod.Player),
  { ssr: false },
);
const ShortVideo = dynamic(
  () => import("@shortgen/remotion/ShortVideo").then((mod) => mod.ShortVideo),
  { ssr: false },
);

export function HeroRemotionPreview() {
  const manifest = manifestSchema.parse(landingPreviewManifestJson);

  return (
    <div className="mx-auto w-full max-w-[360px]">
      <div className="overflow-hidden rounded-[2rem] border border-border/70 bg-black/80 shadow-2xl shadow-black/40">
        <div className="aspect-9/16 w-full">
          <Player
            {...({
              acknowledgeRemotionLicense: true,
              component: ShortVideo as React.ComponentType<Record<string, unknown>>,
              inputProps: {
                manifest,
                assetBaseUrl: LANDING_PREVIEW_ASSET_BASE_URL,
                backgroundMusicUrl: "/background_music.mp3",
              },
              durationInFrames: manifest.durationInFrames,
              compositionWidth: manifest.width,
              compositionHeight: manifest.height,
              fps: manifest.fps,
              controls: true,
              autoPlay: true,
              loop: true,
              clickToPlay: false,
              style: { width: "100%", height: "100%" },
            } as React.ComponentProps<typeof Player>)}
          />
        </div>
      </div>
    </div>
  );
}
