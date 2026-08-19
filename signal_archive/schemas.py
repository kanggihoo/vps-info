"""Validated domain models shared by collectors and repositories."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, HttpUrl, StrictInt, StringConstraints, field_validator


SourceMethod = Literal["official_api", "official_rss", "unofficial_rss"]
NonEmptyText = StringConstraints(strip_whitespace=True, min_length=1)


class NewsItem(BaseModel):
    """A channel item after input validation and before persistence."""

    model_config = ConfigDict(extra="forbid")

    source: Annotated[str, NonEmptyText]
    source_method: SourceMethod
    title: Annotated[str, NonEmptyText]
    url: HttpUrl
    external_id: str | None = None
    summary: str | None = None
    source_item_url: HttpUrl | None = None
    author: str | None = None
    published_at: datetime | None = None
    score: StrictInt | None = None
    comments_count: StrictInt | None = None
    rank: StrictInt | None = None
    item_type: str | None = None
    tags: list[str] = []
    raw: dict[str, Any] = {}
    @field_validator("published_at")
    @classmethod
    def normalize_datetime(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
