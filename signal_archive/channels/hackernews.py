"""Firebase API를 활용한 Hacker News 데이터 수집 모듈."""

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
    """피드 종류에 대응하는 Firebase API 엔드포인트 URL을 반환합니다."""
    try:
        return STORY_ENDPOINTS[feed]
    except KeyError as exc:
        raise ValueError(
            f"unknown feed: {feed} (choose from {sorted(STORY_ENDPOINTS)})"
        ) from exc


def _hn_url(item_id: int) -> str:
    """Hacker News 아이템의 공식 웹 상세 페이지 URL을 생성합니다."""
    return f"https://news.ycombinator.com/item?id={item_id}"


def _normalize(payload: dict[str, Any], feed: str) -> NewsItem | None:
    """Hacker News API 원시 페이로드를 NewsItem 객체로 변환합니다."""
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
    """동시 요청 수를 Semaphore로 제한하며 아이템 페이로드를 비동기 조회합니다."""
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
    """Hacker News 피드의 아이템들을 수집하여 NewsItem 목록으로 반환합니다.

    Args:
        limit: 반환할 최대 아이템 수.
        feed: 수집할 피드 종류 ('best', 'show', 기본값: 'best').
        payloads: 이미 수집된 원시 페이로드 목록 (선택 사항).

    Returns:
        정규화된 NewsItem 객체 목록.
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
    """지정된 피드의 아이템 ID 목록을 동기 HTTP 요청으로 가져옵니다."""
    with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
        response = client.get(_feed_url(feed))
        response.raise_for_status()
        return [int(i) for i in response.json()]


async def _fetch_payloads_async(ids: list[int]) -> list[dict[str, Any]]:
    """주어진 ID 목록의 세부 페이로드를 비동기 병렬로 가져옵니다."""
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        return await _fetch_item_payloads(client, ids)


def fetch_payloads(ids: list[int]) -> list[dict[str, Any]]:
    """주어진 ID 목록에 대한 원시 페이로드를 병렬 수집하여 반환합니다.

    Args:
        ids: 조회할 Hacker News 아이템 ID 목록.

    Returns:
        각 아이템의 원시 API 페이로드 딕셔너리 목록.
    """
    return asyncio.run(_fetch_payloads_async(ids))


def fetch_raw(limit: int, *, feed: str = DEFAULT_FEED) -> list[dict[str, Any]]:
    """Hacker News 피드의 상위 아이템들에 대한 원시 API 페이로드를 수집합니다.

    Args:
        limit: 수집할 최대 아이템 수.
        feed: 피드 종류 ('best', 'show', 기본값: 'best').

    Returns:
        원시 API 페이로드 딕셔너리 목록.
    """
    ids = _fetch_ids(feed)[:limit]
    return fetch_payloads(ids)
