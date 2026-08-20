"""RSS 및 Atom 피드 수집 및 정규화 모듈."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from time import struct_time
from typing import Any

import feedparser
import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt

from signal_archive.schemas import ArchiveItem, FetchResult, SourceMethod
from signal_archive.sources._http_retry import RetryableHttpStatus, raise_for_retryable_status, retry_wait


TIMEOUT_SECONDS = 15


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError, RetryableHttpStatus)),
    stop=stop_after_attempt(3),
    wait=retry_wait,
    reraise=True,
)
def _get(url: str) -> httpx.Response:
    response = httpx.get(url, timeout=TIMEOUT_SECONDS)
    raise_for_retryable_status(response)
    return response


def _published(entry: Any) -> datetime | None:
    """피드 엔트리에서 발행/수정 일시를 추출하여 UTC datetime 객체로 변환합니다."""
    value: struct_time | None = getattr(entry, "published_parsed", None) or getattr(
        entry, "updated_parsed", None
    )
    if value is None:
        return None
    return datetime(*value[:6], tzinfo=timezone.utc)


def _tags(entry: Any) -> list[str]:
    """피드 엔트리에서 태그 문자열 목록을 추출합니다."""
    return [
        tag.get("term")
        for tag in getattr(entry, "tags", [])
        if isinstance(tag, dict) and tag.get("term")
    ]


def fetch_feed(
    *,
    source: str,
    source_method: SourceMethod,
    url: str,
    limit: int,
) -> FetchResult:
    """RSS/Atom 피드를 요청 및 파싱하여 표준 ArchiveItem 목록으로 변환합니다.

    Args:
        source: 데이터 출처 Source 식별자.
        source_method: 수집 방식 식별자 ('official_rss' 등).
        url: 피드 XML 엔드포인트 URL.
        limit: 변환할 최대 아이템 수.

    Returns:
        정규화된 ArchiveItem 목록과 재시도·건너뜀 집계를 담은 FetchResult.

    Raises:
        httpx.HTTPError: 네트워크 요청 실패 시.
        ValueError: XML 파싱에 실패한 경우.
    """
    response = _get(url)
    retry_count = _get.statistics.get("attempt_number", 1) - 1
    parsed = feedparser.parse(response.content)
    if parsed.bozo and not parsed.entries:
        raise ValueError(f"failed to parse feed: {url}")

    items: list[ArchiveItem] = []
    skipped = 0
    for entry in parsed.entries[:limit]:
        link = entry.get("link")
        title = entry.get("title")
        if not link or not title:
            skipped += 1
            continue
        external_id = entry.get("id") or entry.get("guid") or link
        items.append(
            ArchiveItem(
                source=source,
                source_method=source_method,
                external_id=str(external_id),
                title=str(title),
                url=str(link),
                author=entry.get("author"),
                published_at=_published(entry),
                tags=_tags(entry),
                raw={
                    "id": entry.get("id"),
                    "guid": entry.get("guid"),
                    "link": link,
                    "title": title,
                },
            )
        )
    return FetchResult(items=items, skipped=skipped, retry_count=retry_count)


def fetch_feed_raw(*, url: str, limit: int) -> list[dict[str, Any]]:
    """RSS/Atom 피드를 요청하여 정규화되지 않은 원본 엔트리 딕셔너리 목록을 반환합니다.

    Args:
        url: 피드 XML 엔드포인트 URL.
        limit: 반환할 최대 엔트리 수.

    Returns:
        JSON 직렬화가 완료된 원시 엔트리 딕셔너리 목록.

    Raises:
        httpx.HTTPError: 네트워크 요청 실패 시.
        ValueError: XML 파싱에 실패한 경우.
    """
    response = _get(url)
    parsed = feedparser.parse(response.content)
    if parsed.bozo and not parsed.entries:
        raise ValueError(f"failed to parse feed: {url}")

    raw_entries: list[dict[str, Any]] = []
    for entry in parsed.entries[:limit]:
        # feedparser entry(FeedParserDict)에는 time.struct_time처럼 JSON으로
        # 직렬화할 수 없는 값이 들어 있다. 중첩 구조를 그대로 유지하면서 그런
        # 값만 문자열로 바꾸기 위해 json으로 한 번 왕복시킨다.
        raw_entries.append(json.loads(json.dumps(entry, default=str)))
    return raw_entries
