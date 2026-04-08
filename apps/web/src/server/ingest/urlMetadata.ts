/**
 * SSRF-safe URL fetch for preview metadata (og:title, og:site_name).
 * Shared policy with services/python-generator/scripts/ingest/url_security.py.
 */

import { isIPv4, isIPv6 } from "node:net";

const MAX_ARTICLE_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 20_000;

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

async function fetchArticleHtml(url: string): Promise<{ html: string; url: string }> {
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
      throw new Error(
        "This URL did not return HTML.",
      );
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
  const words = bodyText.length ? bodyText.split(" ").filter(Boolean).length : 0;
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
  return h === "reddit.com" || h === "www.reddit.com" || h.endsWith(".reddit.com");
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

function titleFromSlug(slug: string): string | undefined {
  const decoded = decodeURIComponent(slug).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
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
} | null> {
  try {
    const normalized = new URL(url);
    // Use Reddit's JSON endpoint to bypass anti-bot HTML interstitials.
    const jsonUrl = new URL(`${normalized.pathname.replace(/\/$/, "")}.json`, normalized);
    if (normalized.searchParams.size > 0) {
      jsonUrl.search = normalized.search;
    }
    jsonUrl.searchParams.set("raw_json", "1");
    assertUrlSafeForServerFetch(jsonUrl.href);

    const res = await fetch(jsonUrl.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Shortgen/1.0; +https://shortgen.app)",
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
    const postListing = payload[0] as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
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
      typeof postData.selftext === "string" ? postData.selftext.replace(/\s+/g, " ").trim() : "";
    const contentLengthWords = selftext.length
      ? selftext.split(" ").filter(Boolean).length
      : undefined;
    if (!isMeaningfulTitle(pageTitle)) return null;
    return { siteName: subreddit ?? "Reddit", pageTitle, contentLengthWords };
  } catch (error) {
    console.error("[urlMetadata] Reddit JSON metadata parse failed", {
      url: safeUrlForLog(url),
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
    const payload = (await res.json()) as { title?: unknown; author_name?: unknown };
    const pageTitle =
      typeof payload.title === "string" && payload.title.trim().length > 0
        ? payload.title.trim()
        : undefined;
    const siteName =
      typeof payload.author_name === "string" && payload.author_name.trim().length > 0
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

/** Preview only: site / page name for UI. Same SSRF rules as full ingest. */
export async function fetchUrlPreviewMetadata(
  rawUrl: string,
): Promise<UrlPreviewMetadata | null> {
  try {
    const trimmed = rawUrl.trim();
    const u = assertUrlSafeForServerFetch(trimmed);
    const hostname = u.hostname;

    if (isRedditHost(hostname)) {
      const redditMeta = await fetchRedditJsonMetadata(trimmed);
      if (redditMeta) {
        return { hostname, ...redditMeta };
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
      const youtubeMeta = await fetchYoutubeOembedMetadata(trimmed);
      if (youtubeMeta) {
        return { hostname, ...youtubeMeta };
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
    };
  } catch (error) {
    console.error("[urlMetadata] URL preview metadata fetch failed", {
      url: safeUrlForLog(rawUrl),
      error: errorMessage(error),
    });
    return null;
  }
}
