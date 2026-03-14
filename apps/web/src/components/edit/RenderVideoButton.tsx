"use client";

import { Button } from "~/components/ui/button";

interface RenderVideoButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isFinalizing?: boolean;
}

export function RenderVideoButton({
  onClick,
  disabled = false,
  isFinalizing = false,
}: RenderVideoButtonProps) {
  return (
    <Button
      type="button"
      size="lg"
      onClick={onClick}
      disabled={disabled || isFinalizing}
    >
      {isFinalizing ? "Rendering…" : "Render video"}
    </Button>
  );
}
