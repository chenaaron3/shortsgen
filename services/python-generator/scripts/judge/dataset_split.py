from __future__ import annotations

import hashlib
import random
import re
from dataclasses import dataclass
from pathlib import Path

from fs_source import GetLinks, ParseLink


@dataclass
class SourceUnit:
    unit_id: str
    source: str
    text: str
    word_count: int


def _slug(s: str) -> str:
    out = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return out or "source"


def _normalize_whitespace(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _clean_local_text(text: str) -> str:
    return _normalize_whitespace(text)


def _is_clean_unit_text(text: str) -> bool:
    lowered = text.lower()
    noisy_tokens = (
        "data:image/svg+xml",
        "tweetemaillinkedinprint",
        "©",
        "all rights reserved",
    )
    if any(token in lowered for token in noisy_tokens):
        return False
    if text.count("![") >= 2:
        return False
    return True


def _single_unit_from_source(source_name: str, text: str, min_words: int, max_words: int) -> SourceUnit | None:
    words = text.split()
    if len(words) < min_words:
        return None
    if len(words) > max_words:
        text = " ".join(words[:max_words])
        words = text.split()
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:10]
    return SourceUnit(
        unit_id=f"{_slug(source_name)}-{digest}",
        source=source_name,
        text=text,
        word_count=len(words),
    )


def build_dataset(
    *,
    target_count: int,
    min_words: int,
    max_words: int,
    seed_file: Path,
    seed_urls: list[str],
    fs_topup_limit: int,
    rng_seed: int,
    link_source: GetLinks,
    parser: ParseLink,
) -> list[SourceUnit]:
    """Build one-entry-per-source dataset from seed and top-up urls."""
    units_by_source: dict[str, SourceUnit] = {}
    used_urls: set[str] = set(seed_urls)

    for url in seed_urls:
        html = link_source.fetch_html(url)
        text = parser.parse_from_html(url, html)
        unit = _single_unit_from_source(url, text, min_words=min_words, max_words=max_words)
        if unit and _is_clean_unit_text(unit.text):
            units_by_source[url] = unit

    seed_file_key = str(seed_file)
    local_text = _clean_local_text(seed_file.read_text(encoding="utf-8"))
    file_unit = _single_unit_from_source(
        seed_file_key,
        local_text,
        min_words=min_words,
        max_words=max_words,
    )
    if file_unit and _is_clean_unit_text(file_unit.text):
        units_by_source[seed_file_key] = file_unit

    units = list(units_by_source.values())
    if len(units) < target_count:
        extra_urls = link_source.discover_article_urls(
            max(fs_topup_limit, target_count * 4),
            exclude=used_urls,
            discovery_pages=seed_urls,
        )
        for url in extra_urls:
            used_urls.add(url)
            try:
                html = link_source.fetch_html(url)
                text = parser.parse_from_html(url, html)
            except Exception:
                continue
            unit = _single_unit_from_source(url, text, min_words=min_words, max_words=max_words)
            if unit and _is_clean_unit_text(unit.text):
                units_by_source[url] = unit
            units = list(units_by_source.values())
            if len(units) >= target_count:
                break

    if len(units) < target_count:
        raise RuntimeError(
            f"Only found {len(units)} valid units (need {target_count}). "
            "Add more seed sources or lower target_count."
        )

    rnd = random.Random(rng_seed)
    rnd.shuffle(units)
    selected = units[:target_count]
    if any("wp-json" in unit.source for unit in selected):
        raise RuntimeError("Dataset curation failed: wp-json sources leaked into selected units.")
    if len({unit.source for unit in selected}) != len(selected):
        raise RuntimeError("Dataset curation failed: duplicate source entries found.")
    return selected


def split_dataset(
    units: list[SourceUnit],
    train_count: int,
    val_count: int,
    test_count: int,
) -> dict[str, list[SourceUnit]]:
    if len(units) < train_count + val_count + test_count:
        raise ValueError("Dataset too small for requested split")
    train = units[:train_count]
    val = units[train_count : train_count + val_count]
    test = units[train_count + val_count : train_count + val_count + test_count]
    return {"train": train, "val": val, "test": test}
