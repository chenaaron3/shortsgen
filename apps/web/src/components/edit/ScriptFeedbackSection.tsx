"use client";

import { Send } from "lucide-react";
import { useRunStore } from "~/stores/useRunStore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

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
  const scriptFeedback = useRunStore((s) => s.ui.scriptFeedback);
  const setScriptFeedback = useRunStore((s) => s.setScriptFeedback);

  return (
    <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2 rounded-full border border-input bg-background px-4 py-2">
          <Input
            value={scriptFeedback}
            onChange={(e) => setScriptFeedback(e.target.value)}
            placeholder="Add feedback on the script…"
            className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onApplyFeedback();
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onApplyFeedback}
            disabled={disabled}
            className="shrink-0 rounded-full bg-transparent hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent"
            aria-label="Submit feedback"
          >
            <Send className="size-4" />
          </Button>
        </div>
      {error && (
        <p className="mt-2 text-center text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
