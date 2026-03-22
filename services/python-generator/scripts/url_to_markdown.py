#!/usr/bin/env python3
"""
Fetch an article URL and convert its HTML to Markdown using html-to-markdown.

Usage:
    pnpm pipeline url_to_markdown.py <url> [--output FILE]
    python scripts/run.py url_to_markdown.py <url> [-o FILE]

Examples:
    python scripts/url_to_markdown.py https://example.com/article
    python scripts/url_to_markdown.py https://example.com/article -o article.md
"""

import argparse
import re
import sys
from urllib.parse import urlparse

import requests
from html_to_markdown import ConversionOptions, convert_with_visitor


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def strip_frontmatter(md: str) -> str:
    """Remove YAML frontmatter block (--- ... ---) from the start of markdown."""
    if md.startswith("---\n"):
        idx = md.find("\n---", 4)
        if idx != -1:
            return md[idx + 4 :].lstrip()
    return md


def strip_inline_svg_images(md: str) -> str:
    """Remove ![SVG Image](data:image/svg+xml;base64,...) markdown."""
    return re.sub(r"!\[[^\]]*\]\(data:image/svg[^)]*\)", "", md)


def strip_share_buttons(md: str) -> str:
    """Remove share button labels (Tweet, Email, LinkedIn, Print) when they appear concatenated."""
    # Match 2+ of these labels in a row (e.g. TweetEmailLinkedInPrint)
    pattern = r"(?:Tweet|Email|LinkedIn|Print){2,}"
    return re.sub(pattern, "", md)


class NoLinksVisitor:
    """Visitor that replaces links with plain text (no URL)."""

    def visit_link(self, ctx, href, text, title):
        return {"type": "custom", "output": text or ""}


def fetch_html(url: str) -> str:
    """Fetch HTML from URL, raising on errors."""
    resp = requests.get(
        url,
        headers={"User-Agent": DEFAULT_USER_AGENT},
        timeout=30,
        allow_redirects=True,
    )
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fetch an article URL and convert HTML to Markdown."
    )
    parser.add_argument("url", help="Article URL to fetch and convert")
    parser.add_argument(
        "-o",
        "--output",
        metavar="FILE",
        help="Write Markdown to FILE (default: stdout)",
    )
    parser.add_argument(
        "--heading-style",
        choices=["atx", "underlined", "atx_closed"],
        default="atx",
        help="Markdown heading style (default: atx)",
    )
    args = parser.parse_args()

    url = args.url.strip()
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        print(f"Error: Invalid URL: {url}", file=sys.stderr)
        return 1

    try:
        html = fetch_html(url)
    except requests.RequestException as e:
        print(f"Error fetching URL: {e}", file=sys.stderr)
        return 1

    options = ConversionOptions(heading_style=args.heading_style)
    markdown = convert_with_visitor(html, visitor=NoLinksVisitor(), options=options)
    markdown = strip_frontmatter(markdown)
    markdown = strip_inline_svg_images(markdown)
    markdown = strip_share_buttons(markdown)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(markdown)
        print(f"Wrote {len(markdown)} chars to {args.output}", file=sys.stderr)
    else:
        print(markdown)

    return 0


if __name__ == "__main__":
    sys.exit(main())
