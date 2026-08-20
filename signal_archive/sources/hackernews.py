"""Firebase API를 활용한 Hacker News 데이터 수집 모듈."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx
from tenacity import AsyncRetrying, retry, retry_if_exception_type, stop_after_attempt

from signal_archive.schemas import ArchiveItem, FetchResult
from signal_archive.sources._http_retry import (
    RetryableHttpStatus,
    RetryCounter,
    raise_for_retryable_status,
    retry_wait,
)


NAME = "hackernews"
METHOD = "official_api"
BASE = "https://hacker-news.firebaseio.com/v0"
TIMEOUT_SECONDS = 15
# API에 과도한 부하를 주지 않도록 동시 item fetch 수를 제한한다. HN API에는
# 명시된 rate limit이 없지만, 동시성을 제한하면 지연 시간이 예측 가능해진다.
MAX_CONCURRENCY = 20

STORY_ENDPOINTS: dict[str, str] = {"best": f"{BASE}/beststories.json"}
DEFAULT_FEED = "best"
ITEM_URL = f"{BASE}/item/{{item_id}}.json"

_RETRYABLE_EXCEPTIONS = (httpx.TimeoutException, httpx.ConnectError, RetryableHttpStatus)


def _hn_url(item_id: int) -> str:
    """Hacker News 아이템의 공식 웹 상세 페이지 URL을 생성합니다."""
    return f"https://news.ycombinator.com/item?id={item_id}"


def _normalize(payload: dict[str, Any], rank: int) -> ArchiveItem | None:
    """Hacker News API 원시 페이로드를 ArchiveItem 객체로 변환합니다."""
    item_id = payload.get("id")
    title = payload.get("title")
    if item_id is None or not title or payload.get("dead") or payload.get("deleted"):
        return None

    timestamp = payload.get("time")
    published_at = None
    if isinstance(timestamp, int):
        published_at = datetime.fromtimestamp(timestamp, tz=timezone.utc)

    return ArchiveItem(
        source=NAME,
        source_method=METHOD,
        external_id=str(item_id),
        title=str(title),
        url=str(payload.get("url") or _hn_url(int(item_id))),
        source_item_url=_hn_url(int(item_id)),
        author=payload.get("by"),
        published_at=published_at,
        score=payload.get("score"),
        comments_count=payload.get("descendants"),
        rank=rank,
        item_type=payload.get("type"),
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
    counter: RetryCounter,
) -> list[dict[str, Any]]:
    """동시 요청 수를 Semaphore로 제한하며 아이템 페이로드를 비동기 조회합니다."""
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def fetch_one(item_id: int) -> dict[str, Any]:
        async def attempt() -> dict[str, Any]:
            async with semaphore:
                response = await client.get(f"{BASE}/item/{item_id}.json")
                raise_for_retryable_status(response)
                return response.json() or {}

        retrying = AsyncRetrying(
            retry=retry_if_exception_type(_RETRYABLE_EXCEPTIONS),
            stop=stop_after_attempt(3),
            wait=retry_wait,
            reraise=True,
            before_sleep=counter.on_retry,
        )
        return await retrying(attempt)

    results = await asyncio.gather(*(fetch_one(i) for i in ids))
    return [r for r in results if r]


def fetch(
    limit: int, *, payloads: list[dict[str, Any]] | None = None, ranks: list[int] | None = None
) -> FetchResult:
    """Hacker News 피드의 아이템들을 수집하여 ArchiveItem 목록으로 반환합니다.

    Args:
        limit: 반환할 최대 아이템 수.
        payloads: 이미 수집된 원시 페이로드 목록 (선택 사항).
        ranks: payloads와 짝지어질 순위 목록 (선택 사항).

    Returns:
        정규화된 ArchiveItem 목록과 재시도·건너뜀 집계를 담은 FetchResult.
    """
    retry_count = 0
    if payloads is None:
        ids = _fetch_ids()
        retry_count += _fetch_ids.statistics.get("attempt_number", 1) - 1
        payloads, payload_retry_count = fetch_payloads(ids)
        retry_count += payload_retry_count
    ranks = ranks or list(range(1, len(payloads) + 1))

    items: list[ArchiveItem] = []
    skipped = 0
    for payload, rank in zip(payloads, ranks, strict=False):
        item = _normalize(payload, rank)
        if item is None:
            skipped += 1
            continue
        items.append(item)
        if len(items) >= limit:
            break
    return FetchResult(items=items, skipped=skipped, retry_count=retry_count)


@retry(
    retry=retry_if_exception_type(_RETRYABLE_EXCEPTIONS),
    stop=stop_after_attempt(3),
    wait=retry_wait,
    reraise=True,
)
def _fetch_ids() -> list[int]:
    """HN best 목록을 동기 HTTP 요청으로 가져옵니다."""
    with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
        response = client.get(STORY_ENDPOINTS[DEFAULT_FEED])
        raise_for_retryable_status(response)
        return [int(i) for i in response.json()]


async def _fetch_payloads_async(ids: list[int], counter: RetryCounter) -> list[dict[str, Any]]:
    """주어진 ID 목록의 세부 페이로드를 비동기 병렬로 가져옵니다."""
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        return await _fetch_item_payloads(client, ids, counter)


def fetch_payloads(ids: list[int]) -> tuple[list[dict[str, Any]], int]:
    """주어진 ID 목록에 대한 원시 페이로드를 병렬 수집하여 반환합니다.

    Args:
        ids: 조회할 Hacker News 아이템 ID 목록.

    Returns:
        각 아이템의 원시 API 페이로드 딕셔너리 목록과 재시도 횟수.
    """
    counter = RetryCounter()
    payloads = asyncio.run(_fetch_payloads_async(ids, counter))
    return payloads, counter.count


def fetch_raw(limit: int) -> list[dict[str, Any]]:
    """Hacker News 피드의 상위 아이템들에 대한 원시 API 페이로드를 수집합니다.

    Args:
        limit: 수집할 최대 아이템 수.

    Returns:
        원시 API 페이로드 딕셔너리 목록.
    """
    ids = _fetch_ids()[:limit]
    payloads, _ = fetch_payloads(ids)
    return payloads
