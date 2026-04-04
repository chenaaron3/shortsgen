"""SSRF-safe URL checks (aligned with apps/web server ingest urlMetadata)."""

from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlparse

BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata",
    }
)


def _is_blocked_hostname(hostname: str) -> bool:
    h = hostname.lower()
    if h in BLOCKED_HOSTNAMES:
        return True
    if h.endswith(".local") or h.endswith(".localhost") or h.endswith(".internal"):
        return True

    # Try parse as IP
    try:
        ip = ipaddress.ip_address(h)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return True
        if ip.version == 6:
            s = h.lower()
            if s == "::1" or s.startswith("fe80:") or s.startswith("fc") or s.startswith("fd"):
                return True
    except ValueError:
        pass

    # IPv4 dotted quad without using ipaddress (e.g. "10.0.0.1" as hostname string)
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", h):
        parts = [int(x) for x in h.split(".")]
        if len(parts) == 4:
            a, b = parts[0], parts[1]
            if a == 10:
                return True
            if a == 127:
                return True
            if a == 0:
                return True
            if a == 169 and b == 254:
                return True
            if a == 172 and 16 <= b <= 31:
                return True
            if a == 192 and b == 168:
                return True
            if a == 100 and 64 <= b <= 127:
                return True
    return False


def assert_url_safe_for_ingest(href: str) -> str:
    """Return normalized URL string or raise ValueError."""
    href = href.strip()
    try:
        u = urlparse(href)
    except Exception as exc:
        raise ValueError("Invalid URL.") from exc
    if u.scheme != "https":
        raise ValueError("Only https:// links are supported.")
    host = u.hostname
    if not host:
        raise ValueError("Invalid URL.")
    if _is_blocked_hostname(host):
        raise ValueError("This URL cannot be fetched.")
    if "." not in host:
        raise ValueError("Invalid URL.")
    return href


def is_single_line_https_url(input_text: str) -> bool:
    t = input_text.strip()
    if not t or "\n" in t or re.search(r"\s", t):
        return False
    try:
        u = urlparse(t)
        return u.scheme == "https" and bool(u.netloc)
    except Exception:
        return False
