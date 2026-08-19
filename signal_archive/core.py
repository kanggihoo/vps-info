"""Channel fetch orchestration independent from storage lifecycle."""

from __future__ import annotations

from typing import Any

from signal_archive.channels import CHANNELS, get_channel
from signal_archive.channels import hackernews
from signal_archive.channels.feed import fetch_feed
from signal_archive.repository import ItemRepository, UpsertResult
from signal_archive.schemas import NewsItem


def fetch_channel_items(
    channel_name: str, *, limit: int, repository: ItemRepository
) -> list[NewsItem]:
    """Fetch one configured channel, filtering known HN IDs before item requests."""
    name, _, *_ = channel_name.partition(":")
    channel = get_channel(name)
    if channel["fetch"] is fetch_feed:
        return fetch_feed(
            source=channel["name"],
            source_method=channel["method"],
            url=channel["target"],
            limit=limit,
        )
    ids = hackernews._fetch_ids()
    existing = repository.get_existing_external_ids(name, [str(item_id) for item_id in ids])
    selected = [(rank, item_id) for rank, item_id in enumerate(ids, 1) if str(item_id) not in existing][:limit]
    if not selected:
        return []
    payloads = hackernews.fetch_payloads([item_id for _, item_id in selected])
    return hackernews.fetch(limit, payloads=payloads, ranks=[rank for rank, _ in selected])


def inspect_channel(channel_name: str, *, limit: int) -> Any:
    channel = get_channel(channel_name.partition(":")[0])
    return channel["fetch_raw"](limit)


def inspect_all(*, limit: int) -> dict[str, Any]:
    return {name: inspect_channel(name, limit=limit) for name in CHANNELS}
