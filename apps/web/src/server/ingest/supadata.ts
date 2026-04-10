import { env } from "~/env";

const DEFAULT_SUPADATA_BASE_URL = "https://api.supadata.ai/v1";
const TRANSCRIPT_POLL_INTERVAL_MS = 1500;
const TRANSCRIPT_POLL_MAX_ATTEMPTS = 20;

const TRANSCRIPT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "tiktok.com",
  "www.tiktok.com",
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "instagram.com",
  "www.instagram.com",
  "facebook.com",
  "www.facebook.com",
  "fb.watch",
]);

type SupadataTranscriptChunk = {
  text?: string;
};

type SupadataTranscriptResponse = {
  content?: string | SupadataTranscriptChunk[];
  jobId?: string;
  status?: string;
  message?: string;
  details?: string;
  error?: string;
};

type SupadataScrapeResponse = {
  url?: string;
  content?: string;
  name?: string;
  description?: string;
};

export type SupadataStrategy = "transcript" | "crawl";

export type SupadataResolvedContent = {
  strategy: SupadataStrategy;
  markdown: string;
};

function supadataBaseUrl(): string {
  return (env.SUPADATA_BASE_URL ?? DEFAULT_SUPADATA_BASE_URL).replace(/\/$/, "");
}

function supadataApiKey(): string {
  const apiKey = env.SUPADATA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SUPADATA_API_KEY is not configured.");
  }
  return apiKey;
}

function resolveStrategy(url: URL): SupadataStrategy {
  return TRANSCRIPT_HOSTS.has(url.hostname.toLowerCase()) ? "transcript" : "crawl";
}

function transcriptContentToString(
  content: string | SupadataTranscriptChunk[] | undefined,
): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((chunk) => (typeof chunk.text === "string" ? chunk.text.trim() : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function formatTranscriptMarkdown(url: string, transcriptText: string): string {
  return [
    "# Transcript",
    "",
    `Source: ${url}`,
    "",
    "## Content",
    "",
    transcriptText,
  ].join("\n");
}

function formatScrapeMarkdown(url: string, title: string | undefined, content: string): string {
  return [
    `# ${title?.trim() || "Web content"}`,
    "",
    `Source: ${url}`,
    "",
    "## Content",
    "",
    content,
  ].join("\n");
}

async function fetchTranscriptJobResult(
  baseUrl: string,
  apiKey: string,
  jobId: string,
): Promise<SupadataTranscriptResponse> {
  const res = await fetch(`${baseUrl}/transcript/${encodeURIComponent(jobId)}`, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Supadata transcript job failed (HTTP ${res.status}).`);
  }
  return (await res.json()) as SupadataTranscriptResponse;
}

async function getTranscriptMarkdown(url: string): Promise<string> {
  const baseUrl = supadataBaseUrl();
  const apiKey = supadataApiKey();
  const requestUrl = new URL(`${baseUrl}/transcript`);
  requestUrl.searchParams.set("url", url);
  requestUrl.searchParams.set("text", "true");
  requestUrl.searchParams.set("mode", "auto");

  const res = await fetch(requestUrl.href, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });
  if (!(res.status === 200 || res.status === 202)) {
    throw new Error(`Supadata transcript request failed (HTTP ${res.status}).`);
  }

  let payload = (await res.json()) as SupadataTranscriptResponse;
  let transcriptText = transcriptContentToString(payload.content);
  if (transcriptText) {
    return formatTranscriptMarkdown(url, transcriptText);
  }

  if (payload.jobId) {
    const jobId = payload.jobId;
    for (let attempt = 0; attempt < TRANSCRIPT_POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, TRANSCRIPT_POLL_INTERVAL_MS));
      payload = await fetchTranscriptJobResult(baseUrl, apiKey, jobId);
      transcriptText = transcriptContentToString(payload.content);
      if (transcriptText) {
        return formatTranscriptMarkdown(url, transcriptText);
      }
      const status = (payload.status ?? "").toLowerCase();
      if (status === "failed" || status === "error") {
        break;
      }
    }
  }

  throw new Error(
    payload.message ||
      payload.details ||
      "Supadata transcript returned empty content.",
  );
}

async function getScrapeMarkdown(url: string): Promise<string> {
  const baseUrl = supadataBaseUrl();
  const apiKey = supadataApiKey();
  const requestUrl = new URL(`${baseUrl}/web/scrape`);
  requestUrl.searchParams.set("url", url);
  requestUrl.searchParams.set("noLinks", "true");

  const res = await fetch(requestUrl.href, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Supadata web scrape failed (HTTP ${res.status}).`);
  }
  const payload = (await res.json()) as SupadataScrapeResponse;
  const content = payload.content?.trim() ?? "";
  if (!content) {
    throw new Error("Supadata scrape returned empty content.");
  }
  return formatScrapeMarkdown(url, payload.name, content);
}

/**
 * Resolve URL source content using Supadata.
 * - Transcript strategy for supported social/video domains.
 * - Crawl strategy for web/blog domains.
 */
export async function resolveUrlContentWithSupadata(
  normalizedUrl: string,
): Promise<SupadataResolvedContent> {
  const parsed = new URL(normalizedUrl);
  const strategy = resolveStrategy(parsed);

  if (strategy === "transcript") {
    const markdown = await getTranscriptMarkdown(normalizedUrl);
    return { strategy, markdown };
  }
  const markdown = await getScrapeMarkdown(normalizedUrl);
  return { strategy, markdown };
}

