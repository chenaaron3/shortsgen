"use client";

import { signIn, useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
import { ARTICLE_SAMPLE, REDDIT_SAMPLE, YOUTUBE_SAMPLE } from '~/constants/inspirationSamples';
import { SHORTGEN_PENDING_SOURCE_KEY } from '~/constants/pendingSource';
import { useUserConfig } from '~/hooks/useUserConfig';
import { buildSourceLabel } from '~/lib/urlPreviewLabel';
import { isSingleLineHttpsUrl } from '~/lib/urlValidation';
import { api } from '~/utils/api';

import { InspirationCard } from './InspirationCard';

const PIPELINE_CONFIG_OPTIONS: {
  value: "prototype" | "default";
  label: string;
  description: string;
}[] = [
    {
      value: "prototype",
      label: "Prototype",
      description: "Faster, lower cost models",
    },
    {
      value: "default",
      label: "Default",
      description: "Full quality pipeline",
    },
  ];

const MIN_TEXT_WORDS = 10;

function countWords(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function CreateForm() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { config: suggestedConfig } = useUserConfig();
  const [input, setInput] = useState("");
  const [previewedUrl, setPreviewedUrl] = useState<string | null>(null);
  const [pipelineConfig, setPipelineConfig] = useState<
    "prototype" | "default"
  >(suggestedConfig);

  useEffect(() => {
    const draft = sessionStorage.getItem(SHORTGEN_PENDING_SOURCE_KEY);
    if (draft) {
      setInput(draft);
      sessionStorage.removeItem(SHORTGEN_PENDING_SOURCE_KEY);
    }
  }, []);

  useEffect(() => {
    const t = input.trim();
    if (!isSingleLineHttpsUrl(t)) {
      setPreviewedUrl(null);
      previewUrlMetadata.reset();
      return;
    }
    const timer = setTimeout(() => {
      setPreviewedUrl(t);
      previewUrlMetadata.mutate({ url: t });
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on input only
  }, [input]);

  const utils = api.useUtils();
  const isAdminQuery = api.admin.isAdmin.useQuery();
  const previewUrlMetadata = api.runs.previewUrlMetadata.useMutation();
  const createRunMutation = api.runs.createRun.useMutation({
    onSuccess: (data) => {
      utils.runs.getById.setData({ runId: data.run.id }, data.run);
      void utils.runs.listRunsForUser.invalidate();
      router.push(`/runs/${data.run.id}`);
    },
  });

  const handleStart = () => {
    const t = input.trim();
    if (!t) return;

    if (isSingleLineHttpsUrl(t)) {
      if (
        previewedUrl !== t ||
        previewUrlMetadata.isPending ||
        !previewUrlMetadata.data
      ) {
        return;
      }
      let u: URL;
      try {
        u = new URL(t);
      } catch {
        return;
      }
      if (u.protocol !== "https:") return;
      createRunMutation.mutate({
        userInput: buildSourceLabel(previewUrlMetadata.data, t),
        sourceUrl: t,
        config: pipelineConfig,
      });
      return;
    }

    const wordCount = countWords(t);
    if (wordCount < MIN_TEXT_WORDS) {
      return;
    }

    createRunMutation.mutate({
      userInput: t,
      config: pipelineConfig,
    });
  };

  const trimmedInput = input.trim();
  const isUrlInput = isSingleLineHttpsUrl(trimmedInput);
  const textWordCount = isUrlInput ? 0 : countWords(trimmedInput);
  const hasEnoughTextWords = isUrlInput || textWordCount >= MIN_TEXT_WORDS;
  const dynamicRows = Math.min(10, Math.max(1, input.split("\n").length));
  const hasValidUrlMetadata =
    isUrlInput &&
    previewedUrl === trimmedInput &&
    !previewUrlMetadata.isPending &&
    !!previewUrlMetadata.data;
  const showInvalidUrlHint =
    isUrlInput &&
    previewedUrl === trimmedInput &&
    !previewUrlMetadata.isPending &&
    !previewUrlMetadata.data;
  const showMinWordHint =
    !isUrlInput && trimmedInput.length > 0 && !hasEnoughTextWords;

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
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">Create Short</h1>
        {isAdminQuery.data?.isAdmin && (
          <div className="w-full max-w-xs space-y-2">
            <Select
              value={pipelineConfig}
              onValueChange={(v) =>
                setPipelineConfig(v as "prototype" | "default")
              }
              disabled={createRunMutation.isPending}
            >
              <SelectTrigger
                id="create-pipeline-config"
                className="h-8 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_CONFIG_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-muted-foreground">
                      — {opt.description}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <p className="text-muted-foreground">
        Paste a YouTube/article URL or plain text. We auto-detect links and
        fetch source content when needed.
      </p>
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste a URL (or paste plain text)"
        rows={dynamicRows}
        disabled={createRunMutation.isPending}
        className="resize-y"
      />
      {isUrlInput &&
        previewUrlMetadata.data &&
        previewedUrl === trimmedInput && (
          <p className="text-sm text-muted-foreground">
            {previewUrlMetadata.data.siteName ?? previewUrlMetadata.data.hostname}
            {previewUrlMetadata.data.pageTitle
              ? ` — ${previewUrlMetadata.data.pageTitle}`
              : null}
            {previewUrlMetadata.data.contentLengthWords
              ? ` • ${previewUrlMetadata.data.contentLengthWords.toLocaleString()} words`
              : null}
          </p>
        )}
      {showInvalidUrlHint && (
        <p className="text-sm text-destructive">
          Could not validate this URL. Please use a valid page link.
        </p>
      )}
      {showMinWordHint && (
        <p className="text-sm text-destructive">
          Please enter at least {MIN_TEXT_WORDS} words for plain text (
          {textWordCount}/{MIN_TEXT_WORDS}).
        </p>
      )}
      <Button
        onClick={handleStart}
        disabled={
          !trimmedInput ||
          createRunMutation.isPending ||
          (isUrlInput && !hasValidUrlMetadata) ||
          !hasEnoughTextWords
        }
        size="lg"
      >
        {createRunMutation.isPending ? "Creating…" : "Create"}
      </Button>

      <div className="border-t border-border pt-6">
        <p className="mb-3 text-sm font-medium text-muted-foreground">Try sample content</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InspirationCard
            title="YouTube"
            description="YouTube link"
            onClick={() => setInput(YOUTUBE_SAMPLE)}
          />
          <InspirationCard
            title="Reddit"
            description="Reddit discussion thread"
            onClick={() => setInput(REDDIT_SAMPLE)}
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
