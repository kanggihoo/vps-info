from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx

from signal_archive.schemas import NewsItem


NAME = "hackernews"
METHOD = "official_api"
BASE = "https://hacker-news.firebaseio.com/v0"
TIMEOUT_SECONDS = 15
# Cap concurrent item fetches to avoid hammering the API. The HN API has no
# documented rate limit, but bounded concurrency keeps latency predictable.
MAX_CONCURRENCY = 20

# Only "best" (high-quality mainstream) and "show" (side-project discovery)
# are collected. top/new are dropped: new is noisy, top overlaps new.
STORY_ENDPOINTS: dict[str, str] = {
    "best": f"{BASE}/beststories.json",
    "show": f"{BASE}/showstories.json",
}
DEFAULT_FEED = "best"
ITEM_URL = f"{BASE}/item/{{item_id}}.json"


def _feed_url(feed: str) -> str:
    try:
        return STORY_ENDPOINTS[feed]
    except KeyError as exc:
        raise ValueError(
            f"unknown feed: {feed} (choose from {sorted(STORY_ENDPOINTS)})"
        ) from exc


def _hn_url(item_id: int) -> str:
    return f"https://news.ycombinator.com/item?id={item_id}"


def _normalize(payload: dict[str, Any], feed: str) -> NewsItem | None:
    item_id = payload.get("id")
    title = payload.get("title")
    if item_id is None or not title or payload.get("dead") or payload.get("deleted"):
        return None

    timestamp = payload.get("time")
    published_at = None
    if isinstance(timestamp, int):
        published_at = datetime.fromtimestamp(timestamp, tz=timezone.utc)

    return NewsItem(
        source=NAME,
        source_method=METHOD,
        external_id=str(item_id),
        title=str(title),
        url=str(payload.get("url") or _hn_url(int(item_id))),
        author=payload.get("by"),
        published_at=published_at,
        score=payload.get("score"),
        comments_count=payload.get("descendants"),
        feed=feed,
        raw={
            "id": item_id,
            "type": payload.get("type"),
            "url": payload.get("url"),
            "score": payload.get("score"),
            "descendants": payload.get("descendants"),
        },
    )


async def _fetch_item_payloads(
    client: httpx.AsyncClient,
    ids: list[int],
) -> list[dict[str, Any]]:
    """Fetch item payloads concurrently, bounded by a semaphore."""
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def fetch_one(item_id: int) -> dict[str, Any]:
        async with semaphore:
            response = await client.get(f"{BASE}/item/{item_id}.json")
            response.raise_for_status()
            return response.json() or {}

    results = await asyncio.gather(*(fetch_one(i) for i in ids))
    return [r for r in results if r]


def fetch(
    limit: int,
    *,
    feed: str = DEFAULT_FEED,
    payloads: list[dict[str, Any]] | None = None,
) -> list[NewsItem]:
    """Fetch a HN feed and normalize to NewsItem.

    ``payloads`` lets the caller pass already-fetched item payloads (e.g. from
    ``fetch_raw`` after pre-filtering) to avoid double-fetching. When omitted,
    the feed list and each item are fetched here.
    """
    if payloads is None:
        ids = _fetch_ids(feed)
        payloads = asyncio.run(_fetch_payloads_async(ids))

    items: list[NewsItem] = []
    for payload in payloads:
        item = _normalize(payload, feed)
        if item is not None:
            items.append(item)
            if len(items) >= limit:
                break
    return items


def _fetch_ids(feed: str) -> list[int]:
    """Step 1: fetch the feed's id list (synchronous)."""
    with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
        response = client.get(_feed_url(feed))
        response.raise_for_status()
        return [int(i) for i in response.json()]


async def _fetch_payloads_async(ids: list[int]) -> list[dict[str, Any]]:
    """Step 2: fetch each item payload concurrently."""
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        return await _fetch_item_payloads(client, ids)


def fetch_payloads(ids: list[int]) -> list[dict[str, Any]]:
    """Concurrently fetch raw item payloads for given ids (pre-filtered)."""
    return asyncio.run(_fetch_payloads_async(ids))


def fetch_raw(limit: int, *, feed: str = DEFAULT_FEED) -> list[dict[str, Any]]:
    """Fetch a HN feed and return each item's raw API payload.

    Skips normalization. Useful for inspecting fields not stored on NewsItem.
    """
    ids = _fetch_ids(feed)[:limit]
    return fetch_payloads(ids)
