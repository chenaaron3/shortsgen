"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

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
}

export function SceneRow({
  scene,
  sceneIndex,
  feedback,
  onFeedbackChange,
}: SceneRowProps) {
  const [reason, setReason] = useState(feedback ?? "");
  const liked: boolean | null =
    feedback === "Looks good"
      ? true
      : feedback !== undefined && feedback !== ""
        ? false
        : null;

  useEffect(() => {
    setReason(feedback && feedback !== "Looks good" ? feedback : "");
  }, [feedback]);

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

  return (
    <Card size="sm">
      <CardContent className="space-y-2 pt-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <span className="text-xs font-medium text-muted-foreground">{scene.section}</span>
            <p className="text-foreground">{scene.text}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground">Image description</span>
            <p className="text-muted-foreground">{scene.imagery}</p>
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
        </div>
      </CardContent>
    </Card>
  );
}
