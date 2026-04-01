import { Readability } from "@mozilla/readability";
// Package "main" points at CJS; Node ESM load hits "exports is not defined". Use the ESM build.
import {
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript/dist/youtube-transcript.esm.js";
import { isIPv4, isIPv6 } from "node:net";

const MAX_RESOLVED_CHARS = 500_000;
const MAX_ARTICLE_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 20_000;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function truncate(s: string): string {
  if (s.length <= MAX_RESOLVED_CHARS) return s;
  return s.slice(0, MAX_RESOLVED_CHARS);
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

function assertUrlSafeForServerFetch(href: string): URL {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (u.protocol !== "https:") {
    throw new Error("Only https:// links are supported for articles.");
  }
  if (isBlockedHostname(u.hostname)) {
    throw new Error("This URL cannot be fetched.");
  }
  if (!u.hostname.includes(".")) {
    throw new Error("Invalid URL.");
  }
  return u;
}

function isEntireInputHttpsUrl(input: string): boolean {
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

function extractYoutubeVideoId(href: string): string | null {
  try {
    const u = new URL(href.trim());
    const host = u.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id ?? null;
    }
    if (
      host === "www.youtube.com" ||
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "www.youtube-nocookie.com" ||
      host === "youtube-nocookie.com"
    ) {
      if (u.pathname.startsWith("/watch")) {
        const v = u.searchParams.get("v");
        if (v) return v;
      }
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/").filter(Boolean)[1] ?? null;
      }
      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.split("/").filter(Boolean)[1] ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
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
    if (
      !ct.includes("text/html") &&
      !ct.includes("application/xhtml")
    ) {
      throw new Error(
        "This URL did not return a web article (HTML only for now).",
      );
    }

    const buf = await readBodyWithLimit(res, MAX_ARTICLE_BYTES);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return { html, url: currentUrl };
  }

  throw new Error("Too many redirects.");
}

async function extractReadableText(
  html: string,
  pageUrl: string,
): Promise<string> {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(html, { url: pageUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article?.textContent?.trim()) {
    throw new Error(
      "Could not extract readable text. Try copying the article text instead.",
    );
  }
  return article.textContent.replace(/\s+/g, " ").trim();
}

function youtubeErrorMessage(err: unknown): string {
  if (err instanceof YoutubeTranscriptNotAvailableError) {
    return "No captions are available for this video. Try another video or paste a transcript.";
  }
  if (err instanceof YoutubeTranscriptDisabledError) {
    return "Captions are disabled on this video.";
  }
  if (err instanceof YoutubeTranscriptVideoUnavailableError) {
    return "This YouTube video is unavailable or private.";
  }
  if (err instanceof Error) return err.message;
  return "Could not load YouTube captions.";
}

/**
 * Normalizes user input: plain text is returned as-is; a single https URL may be
 * resolved to article or YouTube transcript text.
 */
export async function resolveUserInput(raw: string): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Enter a link or some text to get started.");
  }

  if (!isEntireInputHttpsUrl(trimmed)) {
    return truncate(trimmed);
  }

  const ytId = extractYoutubeVideoId(trimmed);
  if (ytId) {
    try {
      const parts = await fetchTranscript(ytId);
      const text = parts.map((p) => p.text).join(" ").replace(/\s+/g, " ").trim();
      if (!text) {
        throw new Error("YouTube returned an empty transcript.");
      }
      return truncate(text);
    } catch (err) {
      throw new Error(youtubeErrorMessage(err));
    }
  }

  const { html, url: finalUrl } = await fetchArticleHtml(trimmed);
  const text = await extractReadableText(html, finalUrl);
  return truncate(text);
}
