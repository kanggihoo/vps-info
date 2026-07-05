from __future__ import annotations

import json
from datetime import datetime, timezone
from time import struct_time
from typing import Any

import feedparser
import httpx

from signal_archive.schemas import NewsItem, SourceMethod


TIMEOUT_SECONDS = 15


def _published(entry: Any) -> datetime | None:
    value: struct_time | None = getattr(entry, "published_parsed", None) or getattr(
        entry, "updated_parsed", None
    )
    if value is None:
        return None
    return datetime(*value[:6], tzinfo=timezone.utc)


def _tags(entry: Any) -> list[str]:
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
) -> list[NewsItem]:
    response = httpx.get(url, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    parsed = feedparser.parse(response.content)
    if parsed.bozo and not parsed.entries:
        raise ValueError(f"failed to parse feed: {url}")

    items: list[NewsItem] = []
    for entry in parsed.entries[:limit]:
        link = entry.get("link")
        title = entry.get("title")
        if not link or not title:
            continue
        external_id = entry.get("id") or entry.get("guid") or link
        items.append(
            NewsItem(
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
    return items


def fetch_feed_raw(*, url: str, limit: int) -> list[dict[str, Any]]:
    """Fetch a feed and return each entry as its raw parsed dict.

    Unlike ``fetch_feed``, this does not normalize entries into ``NewsItem``
    and preserves every feedparser field (summary, content, media_*, tags with
    nested structs, etc.) so the original payload can be inspected.
    """
    response = httpx.get(url, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    parsed = feedparser.parse(response.content)
    if parsed.bozo and not parsed.entries:
        raise ValueError(f"failed to parse feed: {url}")

    raw_entries: list[dict[str, Any]] = []
    for entry in parsed.entries[:limit]:
        # feedparser entries (FeedParserDict) carry non-JSON-serializable
        # values such as time.struct_time. Round-trip through json to coerce
        # those to strings while keeping the full nested structure.
        raw_entries.append(json.loads(json.dumps(entry, default=str)))
    return raw_entries
