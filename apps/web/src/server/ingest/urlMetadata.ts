/**
 * SSRF-safe URL fetch for preview metadata (og:title, og:site_name).
 * Shared policy with services/python-generator/scripts/ingest/url_security.py.
 */

import { isIPv4, isIPv6 } from "node:net";
import { YoutubeTranscript } from "youtube-transcript/dist/youtube-transcript.esm.js";
import { Innertube } from "youtubei.js";

const MAX_ARTICLE_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 20_000;
const REDDIT_TOP_COMMENTS_LIMIT = 25;
const DEFAULT_REDDIT_USER_AGENT =
  "web:shortgen.url-ingest:v1.0.0 (by /u/shortgenapp)";
let innertubeClientPromise: Promise<unknown> | null = null;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function safeUrlForLog(input: string): string {
  try {
    const u = new URL(input);
    return `${u.origin}${u.pathname}`;
  } catch {
    return input;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function redditUserAgent(): string {
  const configured = process.env.SHORTGEN_REDDIT_USER_AGENT?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_REDDIT_USER_AGENT;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".localhost")) return true;
  if (h.endsWith(".internal")) return true;

  if (isIPv4(h)) {
    const p = h.split(".").map((x) => Number(x));
    const a = p[0];
    const b = p[1];
    if (a === undefined || b === undefined) return false;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (isIPv6(h)) {
    const low = h.toLowerCase();
    if (low === "::1") return true;
    if (low.startsWith("fe80:")) return true;
    if (low.startsWith("fc") || low.startsWith("fd")) return true;
    return false;
  }

  return false;
}

export function assertUrlSafeForServerFetch(href: string): URL {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (u.protocol !== "https:") {
    throw new Error("Only https:// links are supported.");
  }
  if (isBlockedHostname(u.hostname)) {
    throw new Error("This URL cannot be fetched.");
  }
  if (!u.hostname.includes(".")) {
    throw new Error("Invalid URL.");
  }
  return u;
}

/** Single-line https URL (same rules as pipeline ingest). */
export function isEntireInputHttpsUrl(input: string): boolean {
  const t = input.trim();
  if (!t || t.includes("\n")) return false;
  if (/\s/.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

async function readBodyWithLimit(
  res: Response,
  maxBytes: number,
): Promise<ArrayBuffer> {
  const reader = res.body?.getReader();
  if (!reader) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      throw new Error("Page is too large to import.");
    }
    return ab;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Page is too large to import.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

async function fetchArticleHtml(
  url: string,
): Promise<{ html: string; url: string }> {
  let currentUrl = url;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    assertUrlSafeForServerFetch(currentUrl);

    const res = await fetch(currentUrl, {
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Shortgen/1.0; +https://shortgen.app)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new Error("Redirect without a Location header.");
      }
      currentUrl = new URL(loc, currentUrl).href;
      continue;
    }

    if (!res.ok) {
      throw new Error(`Could not load page (HTTP ${res.status}).`);
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      throw new Error("This URL did not return HTML.");
    }

    const buf = await readBodyWithLimit(res, MAX_ARTICLE_BYTES);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return { html, url: currentUrl };
  }

  throw new Error("Too many redirects.");
}

function decodeHtmlEntities(value: string): string {
  const decodedNamed = value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return decodedNamed.replace(/&#(\d+);/g, (_m, n: string) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCharCode(code) : _m;
  });
}

function stripXmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTagInnerHtml(
  html: string,
  tag: "article" | "main",
): string | null {
  const match = html.match(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
  );
  return match?.[1]?.trim() || null;
}

function toReadablePlainText(html: string): string {
  return stripHtmlToText(html)
    .split(/\s{2,}/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n");
}

function extractMetaTagContent(
  html: string,
  key: string,
  attr: "property" | "name" = "property",
): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta[^>]*\\b${attr}\\s*=\\s*["']${escaped}["'][^>]*\\bcontent\\s*=\\s*["']([^"']+)["'][^>]*>`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] ? decodeHtmlEntities(m[1]).trim() : undefined;
}

function extractTitleTag(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return undefined;
  return decodeHtmlEntities(m[1]).replace(/\s+/g, " ").trim();
}

function parseHtmlMeta(html: string): {
  siteName?: string;
  pageTitle?: string;
  contentLengthWords?: number;
} {
  const ogSite = extractMetaTagContent(html, "og:site_name", "property");
  const ogTitle = extractMetaTagContent(html, "og:title", "property");
  const titleEl = extractTitleTag(html);
  const bodyText = stripHtmlToText(html);
  const words = bodyText.length
    ? bodyText.split(" ").filter(Boolean).length
    : 0;
  return {
    siteName: ogSite || undefined,
    pageTitle: ogTitle || titleEl || undefined,
    contentLengthWords: words > 0 ? words : undefined,
  };
}

export type UrlPreviewMetadata = {
  hostname: string;
  siteName?: string;
  pageTitle?: string;
  contentLengthWords?: number;
  content?: string;
};

function normalizeMetaText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isMeaningfulTitle(value: string | undefined): boolean {
  const title = normalizeMetaText(value);
  if (!title) return false;
  if (title.length < 3) return false;
  if (/^[-–—|:]+$/.test(title)) return false;
  if (/^[-–—|:]\s*youtube$/i.test(title)) return false;
  if (/please wait for verification/i.test(title)) return false;
  return true;
}

function isRedditHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "reddit.com" || h === "www.reddit.com" || h.endsWith(".reddit.com")
  );
}

function isYouTubeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "youtube.com" ||
    h === "www.youtube.com" ||
    h === "m.youtube.com" ||
    h === "music.youtube.com" ||
    h === "youtu.be"
  );
}

