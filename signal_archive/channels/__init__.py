"""지원하는 뉴스 및 피드 채널 레지스트리."""

from __future__ import annotations

from typing import Any

from signal_archive.channels import hackernews
from signal_archive.channels.feed import fetch_feed, fetch_feed_raw


Channel = dict[str, Any]


def _rss_channel(name: str, method: str, target: str) -> Channel:
    """표준 RSS 채널 구성 딕셔너리를 생성합니다.

    Args:
        name: 채널 식별자 이름.
        method: 수집 방식 식별자 (예: 'official_rss', 'unofficial_rss').
        target: RSS 피드 URL.

    Returns:
        채널 구성 정보가 담긴 Channel 딕셔너리.
    """
    return {
        "name": name,
        "method": method,
        "target": target,
        "fetch": fetch_feed,
        "fetch_raw": lambda limit, feed=None: fetch_feed_raw(url=target, limit=limit),
    }


CHANNELS: dict[str, Channel] = {
    "geeknews": _rss_channel("geeknews", "official_rss", "https://news.hada.io/rss/news"),
    "producthunt": _rss_channel("producthunt", "official_rss", "https://www.producthunt.com/feed"),
    "indiehackers": _rss_channel(
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


def get_channel(name: str) -> Channel:
    """채널 이름으로 등록된 채널 구성을 조회합니다.

    Args:
        name: 조회할 채널 식별자 이름.

    Returns:
        해당 채널의 Channel 딕셔너리.

    Raises:
        ValueError: 등록되지 않은 채널 이름일 경우.
    """
    try:
        return CHANNELS[name]
    except KeyError as exc:
        raise ValueError(f"unknown channel: {name}") from exc
