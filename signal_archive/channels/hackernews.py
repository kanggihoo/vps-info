from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from signal_archive.schemas import NewsItem


NAME = "hackernews"
METHOD = "official_api"
TARGET = "https://hacker-news.firebaseio.com/v0/topstories.json"
ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{item_id}.json"
TIMEOUT_SECONDS = 15


def _item_url(item_id: int) -> str:
    return f"https://news.ycombinator.com/item?id={item_id}"


def _normalize(payload: dict[str, Any]) -> NewsItem | None:
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
        url=str(payload.get("url") or _item_url(int(item_id))),
        author=payload.get("by"),
        published_at=published_at,
        score=payload.get("score"),
        comments_count=payload.get("descendants"),
        raw={
            "id": item_id,
            "type": payload.get("type"),
            "url": payload.get("url"),
            "score": payload.get("score"),
            "descendants": payload.get("descendants"),
        },
    )


def fetch(limit: int) -> list[NewsItem]:
    with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
        response = client.get(TARGET)
        response.raise_for_status()
        ids = response.json()[:limit]

        items: list[NewsItem] = []
        for item_id in ids:
            item_response = client.get(ITEM_URL.format(item_id=item_id))
            item_response.raise_for_status()
            item = _normalize(item_response.json() or {})
            if item is not None:
                items.append(item)
        return items
