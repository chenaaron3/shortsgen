import type { Dimension, Judgment } from "../types";
import type { AnnotationSource } from "../api/annotations";
import {
  DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_QUESTIONS,
} from "../types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";

type JudgmentFormProps = {
  judgments: Record<Dimension, Judgment | undefined>;
  notes: string;
  source?: AnnotationSource;
  onChange: (judgments: Record<Dimension, Judgment | undefined>, notes: string) => void;
  onSave: (judgments: Record<Dimension, Judgment | undefined>, notes: string) => void;
  saving: boolean;
};

export function JudgmentForm({
  judgments,
  notes,
  source,
  onChange,
  onSave,
  saving,
}: JudgmentFormProps) {
  function setJudgment(dim: Dimension, pass: boolean, critique: string) {
    const next = { ...judgments };
    next[dim] = { dimension: dim, pass, critique };
    onChange(next, notes);
  }

  function setNotes(value: string) {
    onChange(judgments, value);
  }

  const allSet = DIMENSIONS.every((d) => judgments[d] !== undefined);

  return (
    <Card className={source === "llm" ? "ring-1 ring-amber-200 dark:ring-amber-900/50" : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Evaluations</CardTitle>
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
      </CardHeader>
      <CardContent className="space-y-4">
        {DIMENSIONS.map((dim) => (
          <div key={dim} className="space-y-2">
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
        <Button
          onClick={() => onSave(judgments, notes)}
          disabled={!allSet || saving}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
