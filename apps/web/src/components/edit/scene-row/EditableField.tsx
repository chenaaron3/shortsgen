"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { AutosizeTextarea } from "~/components/ui/autosize-textarea";
import { cn } from "~/lib/utils";

export type EditableFieldMode = "editing" | "clickable" | "readonly";

function MaybeShimmer({
  active,
  children,
  tintClassName,
}: {
  active: boolean;
  children: ReactNode;
  /** Base text color for [tw-shimmer](https://www.assistant-ui.com/tw-shimmer) (use opacity, e.g. `text-foreground/50`). */
  tintClassName: string;
}) {
  if (!active) return children;
  return (
    <span
      className={cn(
        "shimmer inline box-decoration-clone [-webkit-box-decoration-break:clone]",
        tintClassName,
      )}
    >
      {children}
    </span>
  );
}

/** Enter commits, Escape cancels (sets ref) then closes. */
export function textareaCommitKeyDown(
  cancelRef: MutableRefObject<boolean>,
  onClose: () => void,
): KeyboardEventHandler<HTMLTextAreaElement> {
  return (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelRef.current = true;
      onClose();
    }
  };
}

export interface EditableFieldProps {
  /** Authoritative value while the editor is closed (e.g. server props). */
  value: string;
  canEdit: boolean;
  /** Called when the user commits a new value (blur after edit). */
  onCommit: (next: string) => void;
  placeholder: string;
  classNameClickable: string;
  classNameReadonly: string;
  classNameTextarea: string;
  /** When true, committed text uses the loading shimmer style in clickable/readonly modes. */
  displayShimmer?: boolean;
  /** Base tint for tw-shimmer text (semi-transparent). Script vs imagery rows use different parent colors. */
  displayShimmerTintClass?: string;
}

/**
 * Click-to-edit field with internal draft / committed state and sync from `value` when closed.
 */
export function EditableField({
  value,
  canEdit,
  onCommit,
  placeholder,
  classNameClickable,
  classNameReadonly,
  classNameTextarea,
  displayShimmer = false,
  displayShimmerTintClass = "text-foreground/50",
}: EditableFieldProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [committed, setCommitted] = useState(value);
  const [draft, setDraft] = useState(value);
  const cancelOnBlurRef = useRef(false);

  useEffect(() => {
    if (!editorOpen) {
      setCommitted(value);
      setDraft(value);
    }
  }, [value, editorOpen]);

  const openEditor = useCallback(() => {
    setDraft(committed);
    setEditorOpen(true);
  }, [committed]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    if (cancelOnBlurRef.current) {
      cancelOnBlurRef.current = false;
      setDraft(committed);
      return;
    }
    if (draft === committed) return;
    setCommitted(draft);
    onCommit(draft);
  }, [draft, committed, onCommit]);

  const mode: EditableFieldMode = editorOpen
    ? "editing"
    : canEdit
      ? "clickable"
      : "readonly";

  const display = (
    <MaybeShimmer
      active={displayShimmer}
      tintClassName={displayShimmerTintClass}
    >
      {committed}
    </MaybeShimmer>
  );

  switch (mode) {
    case "editing":
      return (
        <AutosizeTextarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={closeEditor}
          onKeyDown={textareaCommitKeyDown(cancelOnBlurRef, closeEditor)}
          autoFocus
          placeholder={placeholder}
          className={classNameTextarea}
        />
      );
    case "clickable":
      return (
        <button type="button" onClick={openEditor} className={classNameClickable}>
          {display}
        </button>
      );
    default:
      return <p className={classNameReadonly}>{display}</p>;
  }
}
