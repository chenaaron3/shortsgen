from __future__ import annotations

from abc import ABC, abstractmethod

from ingest.models import ScrapeResult


class UrlAdapter(ABC):
    name: str

    @abstractmethod
    def can_handle(self, url: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def to_markdown(self, url: str) -> ScrapeResult:
        raise NotImplementedError