function extractYouTubeVideoId(url: URL): string | null {
  const h = url.hostname.toLowerCase();
  if (h === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id?.trim() || null;
  }
  if (h === "youtube.com" || h === "www.youtube.com" || h === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const id = (url.searchParams.get("v") ?? "").trim();
      return id || null;
    }
    if (
      url.pathname.startsWith("/shorts/") ||
      url.pathname.startsWith("/live/")
    ) {
      const segments = url.pathname.split("/").filter(Boolean);
      const id = segments[1];
      return id?.trim() || null;
    }
    return null;
  }
  if (h === "music.youtube.com") {
    if (url.pathname === "/watch") {
      const id = (url.searchParams.get("v") ?? "").trim();
      return id || null;
    }
    return null;
  }
  return null;
}

function isValidYouTubeVideoUrl(url: URL): boolean {
  const h = url.hostname.toLowerCase();
  if (h === "youtu.be") {
    return url.pathname.split("/").filter(Boolean).length >= 1;
  }
  if (h === "youtube.com" || h === "www.youtube.com" || h === "m.youtube.com") {
    if (url.pathname === "/watch") {
      return (url.searchParams.get("v") ?? "").trim().length > 0;
    }
    if (url.pathname.startsWith("/shorts/")) {
      return url.pathname.split("/").filter(Boolean).length >= 2;
    }
    if (url.pathname.startsWith("/live/")) {
      return url.pathname.split("/").filter(Boolean).length >= 2;
    }
    return false;
  }
  if (h === "music.youtube.com") {
    if (url.pathname === "/watch") {
      return (url.searchParams.get("v") ?? "").trim().length > 0;
    }
    return false;
  }
  return false;
}

function titleFromSlug(slug: string): string | undefined {
  const decoded = decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!decoded) return undefined;
  return decoded.charAt(0).toUpperCase() + decoded.slice(1);
}

function deriveRedditFallbackMetadata(url: string): {
  siteName?: string;
  pageTitle?: string;
  contentLengthWords?: number;
} | null {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    // Typical post path: /r/{subreddit}/comments/{postId}/{slug}/
    if (segments.length < 5) return null;
    if (segments[0] !== "r" || segments[2] !== "comments") return null;
    const subreddit = segments[1];
    const slug = segments[4];
    if (!subreddit || !slug) return null;
    const pageTitle = titleFromSlug(slug) ?? "Reddit post";
    return { siteName: `r/${subreddit}`, pageTitle };
  } catch {
    return null;
  }
}

