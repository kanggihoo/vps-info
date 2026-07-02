from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator


SourceMethod = Literal["official_api", "official_rss", "unofficial_rss"]


class NewsItem(BaseModel):
    source: str
    source_method: SourceMethod
    external_id: str | None = None
    title: str
    url: str
    author: str | None = None
    published_at: datetime | None = None
    score: int | None = None
    comments_count: int | None = None
    tags: list[str] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)

    @field_validator("source", "title")
    @classmethod
    def require_non_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value

    @field_validator("url")
    @classmethod
    def require_http_url(cls, value: str) -> str:
        value = value.strip()
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("must be an http(s) URL")
        return value
