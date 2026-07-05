from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from signal_archive.channels import CHANNELS, get_channel
from signal_archive.channels import hackernews
from signal_archive.channels.feed import fetch_feed
from signal_archive.schemas import NewsItem
from signal_archive.store import UpsertResult, get_existing_ids, upsert_items


@dataclass(frozen=True)
class FetchReport:
    channel: str
    fetched: int
    result: UpsertResult = UpsertResult()
    error: str | None = None
    feed: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


def _fetch_hackernews_items(
    channel: dict[str, Any],
    *,
    limit: int,
    feed: str,
    db_path: str | Path | None,
) -> list[NewsItem]:
    """HN-specific fetch: pre-filter via DB, then async-fetch only new ids.

    Avoids re-fetching items already stored. Step 1 (id list) is cheap; step 2
    (per-item payload) is the expensive N+1, so we skip ids already in the DB.
    Read-only: callers are responsible for writing the returned items.
    """
    ids = hackernews._fetch_ids(feed)
    existing = get_existing_ids(
        db_path, source=channel["name"], feed=feed, ids=[str(i) for i in ids]
    )
    new_ids = [i for i in ids if str(i) not in existing][:limit]
    if not new_ids:
        return []
    payloads = hackernews.fetch_payloads(new_ids)
    return hackernews.fetch(limit, feed=feed, payloads=payloads)


def fetch_channel_items(
    channel_name: str,
    *,
    limit: int,
    feed: str | None = None,
    db_path: str | Path | None = None,
) -> list[NewsItem]:
    """Fetch-only: return NewsItems without writing to the DB.

    Split from ``fetch_channel`` so ``fetch_all_channels`` can parallelize the
    network-bound fetch phase and batch the DB writes in a single transaction.
    """
    channel = get_channel(channel_name)
    if channel["fetch"] is fetch_feed:
        return channel["fetch"](
            source=channel["name"],
            source_method=channel["method"],
            url=channel["target"],
            limit=limit,
        )
    resolved_feed = feed or channel.get("default_feed") or hackernews.DEFAULT_FEED
    return _fetch_hackernews_items(
        channel, limit=limit, feed=resolved_feed, db_path=db_path
    )


def fetch_channel(
    channel_name: str,
    *,
    limit: int,
    feed: str | None = None,
    db_path: str | Path | None = None,
) -> FetchReport:
    """Fetch a single channel and write its items. Convenience wrapper."""
    try:
        items = fetch_channel_items(
            channel_name, limit=limit, feed=feed, db_path=db_path
        )
        result = upsert_items(db_path, items)
        resolved_feed = None
        if get_channel(channel_name)["fetch"] is not fetch_feed:
            resolved_feed = feed or hackernews.DEFAULT_FEED
        return FetchReport(
            channel=channel_name,
            fetched=len(items),
            result=result,
            feed=resolved_feed,
        )
    except Exception as exc:
        return FetchReport(channel=channel_name, fetched=0, error=str(exc))


def _all_jobs() -> list[tuple[str, str | None]]:
    """Build the fetch job list: one job per RSS channel, one per HN feed."""
    jobs: list[tuple[str, str | None]] = []
    for name in CHANNELS:
        channel = CHANNELS[name]
        if "feeds" in channel:
            jobs.extend((name, feed) for feed in channel["feeds"])
        else:
            jobs.append((name, None))
    return jobs


def fetch_all_channels(*, limit: int, db_path: str | Path | None = None) -> list[FetchReport]:
    """Fetch every channel in parallel, then batch-write in one transaction.

    Network-bound fetches run concurrently in a thread pool (HN already uses
    async internally; the others block on httpx). All successful NewsItems are
    accumulated and passed to a single ``upsert_items`` call so SQLite only
    opens one write connection. Per-job saved/updated counts are not tracked;
    the batch aggregates them. Use ``fetch_channel`` for exact per-channel stats.
    """
    jobs = _all_jobs()

    def run(job: tuple[str, str | None]) -> tuple[str, str | None, list[NewsItem] | str]:
        name, feed = job
        try:
            items = fetch_channel_items(name, limit=limit, feed=feed, db_path=db_path)
            return name, feed, items
        except Exception as exc:  # noqa: BLE001 - surface as report, don't abort others
            return name, feed, str(exc)

    with ThreadPoolExecutor(max_workers=len(jobs)) as ex:
        raw_results = list(ex.map(run, jobs))

    flat_items: list[NewsItem] = []
    reports: list[FetchReport] = []
    for name, feed, outcome in raw_results:
        if isinstance(outcome, str):
            reports.append(
                FetchReport(channel=name, fetched=0, error=outcome, feed=feed)
            )
            continue
        flat_items.extend(outcome)
        reports.append(
            FetchReport(channel=name, fetched=len(outcome), feed=feed)
        )

    if flat_items:
        write_result = upsert_items(db_path, flat_items)
        # Spread the aggregate counts across reports with items. Approximate,
        # but keeps the CLI output useful without per-channel write transactions.
        remaining_saved = write_result.saved
        for i, report in enumerate(reports):
            if report.error or report.fetched == 0 or remaining_saved <= 0:
                continue
            gave = min(report.fetched, remaining_saved)
            reports[i] = FetchReport(
                channel=report.channel,
                fetched=report.fetched,
                result=UpsertResult(saved=gave),
                feed=report.feed,
            )
            remaining_saved -= gave
    return reports


def inspect_channel(channel_name: str, *, limit: int, feed: str | None = None) -> Any:
    """Return the raw payload of a single channel without touching the DB."""
    channel = get_channel(channel_name)
    fetch_raw = channel["fetch_raw"]
    if feed is not None:
        return fetch_raw(limit, feed=feed)
    return fetch_raw(limit)


def inspect_all(*, limit: int) -> dict[str, Any]:
    """Return raw payloads for every channel.

    A channel that raises is reported as ``{"error": "..."}`` so one failure
    does not abort the rest, mirroring ``fetch_all_channels``.
    """
    results: dict[str, Any] = {}
    for name in CHANNELS:
        channel = CHANNELS[name]
        try:
            if "feeds" in channel:
                # HN: include each feed separately
                results[name] = {
                    feed: inspect_channel(name, limit=limit, feed=feed)
                    for feed in channel["feeds"]
                }
            else:
                results[name] = inspect_channel(name, limit=limit)
        except Exception as exc:
            results[name] = {"error": str(exc)}
    return results