async function fetchRedditJsonMetadata(url: string): Promise<{
  siteName?: string;
  pageTitle?: string;
  contentLengthWords?: number;
  content?: string;
} | null> {
  try {
    const normalized = new URL(url);
    // Reddit policy requires unique, descriptive user agents.
    const jsonUrl = new URL(
      `https://www.reddit.com${normalized.pathname.replace(/\/$/, "")}.json`,
    );
    jsonUrl.searchParams.set("raw_json", "1");
    jsonUrl.searchParams.set("limit", String(REDDIT_TOP_COMMENTS_LIMIT));
    // Keep only top-level comments; avoids huge nested payloads.
    jsonUrl.searchParams.set("depth", "1");
    assertUrlSafeForServerFetch(jsonUrl.href);

    const res = await fetch(jsonUrl.href, {
      headers: {
        "User-Agent": redditUserAgent(),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[urlMetadata] Reddit JSON metadata request failed", {
        url: safeUrlForLog(jsonUrl.href),
        status: res.status,
      });
      return null;
    }
    const payload = (await res.json()) as unknown;
    if (!Array.isArray(payload) || payload.length === 0) return null;
    const postListing = payload[0] as {
      data?: { children?: Array<{ data?: Record<string, unknown> }> };
    };
    const postData = postListing?.data?.children?.[0]?.data;
    if (!postData) return null;
    const pageTitle =
      typeof postData.title === "string" && postData.title.trim().length > 0
        ? postData.title.trim()
        : undefined;
    const subreddit =
      typeof postData.subreddit_name_prefixed === "string" &&
      postData.subreddit_name_prefixed.trim().length > 0
        ? postData.subreddit_name_prefixed.trim()
        : undefined;
    const selftext =
      typeof postData.selftext === "string"
        ? postData.selftext.replace(/\s+/g, " ").trim()
        : "";
    const contentLengthWords = selftext.length
      ? selftext.split(" ").filter(Boolean).length
      : undefined;
    const commentsListing = payload[1] as
      | {
          data?: {
            children?: Array<{
              kind?: unknown;
              data?: Record<string, unknown>;
            }>;
          };
        }
      | undefined;
    const topCommentBodies =
      commentsListing?.data?.children
        ?.filter((child) => child?.kind === "t1")
        .map((child) => {
          const body = child?.data?.body;
          return typeof body === "string"
            ? body.replace(/\s+/g, " ").trim()
            : "";
        })
        .filter(
          (body) =>
            body.length > 0 && body !== "[deleted]" && body !== "[removed]",
        )
        .slice(0, REDDIT_TOP_COMMENTS_LIMIT) ?? [];

    if (!isMeaningfulTitle(pageTitle)) return null;
    const contentParts: string[] = [];
    contentParts.push(`# ${pageTitle}`);
    if (selftext.length > 0) {
      contentParts.push("", selftext);
    }
    if (topCommentBodies.length > 0) {
      contentParts.push("", "## Top comments");
      contentParts.push(
        ...topCommentBodies.map((comment, idx) => `${idx + 1}. ${comment}`),
      );
    }
    const content = contentParts.join("\n").trim() || undefined;

    return {
      siteName: subreddit ?? "Reddit",
      pageTitle,
      contentLengthWords,
      content,
    };
  } catch (error) {
    console.error("[urlMetadata] Reddit JSON metadata parse failed", {
      url: safeUrlForLog(url),
      error: errorMessage(error),
    });
    return null;
  }
}

function extractReadableArticleContent(
  html: string,
  pageUrl: string,
): string | null {
  try {
    const articleHtml = extractTagInnerHtml(html, "article");
    const mainHtml = articleHtml ? null : extractTagInnerHtml(html, "main");
    const preferredHtml = articleHtml ?? mainHtml ?? html;
    const body = toReadablePlainText(preferredHtml);
    if (!body) return null;
    const title = extractTitleTag(html)?.replace(/\s+/g, " ").trim() ?? "";
    if (title.length > 0) {
      return `# ${title}\n\n${body}`;
    }
    return body;
  } catch (error) {
    console.error("[urlMetadata] Readability content extraction failed", {
      url: safeUrlForLog(pageUrl),
      error: errorMessage(error),
    });
    return null;
  }
}

