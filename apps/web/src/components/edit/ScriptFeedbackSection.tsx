"use client";

import { useRunStore } from "~/stores/useRunStore";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";

interface ScriptFeedbackSectionProps {
  onApplyFeedback: () => void;
  disabled?: boolean;
  error?: string | null;
}

export function ScriptFeedbackSection({
  onApplyFeedback,
  disabled = false,
  error,
}: ScriptFeedbackSectionProps) {
  const scriptFeedback = useRunStore((s) => s.feedback.scriptFeedback);
  const setScriptFeedback = useRunStore((s) => s.setScriptFeedback);

  return (
    <div className="mt-auto border-t border-border pt-6">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
        Script feedback
      </h3>
      <div className="flex gap-2">
        <Textarea
          value={scriptFeedback}
          onChange={(e) => setScriptFeedback(e.target.value)}
          placeholder="Feedback on the script (e.g. make it shorter, change the tone…)"
          className="min-h-[80px] flex-1 resize-y"
          rows={3}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={onApplyFeedback}
          disabled={disabled}
          className="shrink-0 self-end"
        >
          Submit
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
