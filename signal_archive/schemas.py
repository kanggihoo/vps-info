"""Collector와 repository가 공유하는 검증된 도메인 모델."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StrictInt,
    StringConstraints,
    field_validator,
)


SourceMethod = Literal["official_api", "official_rss", "unofficial_rss"]
NonEmptyText = StringConstraints(strip_whitespace=True, min_length=1)


class ArchiveItem(BaseModel):
    """입력 검증을 마치고 저장 전 단계에 있는 Source item."""

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
    tags: list[str] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)

    @field_validator("published_at")
    @classmethod
    def normalize_datetime(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class FetchResult(BaseModel):
    """Job 한 번의 fetch 결과. archive item과 재시도·skip 계측값을 함께 담는다."""

    model_config = ConfigDict(extra="forbid")

    items: list[ArchiveItem] = Field(default_factory=list)
    skipped: int = 0
    retry_count: int = 0