async function fetchYoutubeOembedMetadata(url: string): Promise<{
  siteName?: string;
  pageTitle?: string;
  contentLengthWords?: number;
} | null> {
  try {
    const oembedUrl = new URL("https://www.youtube.com/oembed");
    oembedUrl.searchParams.set("url", url);
    oembedUrl.searchParams.set("format", "json");
    assertUrlSafeForServerFetch(oembedUrl.href);

    const res = await fetch(oembedUrl.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Shortgen/1.0; +https://shortgen.app)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[urlMetadata] YouTube oEmbed request failed", {
        url: safeUrlForLog(oembedUrl.href),
        status: res.status,
      });
      return null;
    }
    const payload = (await res.json()) as {
      title?: unknown;
      author_name?: unknown;
    };
    const pageTitle =
      typeof payload.title === "string" && payload.title.trim().length > 0
        ? payload.title.trim()
        : undefined;
    const siteName =
      typeof payload.author_name === "string" &&
      payload.author_name.trim().length > 0
        ? payload.author_name.trim()
        : "YouTube";
    if (!isMeaningfulTitle(pageTitle)) return null;
    return { siteName, pageTitle };
  } catch (error) {
    console.error("[urlMetadata] YouTube oEmbed parse failed", {
      url: safeUrlForLog(url),
      error: errorMessage(error),
    });
    return null;
  }
}

function parseCaptionXmlToLines(xml: string): string[] {
  const matches = [...xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)];
  const lines = matches
    .map((m) =>
      decodeHtmlEntities(stripXmlTags(m[1] ?? ""))
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 0);
  return lines;
}

function parseCaptionJson3ToLines(jsonText: string): string[] {
  try {
    const parsed = JSON.parse(jsonText) as {
      events?: Array<{ segs?: Array<{ utf8?: string }> }>;
    };
    return (
      parsed.events
        ?.map((event) =>
          (event.segs ?? [])
            .map((seg) => (typeof seg.utf8 === "string" ? seg.utf8 : ""))
            .join("")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter((line): line is string => line.length > 0) ?? []
    );
  } catch {
    return [];
  }
}

async function getInnertubeClient(): Promise<unknown> {
  if (!innertubeClientPromise) {
    innertubeClientPromise = Innertube.create();
  }
  return innertubeClientPromise;
}

type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
};

function extractCaptionTracksFromInnertubeInfo(info: unknown): CaptionTrack[] {
  const anyInfo = info as Record<string, unknown>;
  const tracksCandidates = [
    (anyInfo?.captions as Record<string, unknown> | undefined)?.caption_tracks,
    (anyInfo?.captions as Record<string, unknown> | undefined)?.captionTracks,
    (
      (anyInfo?.player_response as Record<string, unknown> | undefined)
        ?.captions as Record<string, unknown> | undefined
    )?.playerCaptionsTracklistRenderer,
    (
      (anyInfo?.raw_data as Record<string, unknown> | undefined)?.captions as
        | Record<string, unknown>
        | undefined
    )?.playerCaptionsTracklistRenderer,
  ];

  const directTracks =
    tracksCandidates.find((candidate) => Array.isArray(candidate)) ?? null;
  const rendererTracks = tracksCandidates
    .map((candidate) => {
      if (
        candidate &&
        typeof candidate === "object" &&
        "captionTracks" in candidate
      ) {
        return (candidate as { captionTracks?: unknown }).captionTracks;
      }
      return null;
    })
    .find((candidate) => Array.isArray(candidate));

  const tracksRaw = (directTracks ?? rendererTracks) as unknown[] | undefined;
  if (!tracksRaw || tracksRaw.length === 0) return [];

  return tracksRaw
    .map((track): CaptionTrack | undefined => {
      const t = track as Record<string, unknown>;
      const baseUrl =
        (typeof t.base_url === "string" ? t.base_url : null) ??
        (typeof t.baseUrl === "string" ? t.baseUrl : null);
      const languageCode =
        (typeof t.language_code === "string" ? t.language_code : null) ??
        (typeof t.languageCode === "string" ? t.languageCode : null);
      const kind = typeof t.kind === "string" ? t.kind : undefined;
      if (!baseUrl || !languageCode) return undefined;
      return { baseUrl, languageCode, kind };
    })
    .filter((track): track is CaptionTrack => track !== undefined);
}

