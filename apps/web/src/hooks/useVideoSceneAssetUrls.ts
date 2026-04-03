"use client";

import { useMemo } from 'react';
import { useRunStore } from '~/stores/useRunStore';
import { api } from '~/utils/api';

/** CDN URLs per scene index for thumbnails/audio; merges manifest, S3 listing, and WS progressive assets. */
export function useVideoSceneAssetUrls(opts: {
  runId: string;
  videoId: string;
  videoStatus: string | null;
}) {
  const { runId, videoId, videoStatus } = opts;
  const activeAssetBaseUrl = useRunStore((s) => s.ui.activeAssetBaseUrl);
  const activeSceneUiByIndex = useRunStore((s) => s.ui.activeSceneUiByIndex);
  const activeAssetsRefreshKey = useRunStore(
    (s) => s.ui.activeAssetsRefreshKey,
  );

  const showPreview =
    videoStatus === "scripts" ||
    videoStatus === "assets" ||
    videoStatus === "exporting" ||
    videoStatus === "exported";

  const { data: videoAssets } = api.runs.getVideoAssets.useQuery(
    { runId, videoId },
    { enabled: !!runId && !!videoId && showPreview },
  );

  return useMemo(() => {
    const base = videoAssets?.assetBaseUrl ?? activeAssetBaseUrl;
    if (!base)
      return { imageUrlByIndex: undefined, voiceUrlByIndex: undefined };

    const baseNorm = base.replace(/\/$/, "");
    const refreshKey = activeAssetsRefreshKey;
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
      const activeImageByIndex = Object.entries(activeSceneUiByIndex).reduce<
        Record<number, string>
      >((acc, [sceneIndex, sceneUi]) => {
        if (sceneUi?.assets.imagePath) {
          acc[Number(sceneIndex)] = sceneUi.assets.imagePath;
        }
        return acc;
      }, {});
      const activeVoiceByIndex = Object.entries(activeSceneUiByIndex).reduce<
        Record<number, string>
      >((acc, [sceneIndex, sceneUi]) => {
        if (sceneUi?.assets.voicePath) {
          acc[Number(sceneIndex)] = sceneUi.assets.voicePath;
        }
        return acc;
      }, {});
      const imgSrc =
        Object.keys(activeImageByIndex).length > 0
          ? activeImageByIndex
          : (videoAssets?.imageByIndex ?? {});
      const voiceSrc =
        Object.keys(activeVoiceByIndex).length > 0
          ? activeVoiceByIndex
          : (videoAssets?.voiceByIndex ?? {});
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
    activeAssetBaseUrl,
    activeSceneUiByIndex,
    activeAssetsRefreshKey,
  ]);
}
