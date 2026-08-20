"""Repository가 반환하는 row 형태의 모델."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


def _camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.title() for part in tail)


RunStatus = Literal["RUNNING", "SUCCESS", "PARTIAL", "FAILED"]


class UpsertResult(BaseModel):
    saved: int = 0
    updated: int = 0


class RunCounts(BaseModel):
    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    skipped: int = 0
    retry_count: int = 0


class RunError(BaseModel):
    error_type: str
    error_message: str


class ItemRecord(BaseModel):
    """저장된 archive item 한 건."""

    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True)

    id: int
    source: str
    source_method: str
    external_id: str | None = None
    title: str
    summary: str | None = None
    url: HttpUrl
    source_item_url: HttpUrl | None = None
    author: str | None = None
    published_at: datetime | None = None
    score: int | None = None
    comments_count: int | None = None
    rank: int | None = None
    item_type: str | None = None
    tags: list[str] = Field(default_factory=list)
    raw: dict = Field(default_factory=dict)
    first_seen_at: datetime
    last_seen_at: datetime


class JobRunRecord(BaseModel):
    """Job 실행 한 건. `children`은 parent run 상세 조회에서만 채운다."""

    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True)

    id: int
    parent_run_id: int | None = None
    job_key: str
    triggered_by: str
    started_at: datetime
    finished_at: datetime | None = None
    status: RunStatus
    fetched_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    retry_count: int = 0
    error_type: str | None = None
    error_message: str | None = None
    children: list["JobRunRecord"] = Field(default_factory=list)
