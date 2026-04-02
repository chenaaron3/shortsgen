"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Sets textarea height to scrollHeight (capped); use with resize-none. */
export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeightPx = 320,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const h = Math.min(el.scrollHeight, maxHeightPx);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > maxHeightPx ? "auto" : "hidden";
  }, [value, maxHeightPx]);
}