async function fetchCaptionTrackContent(
  trackUrl: string,
  videoId: string,
  label: string,
): Promise<string | null> {
  const url = `${trackUrl}${trackUrl.includes("?") ? "&" : "?"}fmt=json3`;
  console.info("[urlMetadata] YouTube innertube caption track attempt", {
    videoId,
    label,
  });
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Shortgen/1.0; +https://shortgen.app)",
        Accept:
          "application/json,text/xml;q=0.9,application/xml;q=0.8,*/*;q=0.7",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("[urlMetadata] YouTube innertube caption track non-200", {
        videoId,
        label,
        status: res.status,
      });
      return null;
    }
    const raw = await res.text();
    const jsonLines = parseCaptionJson3ToLines(raw);
    if (jsonLines.length > 0) {
      console.info(
        "[urlMetadata] YouTube innertube caption track succeeded (json3)",
        {
          videoId,
          label,
          lines: jsonLines.length,
        },
      );
      return jsonLines.join("\n");
    }
    const xmlLines = parseCaptionXmlToLines(raw);
    if (xmlLines.length > 0) {
      console.info(
        "[urlMetadata] YouTube innertube caption track succeeded (xml)",
        {
          videoId,
          label,
          lines: xmlLines.length,
        },
      );
      return xmlLines.join("\n");
    }
    console.warn("[urlMetadata] YouTube innertube caption track empty", {
      videoId,
      label,
      responseSize: raw.length,
    });
    return null;
  } catch (error) {
    console.warn(
      "[urlMetadata] YouTube innertube caption track request error",
      {
        videoId,
        label,
        error: errorMessage(error),
      },
    );
    return null;
  }
}

async function fetchYouTubeTranscriptViaInnertubeCaptionTracks(
  videoId: string,
): Promise<string | null> {
  try {
    const client = await getInnertubeClient();
    const info = await (
      client as { getInfo: (id: string) => Promise<unknown> }
    ).getInfo(videoId);
    const tracks = extractCaptionTracksFromInnertubeInfo(info);
    if (!Array.isArray(tracks) || tracks.length === 0) {
      console.warn("[urlMetadata] YouTube innertube no caption tracks", {
        videoId,
      });
      return null;
    }
    const englishTracks = tracks.filter(
      (track) =>
        typeof track.baseUrl === "string" &&
        typeof track.languageCode === "string" &&
        track.languageCode.toLowerCase().startsWith("en"),
    );
    if (englishTracks.length === 0) {
      console.warn(
        "[urlMetadata] YouTube innertube no english caption tracks",
        {
          videoId,
        },
      );
      return null;
    }
    const ordered = englishTracks.sort((a, b) => {
      const aIsAsr = (a.kind ?? "") === "asr";
      const bIsAsr = (b.kind ?? "") === "asr";
      if (aIsAsr !== bIsAsr) return aIsAsr ? 1 : -1; // manual first, then ASR
      return 0;
    });
    for (const track of ordered) {
      if (!track.baseUrl) continue;
      const label = `${track.languageCode}:${track.kind ?? "manual"}`;
      const content = await fetchCaptionTrackContent(
        track.baseUrl,
        videoId,
        label,
      );
      if (content) return content;
    }
    console.warn("[urlMetadata] YouTube innertube caption tracks exhausted", {
      videoId,
    });
    return null;
  } catch (error) {
    console.warn("[urlMetadata] YouTube innertube getInfo failed", {
      videoId,
      error: errorMessage(error),
    });
    return null;
  }
}

async function fetchYouTubeCaptionFallback(
  videoId: string,
): Promise<string | null> {
  const content =
    await fetchYouTubeTranscriptViaInnertubeCaptionTracks(videoId);
  if (content) {
    console.info("[urlMetadata] YouTube innertube caption fallback succeeded", {
      videoId,
      chars: content.length,
    });
    return content;
  }
  console.warn("[urlMetadata] YouTube innertube caption fallback failed", {
    videoId,
  });
  return null;
}

