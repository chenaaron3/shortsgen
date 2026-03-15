"use client";

import { useState, useEffect } from "react";
import { sceneSchema } from "@shortgen/types";
import type { z } from "zod";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";

interface Scene {
  text: string;
  imagery: string;
  section: string;
}

interface SceneRowProps {
  scene: Scene;
  sceneIndex: number;
  feedback: string | undefined;
  onFeedbackChange: (sceneIndex: number, liked: boolean | null, feedback: string) => void;
  /** Suggested revision (from feedback streaming). Rendered as overlay, not overwriting. */
  suggestion?: z.infer<typeof sceneSchema> | undefined;
  /** Per-field accept/decline for this scene. When declined, suggestion is hidden. */
  suggestionDecisions?: { text?: "accept" | "decline"; imagery?: "accept" | "decline" };
  /** Called when user accepts or declines a suggestion for text or imagery. */
  onSuggestionDecision?: (
    sceneIndex: number,
    field: "text" | "imagery",
    decision: "accept" | "decline",
  ) => void;
  /** When true, script (text) is read-only. Used in assets phase. Unused for now. */
  scriptLocked?: boolean;
  /** When true, imagery is editable via textarea. Used in assets phase. */
  imageryEditable?: boolean;
  /** Called when user requests regenerate (assets phase). Sends imagery and/or feedback. */
  onRegenerate?: (sceneIndex: number, imagery?: string, feedback?: string) => void;
  isRegenerating?: boolean;
}

export function SceneRow({
  scene,
  sceneIndex,
  feedback,
  suggestion,
  suggestionDecisions,
  onSuggestionDecision,
  onFeedbackChange,
  scriptLocked = false,
  imageryEditable = false,
  onRegenerate,
  isRegenerating = false,
}: SceneRowProps) {
  const [reason, setReason] = useState(feedback ?? "");
  const [imageryText, setImageryText] = useState(scene.imagery);
  const liked: boolean | null =
    feedback === "Looks good"
      ? true
      : feedback !== undefined && feedback !== ""
        ? false
        : null;

  useEffect(() => {
    setReason(feedback && feedback !== "Looks good" ? feedback : "");
  }, [feedback]);

  useEffect(() => {
    setImageryText(scene.imagery);
  }, [scene.imagery]);

  const handleLike = () => {
    const newLiked = liked === true ? null : true;
    onFeedbackChange(sceneIndex, newLiked, newLiked ? "Looks good" : "");
    if (newLiked) setReason("");
  };

  const handleDislike = () => {
    const newLiked = liked === false ? null : false;
    if (newLiked === false) {
      onFeedbackChange(sceneIndex, false, reason);
    } else {
      onFeedbackChange(sceneIndex, null, "");
      setReason("");
    }
  };

  const handleReasonChange = (value: string) => {
    setReason(value);
    if (liked === false) {
      onFeedbackChange(sceneIndex, false, value);
    }
  };

  const canRegenerate =
    imageryEditable &&
    onRegenerate &&
    (imageryText.trim() !== scene.imagery.trim() ||
      (feedback !== undefined && feedback !== ""));

  const handleRegenerate = () => {
    if (!onRegenerate || !canRegenerate) return;
    if (imageryText.trim() !== scene.imagery.trim()) {
      onRegenerate(sceneIndex, imageryText.trim());
    } else if (feedback !== undefined) {
      onRegenerate(sceneIndex, undefined, feedback);
    }
  };

  return (
    <Card size="sm">
      <CardContent className="space-y-2 pt-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <span className="text-xs font-medium text-muted-foreground">{scene.section}</span>
            <p className="text-foreground">{scene.text}</p>
            {suggestion &&
              suggestion.text !== scene.text &&
              suggestionDecisions?.text !== "decline" && (
                <div className="mt-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-2 py-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Suggested</span>
                  <p className="text-sm text-muted-foreground">{suggestion.text}</p>
                  {onSuggestionDecision && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSuggestionDecision(sceneIndex, "text", "accept")}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onSuggestionDecision(sceneIndex, "text", "decline")}
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              )}
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground">Image description</span>
            {imageryEditable ? (
              <Textarea
                value={imageryText}
                onChange={(e) => setImageryText(e.target.value)}
                placeholder="Describe the image…"
                className="mt-1 min-h-[80px] resize-y"
              />
            ) : (
              <p className="text-muted-foreground">{scene.imagery}</p>
            )}
            {suggestion &&
              suggestion.imagery !== scene.imagery &&
              suggestionDecisions?.imagery !== "decline" && (
                <div className="mt-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-2 py-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Suggested</span>
                  <p className="text-sm text-muted-foreground">{suggestion.imagery}</p>
                  {onSuggestionDecision && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSuggestionDecision(sceneIndex, "imagery", "accept")}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onSuggestionDecision(sceneIndex, "imagery", "decline")}
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={liked === true ? "default" : "secondary"}
            size="sm"
            onClick={handleLike}
            className={liked === true ? "bg-green-600 hover:bg-green-700" : ""}
          >
            Like
          </Button>
          <Button
            type="button"
            variant={liked === false ? "destructive" : "secondary"}
            size="sm"
            onClick={handleDislike}
          >
            Dislike
          </Button>
          {liked === false && (
            <Input
              type="text"
              value={reason}
              onChange={(e) => handleReasonChange(e.target.value)}
              placeholder="Reason for dislike…"
              className="min-w-[200px]"
            />
          )}
          {imageryEditable && onRegenerate && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={!canRegenerate || isRegenerating}
            >
              {isRegenerating ? "Regenerating…" : "Regenerate image"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
