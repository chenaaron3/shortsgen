"use client";

import { diffWordsWithSpace } from 'diff';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { Button } from '~/components/ui/button';
import { useOptimisticScenePatcher } from '~/hooks/useOptimisticScenePatcher';
import { cn } from '~/lib/utils';
import { useRunStore } from '~/stores/useRunStore';

import { WordDiff } from '../WordDiff';

interface SceneSuggestionDiffProps {
  sceneIndex: number;
  sceneText: string;
  sceneImagery: string;
  suggestedText: string;
  suggestedImagery: string;
  isActive: boolean;
  acceptPending: boolean;
}

interface SideBySideDiffBlockProps {
  label: string;
  before: string;
  after: string;
  textClassName: string;
}

interface HighlightedDiffTextProps {
  before: string;
  after: string;
  mode: "before" | "after";
  textClassName: string;
}

function HighlightedDiffText({
  before,
  after,
  mode,
  textClassName,
}: HighlightedDiffTextProps) {
  const parts = useMemo(() => diffWordsWithSpace(before, after), [before, after]);

  return (
    <p className={cn("whitespace-pre-wrap", textClassName)}>
      {parts.map((part, idx) => {
        if (mode === "before" && part.added) {
          return null;
        }
        if (mode === "after" && part.removed) {
          return null;
        }

        return (
          <span
            key={idx}
            className={cn(
              mode === "before" &&
              part.removed &&
              "text-destructive line-through decoration-destructive/70",
              mode === "after" && part.added && "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {part.value}
          </span>
        );
      })}
    </p>
  );
}

function SideBySideDiffBlock({
  label,
  before,
  after,
  textClassName,
}: SideBySideDiffBlockProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-1 rounded-md border border-border/70 bg-muted/20 p-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Before
          </p>
          <HighlightedDiffText
            before={before}
            after={after}
            mode="before"
            textClassName={textClassName}
          />
        </div>
        <div className="space-y-1 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            After
          </p>
          <HighlightedDiffText
            before={before}
            after={after}
            mode="after"
            textClassName={textClassName}
          />
        </div>
      </div>
    </div>
  );
}

export function SceneSuggestionDiff({
  sceneIndex,
  sceneText,
  sceneImagery,
  suggestedText,
  suggestedImagery,
  isActive,
  acceptPending,
}: SceneSuggestionDiffProps) {
  const runId = useRunStore((s) => s.ui.runId) ?? "";
  const videoId = useRunStore((s) => s.ui.activeVideoId) ?? "";
  const clearSceneSuggestionAt = useRunStore((s) => s.clearSceneSuggestionAt);
  const { persistSceneDrafts, isPending } = useOptimisticScenePatcher(runId, videoId);

  return (
    <motion.div layout className="space-y-2">
      <AnimatePresence initial={false} mode="wait">
        {isActive ? (
          <motion.div
            key="active"
            layout
            initial={{ opacity: 0, y: 8, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.995 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="space-y-2"
          >
            <SideBySideDiffBlock
              label="Script"
              before={sceneText}
              after={suggestedText}
              textClassName="whitespace-pre-wrap text-sm leading-snug text-foreground"
            />
            <SideBySideDiffBlock
              label="Imagery"
              before={sceneImagery}
              after={suggestedImagery}
              textClassName="whitespace-pre-wrap text-xs text-muted-foreground"
            />
          </motion.div>
        ) : (
          <motion.div
            key="overview"
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="space-y-2"
          >
            <WordDiff before={sceneText} after={suggestedText} variant="script" />
            <WordDiff before={sceneImagery} after={suggestedImagery} variant="imagery" />
          </motion.div>
        )}
      </AnimatePresence>
      {isActive && (
        <div className="flex justify-center gap-2 pt-1">
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 min-w-20 px-3 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500/50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            disabled={acceptPending || isPending}
            onClick={() => {
              persistSceneDrafts(
                {
                  [String(sceneIndex)]: {
                    scriptText: suggestedText,
                    imageryText: suggestedImagery,
                  },
                },
                {
                  onSuccess: () => clearSceneSuggestionAt(sceneIndex),
                },
              );
            }}
          >
            Accept
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 min-w-20 px-3 text-xs font-medium"
            disabled={acceptPending}
            onClick={() => clearSceneSuggestionAt(sceneIndex)}
          >
            Decline
          </Button>
        </div>
      )}
    </motion.div>
  );
}
