"use client";

import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";

interface ScriptFeedbackInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function ScriptFeedbackInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
}: ScriptFeedbackInputProps) {
  return (
    <div className="flex gap-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Feedback on the script (e.g. make it shorter, change the tone…)"
        className="min-h-[80px] flex-1 resize-y"
        rows={3}
        disabled={disabled}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={onSubmit}
        disabled={disabled}
        className="shrink-0 self-end"
      >
        Submit
      </Button>
    </div>
  );
}
