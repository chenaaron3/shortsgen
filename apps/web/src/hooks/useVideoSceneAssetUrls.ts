"use client";

import { useMemo } from "react";

import type { RunPhase } from "~/components/edit/RunProgressSteps";
import { useRunStore } from "~/stores/useRunStore";
import { api } from "~/utils/api";

/** CDN URLs per scene index for thumbnails/audio; merges manifest, S3 listing, and WS progressive assets. */
export function useVideoSceneAssetUrls(opts: {
  runId: string;
  videoId: string;
  runPhase: RunPhase;
  videoStatus: string | null;
}) {
  const { runId, videoId, runPhase, videoStatus } = opts;
  const assetsByVideo = useRunStore((s) => s.progress.assetsByVideo);
  const assetsRefreshKeyByVideo = useRunStore(
    (s) => s.progress.assetsRefreshKeyByVideo,
  );

  const showPreview =
    videoStatus === "assets" ||
    videoStatus === "exporting" ||
    videoStatus === "exported";

  const { data: videoAssets } = api.runs.getVideoAssets.useQuery(
    { runId, videoId },
    { enabled: !!runId && !!videoId && showPreview },
  );
  const { data: listedAssets } = api.runs.listVideoAssets.useQuery(
    { runId, videoId },
    {
      enabled:
        !!runId &&
        !!videoId &&
        (runPhase === "asset_gen" || runPhase === "export") &&
        !videoAssets?.manifest,
    },
  );

  return useMemo(() => {
    const base =
      videoAssets?.assetBaseUrl ??
      listedAssets?.assetBaseUrl ??
      assetsByVideo[videoId]?.assetBaseUrl;
    if (!base) return { imageUrlByIndex: undefined, voiceUrlByIndex: undefined };

    const baseNorm = base.replace(/\/$/, "");
    const refreshKey = assetsRefreshKeyByVideo[videoId];
    const imageSuffix = refreshKey != null ? `?v=${refreshKey}` : "";
    const imageMap: Record<number, string> = {};
    const voiceMap: Record<number, string> = {};

    if (videoAssets?.manifest?.scenes) {
      videoAssets.manifest.scenes.forEach((scene, i) => {
        if (scene.imagePath)
          imageMap[i] = `${baseNorm}/${scene.imagePath}${imageSuffix}`;
        if (scene.voicePath) voiceMap[i] = `${baseNorm}/${scene.voicePath}`;
      });
    } else {
      const imgSrc =
        assetsByVideo[videoId]?.imageByIndex ?? listedAssets?.imageByIndex ?? {};
      const voiceSrc =
        assetsByVideo[videoId]?.voiceByIndex ?? listedAssets?.voiceByIndex ?? {};
      Object.entries(imgSrc).forEach(([k, path]) => {
        imageMap[Number(k)] = `${baseNorm}/${path}${imageSuffix}`;
      });
      Object.entries(voiceSrc).forEach(([k, path]) => {
        voiceMap[Number(k)] = `${baseNorm}/${path}`;
      });
    }

    return {
      imageUrlByIndex: Object.keys(imageMap).length > 0 ? imageMap : undefined,
      voiceUrlByIndex: Object.keys(voiceMap).length > 0 ? voiceMap : undefined,
    };
  }, [
    videoAssets,
    listedAssets,
    assetsByVideo,
    assetsRefreshKeyByVideo,
    videoId,
  ]);
}
