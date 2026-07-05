from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse


SourceMethod = Literal["official_api", "official_rss", "unofficial_rss"]


@dataclass
class NewsItem:
    source: str
    source_method: SourceMethod
    title: str
    url: str
    external_id: str | None = None
    author: str | None = None
    published_at: datetime | None = None
    score: int | None = None
    comments_count: int | None = None
    tags: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)
    feed: str | None = None

    def __post_init__(self) -> None:
        self.source = self.source.strip()
        self.title = self.title.strip()
        self.url = self.url.strip()
        if not self.source or not self.title:
            raise ValueError("must not be empty")
        parsed = urlparse(self.url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("url must be an http(s) URL")