async function fetchYouTubeTranscriptContent(url: URL): Promise<string | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    console.warn("[urlMetadata] YouTube transcript skipped: missing videoId", {
      url: safeUrlForLog(url.href),
    });
    return null;
  }
  console.info("[urlMetadata] YouTube transcript start", {
    url: safeUrlForLog(url.href),
    videoId,
  });
  let lines: string[] = [];
  let libraryError: string | null = null;
  try {
    console.info("[urlMetadata] YouTube transcript library attempt", {
      videoId,
    });
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    lines = transcript
      .map((entry: { text?: unknown }) =>
        typeof entry.text === "string"
          ? entry.text.replace(/\s+/g, " ").trim()
          : "",
      )
      .filter((line): line is string => line.length > 0);
  } catch (error) {
    libraryError = errorMessage(error);
    console.warn(
      "[urlMetadata] YouTube transcript library failed, trying innertube caption fallback",
      {
        url: safeUrlForLog(url.href),
        videoId,
        error: libraryError,
      },
    );
    lines = [];
  }
  if (lines.length > 0) {
    console.info("[urlMetadata] YouTube transcript library succeeded", {
      videoId,
      lines: lines.length,
    });
    return lines.join("\n");
  }
  console.warn("[urlMetadata] YouTube transcript library returned zero lines", {
    videoId,
  });
  const fallbackContent = await fetchYouTubeCaptionFallback(videoId);
  if (fallbackContent) return fallbackContent;
  console.error("[urlMetadata] YouTube transcript fetch failed", {
    url: safeUrlForLog(url.href),
    videoId,
    error:
      libraryError ??
      "YouTube transcript library returned zero lines and innertube caption fallback failed",
  });
  return null;
}

/** Preview only: site / page name for UI. Same SSRF rules as full ingest. */
export async function fetchUrlPreviewMetadata(
  rawUrl: string,
): Promise<UrlPreviewMetadata | null> {
  try {
    const trimmed = rawUrl.trim();
    const u = assertUrlSafeForServerFetch(trimmed);
    const hostname = u.hostname;

    if (isRedditHost(hostname)) {
      const redditMetaAndContent = await fetchRedditJsonMetadata(trimmed);
      if (redditMetaAndContent) {
        return { hostname, ...redditMetaAndContent };
      }
      const redditFallback = deriveRedditFallbackMetadata(trimmed);
      if (redditFallback && isMeaningfulTitle(redditFallback.pageTitle)) {
        console.warn("[urlMetadata] Using Reddit URL fallback metadata", {
          url: safeUrlForLog(trimmed),
        });
        return { hostname, ...redditFallback };
      }
    }

    if (isYouTubeHost(hostname)) {
      if (!isValidYouTubeVideoUrl(u)) {
        console.error(
          "[urlMetadata] Invalid YouTube URL: expected a video link",
          {
            url: safeUrlForLog(trimmed),
          },
        );
        return null;
      }
      const transcriptContent = await fetchYouTubeTranscriptContent(u);
      const youtubeMeta = await fetchYoutubeOembedMetadata(trimmed);
      if (youtubeMeta || transcriptContent) {
        return {
          hostname,
          ...(youtubeMeta ?? {}),
          ...(transcriptContent ? { content: transcriptContent } : {}),
        };
      }
    }

    const { html, url: finalUrl } = await fetchArticleHtml(trimmed);
    if (!html.trim()) {
      console.error("[urlMetadata] Fetched HTML was empty", {
        url: safeUrlForLog(finalUrl),
      });
      return null;
    }
    const meta = parseHtmlMeta(html);
    const siteName = normalizeMetaText(meta.siteName);
    const pageTitle = normalizeMetaText(meta.pageTitle);
    const readableContent = extractReadableArticleContent(html, finalUrl);
    if (!isMeaningfulTitle(pageTitle)) {
      console.error("[urlMetadata] Metadata title rejected as non-meaningful", {
        url: safeUrlForLog(finalUrl),
        pageTitle: pageTitle ?? null,
      });
      return null;
    }
    return {
      hostname,
      siteName,
      pageTitle,
      contentLengthWords: meta.contentLengthWords,
      ...(readableContent ? { content: readableContent } : {}),
    };
  } catch (error) {
    console.error("[urlMetadata] URL preview metadata fetch failed", {
      url: safeUrlForLog(rawUrl),
      error: errorMessage(error),
    });
    return null;
  }
}
