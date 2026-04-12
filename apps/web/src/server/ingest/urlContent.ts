import {
  isSupadataReservedHostname,
  resolveSupadataSourceAdapter,
  resolveUrlContentWithSupadata,
  type SupadataSourceAdapter,
} from "~/server/ingest/supadata";
import { fetchArticleHtml } from "~/server/ingest/urlMetadata";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export type UrlContentStrategy = "fetch" | "supadata";
export type UrlContentSourceAdapter = SupadataSourceAdapter | "html";

export type UrlContentResolved = {
  strategy: UrlContentStrategy;
  sourceAdapter: UrlContentSourceAdapter;
  markdown: string;
};

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});
turndown.use(gfm);
turndown.addRule("stripLinks", {
  filter: ["a"],
  replacement: (content) => content || "",
});
turndown.addRule("stripImages", {
  filter: ["img"],
  replacement: () => "",
});
turndown.addRule("stripLayout", {
  filter: ["nav", "header", "footer", "aside", "form", "button"],
  replacement: () => "",
});
turndown.addRule("stripEmbeds", {
  filter: (node) => {
    const tag = node.nodeName.toUpperCase();
    return (
      tag === "IFRAME" ||
      tag === "VIDEO" ||
      tag === "AUDIO" ||
      tag === "CANVAS" ||
      tag === "SVG"
    );
  },
  replacement: () => "",
});

function parseFromHtml(html: string): string {
  return turndown.turndown(html).trim();
}

function extractTitleFromMarkdown(content: string): string | undefined {
  for (const line of content.split("\n")) {
    if (!line.startsWith("#")) continue;
    const title = line.replace(/^#+\s*/, "").trim();
    if (title) return title;
  }
  return undefined;
}

function formatFetchedMarkdown(url: string, title: string | undefined, content: string): string {
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

/**
 * Resolve URL source content with a fetch-first strategy.
 * - Reserved social/video hosts use Supadata.
 * - Everything else uses direct HTTPS fetch + extraction.
 */
export async function resolveUrlContent(normalizedUrl: string): Promise<UrlContentResolved> {
  const parsed = new URL(normalizedUrl);
  if (isSupadataReservedHostname(parsed.hostname)) {
    const resolved = await resolveUrlContentWithSupadata(normalizedUrl);
    const sourceAdapter = resolveSupadataSourceAdapter(parsed.hostname);
    if (!sourceAdapter) {
      throw new Error("Unsupported Supadata source host.");
    }
    return { strategy: "supadata", sourceAdapter, markdown: resolved.markdown };
  }

  const { html, url: finalUrl } = await fetchArticleHtml(normalizedUrl);
  const content = parseFromHtml(html);
  if (!content) {
    throw new Error("Could not extract readable text from this URL.");
  }
  const title = extractTitleFromMarkdown(content);

  return {
    strategy: "fetch",
    sourceAdapter: "html",
    markdown: formatFetchedMarkdown(finalUrl, title, content),
  };
}
