"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Textarea } from '~/components/ui/textarea';
import {
  EMPTY_SCENE_FEEDBACK, emptySceneFeedback, sceneFeedbackToApiString
} from '~/lib/sceneFeedback';
import { mergeSceneSuggestionsForOneScene } from '~/lib/suggestionMerge';
import { useRunStore } from '~/stores/useRunStore';
import { api } from '~/utils/api';

import { WordDiff } from './WordDiff';

import type { ChunksOutput } from "@shortgen/types";
interface Scene {
  text: string;
  imagery: string;
  section: string;
}

interface SceneRowProps {
  scene: Scene;
  runId: string;
  videoId: string;
  sceneIndex: number;
  /** DB chunks for this video (for merging one suggested field). */
  currentChunks: ChunksOutput;
  /** When true, per-field Accept is disabled (e.g. parent “accept all” in flight). */
  blockAcceptSuggestionField?: boolean;
  scriptLocked?: boolean;
  imageryEditable?: boolean;
  onRegenerate?: (
    sceneIndex: number,
    imagery?: string,
    feedback?: string,
  ) => void;
  isRegenerating?: boolean;
  /** When assets exist: URL for scene image thumbnail */
  imageUrl?: string;
  /** When assets exist: URL for scene voice (audio play button) */
  voiceUrl?: string;
}

