"use client";

import { useState } from "react";
import { Dialog, DialogContent } from '~/components/ui/dialog';
import { Skeleton } from '~/components/ui/skeleton';
import { useVideoSceneAssetUrls } from '~/hooks/useVideoSceneAssetUrls';
import { expectsSceneAssetsForVideo } from '~/lib/sceneAssetLoading';
import { useRunStore } from '~/stores/useRunStore';

interface SceneImagePreviewProps {
  sceneIndex: number;
}

export function SceneImagePreview({
  sceneIndex,
}: SceneImagePreviewProps) {
  const runId = useRunStore((s) => s.ui.runId) ?? "";
  const videoId = useRunStore((s) => s.ui.activeVideoId) ?? "";
  const runPhase = useRunStore((s) => s.ui.activeRunPhase) ?? "breakdown";
  const videoStatus = useRunStore((s) => s.ui.activeVideoStatus);
  const sceneUpdating = useRunStore((s) => s.ui.sceneUpdating);
  const videoProgress = useRunStore((s) =>
    videoId ? s.progress.videoProgressByVideo[videoId] : undefined,
  );
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const { imageUrlByIndex } = useVideoSceneAssetUrls({
    runId,
    videoId,
  });
  const imageUrl = imageUrlByIndex?.[sceneIndex];
  const isRegenerating = sceneUpdating === sceneIndex;
  const expectsAssetMedia = expectsSceneAssetsForVideo(runPhase, videoStatus);
  const expectImage =
    isRegenerating || (!imageUrl && videoProgress != null && expectsAssetMedia);

  return (
    <>
      {expectImage && (
        <Skeleton
          className="h-20 min-h-[48px] w-14 shrink-0 rounded-md border border-border"
          aria-hidden
        />
      )}
      {imageUrl && !isRegenerating && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setImageDialogOpen(true);
          }}
          className="relative z-10 shrink-0 cursor-pointer overflow-hidden rounded border border-border bg-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="View scene image"
        >
          <img
            src={imageUrl}
            alt="Scene"
            className="block max-h-20 min-h-[48px] w-auto object-contain"
          />
        </button>
      )}
      {imageUrl && !isRegenerating && (
        <Dialog
          open={imageDialogOpen}
          onOpenChange={setImageDialogOpen}
        >
          <DialogContent
            className="w-fit max-w-[90vw] border-none bg-white p-2 shadow-none"
            onPointerDownOutside={() => setImageDialogOpen(false)}
          >
            <img
              src={imageUrl}
              alt="Scene (full size)"
              className="block max-h-[85vh] max-w-[90vw] object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
