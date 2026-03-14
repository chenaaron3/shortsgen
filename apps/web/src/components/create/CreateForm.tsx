"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { api } from "~/utils/api";
import { useUserConfig } from "~/hooks/useUserConfig";
import { InspirationCard } from "./InspirationCard";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  YOUTUBE_SAMPLE,
  ARTICLE_SAMPLE,
  BOOK_SAMPLE,
} from "~/constants/inspirationSamples";

export function CreateForm() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { config } = useUserConfig();
  const [input, setInput] = useState("");

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
        Paste your content below. We&apos;ll break it into clips, generate scripts and
        scenes, then you can refine before generating images and voice.
      </p>
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste your article, transcript, or notes here…"
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
