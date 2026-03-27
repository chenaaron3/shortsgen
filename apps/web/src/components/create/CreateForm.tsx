"use client";

import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  ARTICLE_SAMPLE,
  BOOK_SAMPLE,
  YOUTUBE_SAMPLE,
} from "~/constants/inspirationSamples";
import { SHORTGEN_PENDING_SOURCE_KEY } from "~/constants/pendingSource";
import { useUserConfig } from "~/hooks/useUserConfig";
import { api } from "~/utils/api";

import { InspirationCard } from "./InspirationCard";

export function CreateForm() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { config } = useUserConfig();
  const [input, setInput] = useState("");

  useEffect(() => {
    const draft = sessionStorage.getItem(SHORTGEN_PENDING_SOURCE_KEY);
    if (draft) {
      setInput(draft);
      sessionStorage.removeItem(SHORTGEN_PENDING_SOURCE_KEY);
    }
  }, []);

  const createRunMutation = api.runs.createRun.useMutation({
    onSuccess: (data) => {
      router.push(`/runs/${data.runId}`);
    },
  });

  const handleStart = () => {
    if (!input.trim()) return;
    createRunMutation.mutate({ userInput: input.trim(), config });
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-muted-foreground">Sign in to create videos.</p>
        <Button onClick={() => void signIn()} variant="secondary">
          Sign in
        </Button>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Paste a <strong className="font-medium text-foreground">YouTube</strong>{" "}
        or <strong className="font-medium text-foreground">article</strong> link,
        or your own text. When you click{" "}
        <strong className="font-medium text-foreground">Create</strong>, we load
        captions or the article when needed, then break content into clips. You
        refine scripts and scenes before images and voice.
      </p>
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="https://… or paste article, transcript, or notes"
        rows={8}
        disabled={createRunMutation.isPending}
        className="min-h-[200px] resize-y"
      />
      <Button
        onClick={handleStart}
        disabled={!input.trim() || createRunMutation.isPending}
        size="lg"
      >
        {createRunMutation.isPending ? "Creating…" : "Create"}
      </Button>

      <div className="border-t border-border pt-6">
        <p className="mb-3 text-sm font-medium text-muted-foreground">Try sample content</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InspirationCard
            title="YouTube"
            description="YouTube transcript style"
            onClick={() => setInput(YOUTUBE_SAMPLE)}
          />
          <InspirationCard
            title="Book"
            description="Interview / long-form transcript"
            onClick={() => setInput(BOOK_SAMPLE)}
          />
          <InspirationCard
            title="Article"
            description="Short article or blog post"
            onClick={() => setInput(ARTICLE_SAMPLE)}
          />
        </div>
      </div>

      {createRunMutation.isError && (
        <p className="text-destructive">{createRunMutation.error?.message}</p>
      )}
    </div>
  );
}
