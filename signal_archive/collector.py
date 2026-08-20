"""One-shot collector that records parent and Job-level execution history."""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence

import psycopg

from signal_archive.config import DatabaseSettings
from signal_archive.core import fetch_job_items
from signal_archive.db import connect
from signal_archive.repository import ItemRepository, JobRunRepository, RunCounts, RunError
from signal_archive.schemas import FetchResult
from signal_archive.sources import collection_jobs


logger = logging.getLogger(__name__)
Fetch = Callable[..., FetchResult]


def collect_once(
    items: ItemRepository,
    runs: JobRunRepository,
    *,
    limit: int,
    jobs: Sequence[str] | None = None,
    fetch: Fetch = fetch_job_items,
    triggered_by: str = "manual",
) -> int:
    jobs = list(jobs or collection_jobs())
    parent_id = runs.start_run("batch-run", triggered_by, None)
    totals = RunCounts()
    succeeded = failed = 0
    database_failed = False
    for job in jobs:
        child_id = runs.start_run(job, triggered_by, parent_id)
        try:
            fetched = fetch(job, limit=limit)
            result = items.upsert_items(fetched.items)
            counts = RunCounts(
                fetched=len(fetched.items),
                inserted=result.saved,
                updated=result.updated,
                skipped=fetched.skipped,
                retry_count=fetched.retry_count,
            )
            runs.finish_run(child_id, "SUCCESS", counts, None)
            totals.fetched += counts.fetched
            totals.inserted += counts.inserted
            totals.updated += counts.updated
            totals.skipped += counts.skipped
            totals.retry_count += counts.retry_count
            succeeded += 1
        except Exception as exc:  # job isolation is the collector contract
            database_failed = isinstance(exc, psycopg.Error)
            runs.finish_run(
                child_id,
                "FAILED",
                RunCounts(),
                RunError(error_type=type(exc).__name__, error_message=str(exc)),
            )
            failed += 1
            if database_failed:
                break
    status = "SUCCESS" if failed == 0 else "FAILED" if database_failed or succeeded == 0 else "PARTIAL"
    runs.finish_run(parent_id, status, totals, None)
    return 0 if status == "SUCCESS" else 1


def run_collector(limit: int, triggered_by: str = "manual") -> int:
    settings = DatabaseSettings()
    with connect(settings) as connection:
        acquired = connection.execute(
            "SELECT pg_try_advisory_lock(hashtext(%s)) AS acquired", ("signal_archive:collector",)
        ).fetchone()["acquired"]
        if not acquired:
            logger.info("collector already running; skipping")
            return 0
        try:
            return collect_once(
                ItemRepository(connection), JobRunRepository(connection), limit=limit, triggered_by=triggered_by
            )
        finally:
            connection.execute("SELECT pg_advisory_unlock(hashtext(%s))", ("signal_archive:collector",))
