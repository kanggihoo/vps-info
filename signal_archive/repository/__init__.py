"""PostgreSQL 영속화 경계."""

from __future__ import annotations

from signal_archive.repository.items import (
    ItemRepository,
    make_dedup_key,
    normalize_url,
)
from signal_archive.repository.job_runs import JobRunRepository
from signal_archive.repository.records import (
    ItemRecord,
    JobRunRecord,
    RunCounts,
    RunError,
    RunStatus,
    UpsertResult,
)


__all__ = [
    "ItemRecord",
    "ItemRepository",
    "JobRunRecord",
    "JobRunRepository",
    "RunCounts",
    "RunError",
    "RunStatus",
    "UpsertResult",
    "make_dedup_key",
    "normalize_url",
]
