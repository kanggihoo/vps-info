"""Job fetch orchestration independent from storage lifecycle."""

from __future__ import annotations

from typing import Any

from signal_archive.schemas import FetchResult
from signal_archive.sources import SOURCES, get_source
from signal_archive.sources import hackernews
from signal_archive.sources.feed import fetch_feed


def fetch_job_items(job_key: str, *, limit: int) -> FetchResult:
    """Fetch one configured Job, always re-requesting HN item detail to keep it fresh."""
    name, _, *_ = job_key.partition(":")
    source = get_source(name)
    if source["fetch"] is fetch_feed:
        return fetch_feed(
            source=source["name"],
            source_method=source["method"],
            url=source["target"],
            limit=limit,
        )
    ids = hackernews._fetch_ids()
    id_retry_count = hackernews._fetch_ids.statistics.get("attempt_number", 1) - 1
    selected_ids = ids[:limit]
    payloads, payload_retry_count = hackernews.fetch_payloads(selected_ids)
    result = hackernews.fetch(limit, payloads=payloads, ranks=list(range(1, len(selected_ids) + 1)))
    result.retry_count += id_retry_count + payload_retry_count
    return result


def inspect_source(source_name: str, *, limit: int) -> Any:
    source = get_source(source_name.partition(":")[0])
    return source["fetch_raw"](limit)


def inspect_all(*, limit: int) -> dict[str, Any]:
    return {name: inspect_source(name, limit=limit) for name in SOURCES}