export function SceneRow({
  scene,
  runId,
  videoId,
  sceneIndex,
  currentChunks,
  blockAcceptSuggestionField = false,
  scriptLocked: _scriptLocked = false,
  imageryEditable = false,
  onRegenerate,
  isRegenerating = false,
  imageUrl,
  voiceUrl,
}: SceneRowProps) {
  const utils = api.useUtils();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [voiceUrl]);
  const acceptFieldMutation = api.runs.acceptSceneSuggestions.useMutation({
    onSuccess: () => {
      void utils.runs.getById.invalidate({ runId });
    },
  });

  const acceptSceneSuggestion = useCallback(() => {
    const sceneSuggestions =
      useRunStore.getState().progress.sceneSuggestionsByVideo[videoId];
    if (!sceneSuggestions) return;
    const chunks = mergeSceneSuggestionsForOneScene(
      currentChunks,
      sceneSuggestions,
      sceneIndex,
    );
    acceptFieldMutation.mutate({ runId, videoId, chunks });
  }, [acceptFieldMutation, currentChunks, sceneIndex, videoId, runId]);

  const acceptSuggestionPending =
    acceptFieldMutation.isPending || blockAcceptSuggestionField;
  const feedback = useRunStore((s) => {
    const v = s.feedback.feedbackByVideo[videoId]?.sceneFeedback?.[sceneIndex];
    return v ?? EMPTY_SCENE_FEEDBACK;
  });
  const setSceneFeedback = useRunStore((s) => s.setSceneFeedback);
  const suggestion = useRunStore(
    (s) => s.progress.sceneSuggestionsByVideo[videoId]?.scenes?.[sceneIndex],
  );

  const { sentiment, note } = feedback;
  const [imageryText, setImageryText] = useState(scene.imagery);
  const [declinedSuggestion, setDeclinedSuggestion] = useState(false);
  const [feedbackPopoverOpen, setFeedbackPopoverOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [pendingSentiment, setPendingSentiment] = useState<"like" | "dislike">(
    "like",
  );
  const [draftNote, setDraftNote] = useState("");

  useEffect(() => {
    setImageryText(scene.imagery);
  }, [scene.imagery]);

  useEffect(() => {
    if (!suggestion) setDeclinedSuggestion(false);
  }, [suggestion]);

  const handleLikeClick = (e: React.MouseEvent) => {
    if (sentiment === "like") {
      e.stopPropagation();
      setSceneFeedback(videoId, sceneIndex, emptySceneFeedback());
      setFeedbackPopoverOpen(false);
      return;
    }
    setSceneFeedback(videoId, sceneIndex, { sentiment: "like", note });
    setPendingSentiment("like");
    setDraftNote(note);
    setFeedbackPopoverOpen(true);
  };

  const handleDislikeClick = (e: React.MouseEvent) => {
    if (sentiment === "dislike") {
      e.stopPropagation();
      setSceneFeedback(videoId, sceneIndex, emptySceneFeedback());
      setFeedbackPopoverOpen(false);
      return;
    }
    setSceneFeedback(videoId, sceneIndex, { sentiment: "dislike", note });
    setPendingSentiment("dislike");
    setDraftNote(note);
    setFeedbackPopoverOpen(true);
  };

  const persistNoteAndClose = () => {
    setSceneFeedback(videoId, sceneIndex, {
      sentiment: pendingSentiment,
      note: draftNote,
    });
    setFeedbackPopoverOpen(false);
  };

  const handlePopoverOpenChange = (open: boolean) => {
    setFeedbackPopoverOpen(open);
    if (!open) persistNoteAndClose();
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      persistNoteAndClose();
    }
  };

  const hasSceneFeedback = sceneFeedbackToApiString(feedback).length > 0;

  const canRegenerate =
    imageryEditable &&
    onRegenerate &&
    (imageryText.trim() !== scene.imagery.trim() || hasSceneFeedback);

  const handleRegenerate = () => {
    if (!onRegenerate || !canRegenerate) return;
    if (imageryText.trim() !== scene.imagery.trim()) {
      onRegenerate(sceneIndex, imageryText.trim());
    } else if (hasSceneFeedback) {
      onRegenerate(sceneIndex, undefined, sceneFeedbackToApiString(feedback));
    }
  };

  const showSuggestion = suggestion && !declinedSuggestion;
  const hasDiffs =
    suggestion &&
    (suggestion.text !== scene.text || suggestion.imagery !== scene.imagery);

  return (
    <Card size="sm" className="py-2 ring-0">
      <CardContent className="pt-2">
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            {showSuggestion ? (
              <div className="space-y-2">
                <WordDiff
                  before={scene.text}
                  after={suggestion!.text}
                  variant="script"
                />
                <WordDiff
                  before={scene.imagery}
                  after={suggestion!.imagery}
                  variant="imagery"
                />
                {hasDiffs && (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      disabled={acceptSuggestionPending}
                      onClick={acceptSceneSuggestion}
                    >
                      Accept
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      disabled={acceptSuggestionPending}
                      onClick={() => setDeclinedSuggestion(true)}
                    >
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {voiceUrl && (
                    <>
                      <audio ref={audioRef} src={voiceUrl} preload="metadata" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={handlePlayPause}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label={isPlaying ? 'Pause' : 'Play scene audio'}
                      >
                        {isPlaying ? (
                          <Pause className="size-3.5" />
                        ) : (
                          <Play className="size-3.5" />
                        )}
                      </Button>
                    </>
                  )}
                  <p className="min-w-0 flex-1 text-foreground text-sm leading-snug">
                    {scene.text}
                  </p>
                </div>
                <div>
                  {imageryEditable ? (
                    <Textarea
                      value={imageryText}
                      onChange={(e) => setImageryText(e.target.value)}
                      placeholder="Image description…"
                      className="min-h-[48px] resize-y text-xs"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">{scene.imagery}</p>
                  )}
                </div>
                {imageryEditable && onRegenerate && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={handleRegenerate}
                      disabled={!canRegenerate || isRegenerating}
                    >
                      {isRegenerating ? "…" : "Regenerate"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {imageUrl && (
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
            <div className="mt-auto shrink-0">
              <Popover open={feedbackPopoverOpen} onOpenChange={handlePopoverOpenChange}>
                <div className="flex flex-col items-end gap-0.5">
                  <PopoverTrigger asChild>
                    <div className="flex gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleLikeClick}
                        className={
                          sentiment === "like"
                            ? "text-green-600 hover:bg-green-500/10 hover:text-green-600"
                            : "text-muted-foreground hover:text-foreground"
                        }
                        aria-label="Like scene"
                      >
                        <ThumbsUp className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleDislikeClick}
                        className={
                          sentiment === "dislike"
                            ? "text-amber-600 hover:bg-amber-500/10 hover:text-amber-600"
                            : "text-muted-foreground hover:text-foreground"
                        }
                        aria-label="Dislike scene"
                      >
                        <ThumbsDown className="size-3" />
                      </Button>
                    </div>
                  </PopoverTrigger>
                  {(sentiment === "like" || sentiment === "dislike") && note.trim() && (
                    <p className="max-w-[120px] truncate text-right text-[10px] text-muted-foreground">
                      {note.trim()}
                    </p>
                  )}
                </div>
                <PopoverContent side="bottom" align="end" className="w-72">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {pendingSentiment === "like"
                      ? "What did you like?"
                      : "What could improve?"}
                  </p>
                  <Textarea
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    onKeyDown={handleNoteKeyDown}
                    placeholder="Optional note…"
                    className="min-h-[60px] resize-y text-sm"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </CardContent>
      {imageUrl && (
        <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
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
    </Card>
  );
}
