"""지원하는 Source 레지스트리."""

from __future__ import annotations

from typing import Any

from signal_archive.sources import hackernews
from signal_archive.sources.feed import fetch_feed, fetch_feed_raw


Source = dict[str, Any]


def _rss_source(name: str, method: str, target: str) -> Source:
    """표준 RSS Source 구성 딕셔너리를 생성합니다.

    Args:
        name: Source 식별자 이름.
        method: 수집 방식 식별자 (예: 'official_rss', 'unofficial_rss').
        target: RSS 피드 URL.

    Returns:
        Source 구성 정보가 담긴 Source 딕셔너리.
    """
    return {
        "name": name,
        "method": method,
        "target": target,
        "fetch": fetch_feed,
        "fetch_raw": lambda limit, feed=None: fetch_feed_raw(url=target, limit=limit),
    }


SOURCES: dict[str, Source] = {
    "geeknews": _rss_source("geeknews", "official_rss", "https://news.hada.io/rss/news"),
    "producthunt": _rss_source("producthunt", "official_rss", "https://www.producthunt.com/feed"),
    "indiehackers": _rss_source(
        "indiehackers",
        "unofficial_rss",
        "https://feed.indiehackers.world/posts.rss",
    ),
    hackernews.NAME: {
        "name": hackernews.NAME,
        "method": hackernews.METHOD,
        "target": hackernews.STORY_ENDPOINTS[hackernews.DEFAULT_FEED],
        "fetch": hackernews.fetch,
        "fetch_raw": hackernews.fetch_raw,
    },
}


def collection_jobs() -> list[str]:
    return ["geeknews", "producthunt", "indiehackers", "hackernews:best"]


def get_source(name: str) -> Source:
    """Source 이름으로 등록된 Source 구성을 조회합니다.

    Args:
        name: 조회할 Source 식별자 이름.

    Returns:
        해당 Source의 Source 딕셔너리.

    Raises:
        ValueError: 등록되지 않은 Source 이름일 경우.
    """
    try:
        return SOURCES[name]
    except KeyError as exc:
        raise ValueError(f"unknown source: {name}") from exc
