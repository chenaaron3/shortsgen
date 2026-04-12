from __future__ import annotations

import re

from html_to_markdown import ConversionOptions, convert_with_visitor


class _NoLinksVisitor:
    """Keep link text but remove URL targets."""

    def visit_link(self, ctx, href, text, title):  # noqa: D401
        return {"type": "custom", "output": text or ""}


class FsHtmlMarkdownParser:
    """Parse fs.blog article HTML into cleaned markdown text."""

    def parse_from_html(self, source_url: str, html: str) -> str:
        md = convert_with_visitor(
            html,
            visitor=_NoLinksVisitor(),
            options=ConversionOptions(heading_style="atx"),
        )
        md = self._strip_frontmatter(md)
        md = self._strip_inline_svg_images(md)
        md = self._strip_share_buttons(md)
        return self._clean_markdown(md)

    @staticmethod
    def _strip_frontmatter(md: str) -> str:
        if md.startswith("---\n"):
            idx = md.find("\n---", 4)
            if idx != -1:
                return md[idx + 4 :].lstrip()
        return md

    @staticmethod
    def _strip_inline_svg_images(md: str) -> str:
        return re.sub(r"!\[[^\]]*\]\(data:image/svg[^)]*\)", "", md)

    @staticmethod
    def _strip_share_buttons(md: str) -> str:
        return re.sub(r"(?:Tweet|Email|LinkedIn|Print){2,}", "", md, flags=re.IGNORECASE)

    @staticmethod
    def _normalize_whitespace(text: str) -> str:
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    @classmethod
    def _clean_markdown(cls, md: str) -> str:
        blacklist = (
            "Skip to main content",
            "Skip to header right navigation",
            "Skip to site footer",
            "Search siteSubmit search",
            "As seen on:",
            "All Rights Reserved",
            "Proudly powered by WordPress",
            "Become a Farnam Street Member",
            "Order Now",
            "Learn more",
        )
        cleaned_lines: list[str] = []
        for raw in md.splitlines():
            line = raw.strip()
            if not line:
                cleaned_lines.append("")
                continue
            if any(token in line for token in blacklist):
                continue
            if line.startswith("![]("):
                continue
            if re.fullmatch(r"[*#>\- ]+", line):
                continue
            cleaned_lines.append(line)
        return cls._normalize_whitespace("\n".join(cleaned_lines))
