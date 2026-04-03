"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { AutosizeTextarea } from '~/components/ui/autosize-textarea';
import { Button } from '~/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { emptySceneFeedback } from '~/lib/sceneFeedback';
import { useRunStore } from '~/stores/useRunStore';

interface SceneFeedbackControlsProps {
  sceneIndex: number;
}

export function SceneFeedbackControls({
  sceneIndex,
}: SceneFeedbackControlsProps) {
  const sceneUi = useRunStore((s) => s.ui.activeSceneUiByIndex[sceneIndex]);
  const setSceneFeedback = useRunStore((s) => s.setSceneFeedback);
  const sentiment = sceneUi?.feedback.sentiment ?? null;
  const note = sceneUi?.feedback.note ?? "";
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleLikeClick = (e: React.MouseEvent) => {
    if (sentiment === "like") {
      e.stopPropagation();
      setSceneFeedback(sceneIndex, emptySceneFeedback());
      setPopoverOpen(false);
      return;
    }
    setSceneFeedback(sceneIndex, { sentiment: "like", note: note || "" });
    setPopoverOpen(true);
  };

  const handleDislikeClick = (e: React.MouseEvent) => {
    if (sentiment === "dislike") {
      e.stopPropagation();
      setSceneFeedback(sceneIndex, emptySceneFeedback());
      setPopoverOpen(false);
      return;
    }
    setSceneFeedback(sceneIndex, { sentiment: "dislike", note: note || "" });
    setPopoverOpen(true);
  };

  const handlePopoverOpenChange = (open: boolean) => {
    setPopoverOpen(open);
  };

  const handleDraftNoteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setPopoverOpen(false);
    }
  };

  return (
    <Popover open={popoverOpen} onOpenChange={handlePopoverOpenChange}>
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
          {sentiment === "dislike" ? "What could improve?" : "What did you like?"}
        </p>
        <AutosizeTextarea
          maxHeightPx={192}
          value={note}
          onChange={(e) =>
            setSceneFeedback(sceneIndex, {
              sentiment: sentiment ?? "like",
              note: e.target.value,
            })
          }
          onKeyDown={handleDraftNoteKeyDown}
          placeholder="Optional note…"
          className="max-h-48 text-sm"
        />
      </PopoverContent>
    </Popover>
  );
}
