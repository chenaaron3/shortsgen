/** Client-safe label for runs.user_input on URL creates (matches preview metadata shape). */
export type UrlPreviewFields = {
  hostname: string;
  siteName?: string;
  pageTitle?: string;
};

export function buildSourceLabel(
  meta: UrlPreviewFields | null | undefined,
  rawUrl: string,
): string {
  const trimmed = rawUrl.trim();
  try {
    const hostname = new URL(trimmed).hostname;
    if (!meta) return hostname;
    const a = meta.siteName ?? meta.hostname;
    const b = meta.pageTitle;
    if (a && b) return `${a} — ${b}`;
    return b ?? a ?? hostname;
  } catch {
    return "Link";
  }
}
