import type { Dimension, Judgment } from "../types";
import type { AnnotationSource } from "../api/annotations";
import { Check, Sparkles, Star } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

import { DIMENSION_LABELS, DIMENSION_QUESTIONS, DIMENSIONS } from '../types';

type JudgmentFormProps = {
  judgments: Record<Dimension, Judgment | undefined>;
  notes: string;
  source?: AnnotationSource;
  onChange: (judgments: Record<Dimension, Judgment | undefined>, notes: string) => void;
  /** Whether this annotation is in the golden set (starred) */
  isStarred?: boolean;
  /** Toggle star (add/remove from golden set). Disabled when canStar is false. */
  onStarToggle?: () => void;
  /** False when annotation is incomplete (missing any dimension judgment) */
  canStar?: boolean;
};

export function JudgmentForm({
  judgments,
  notes,
  source,
  onChange,
  isStarred = false,
  onStarToggle,
  canStar = false,
}: JudgmentFormProps) {
  function setJudgment(dim: Dimension, pass: boolean, critique: string) {
    const next = { ...judgments };
    next[dim] = { dimension: dim, pass, critique };
    onChange(next, notes);
  }

  function setNotes(value: string) {
    onChange(judgments, value);
  }

  return (
    <Card className={source === "llm" ? "ring-1 ring-amber-200 dark:ring-amber-900/50" : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Evaluations</CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            {onStarToggle && (
              <Button
                variant={isStarred ? "default" : "ghost"}
                size="icon"
                className={`h-8 w-8 ${isStarred ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground"}`}
                onClick={onStarToggle}
                disabled={!canStar}
                aria-label={isStarred ? "Remove from golden set" : "Add to golden set"}
                title={isStarred ? "Remove from golden set" : canStar ? "Add to golden set" : "Complete all dimension judgments to add to golden set"}
              >
                <Star className={`size-4 ${isStarred ? "fill-current" : ""}`} />
              </Button>
            )}
            {source === "human" ? (
              <Badge variant="secondary" className="shrink-0">
                <Check className="mr-1 size-3" />
                Reviewed
              </Badge>
            ) : source === "llm" ? (
              <Badge variant="outline" className="shrink-0 text-muted-foreground">
                <Sparkles className="mr-1 size-3" />
                AI first pass
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-row flex-wrap gap-4">
          {DIMENSIONS.map((dim) => (
            <div key={dim} className="space-y-2 min-w-[200px] flex-1 basis-0">
              <div>
                <span className="text-sm font-medium">{DIMENSION_LABELS[dim]}</span>
                <p className="text-xs text-muted-foreground">
                  {DIMENSION_QUESTIONS[dim]}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={judgments[dim]?.pass === true ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setJudgment(dim, true, judgments[dim]?.critique ?? "")
                  }
                >
                  PASS
                </Button>
                <Button
                  type="button"
                  variant={judgments[dim]?.pass === false ? "destructive" : "outline"}
                  size="sm"
                  onClick={() =>
                    setJudgment(dim, false, judgments[dim]?.critique ?? "")
                  }
                >
                  FAIL
                </Button>
              </div>
              <Textarea
                placeholder="Critique (required for FAIL, helpful for PASS)"
                value={judgments[dim]?.critique ?? ""}
                onChange={(e) =>
                  setJudgment(dim, judgments[dim]?.pass ?? true, e.target.value)
                }
                rows={2}
                className="resize-none"
              />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <label htmlFor="notes" className="text-sm font-medium">
            Open-ended notes
          </label>
          <Textarea
            id="notes"
            placeholder="Any other observations..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>
      </CardContent>
    </Card>
  );
}
