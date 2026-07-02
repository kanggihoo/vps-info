from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from signal_archive.channels import CHANNELS, get_channel
from signal_archive.channels.feed import fetch_feed
from signal_archive.store import UpsertResult, upsert_items


@dataclass(frozen=True)
class FetchReport:
    channel: str
    fetched: int
    result: UpsertResult = UpsertResult()
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


def fetch_channel(channel_name: str, *, limit: int, db_path: str | Path | None = None) -> FetchReport:
    channel = get_channel(channel_name)
    try:
        if channel["fetch"] is fetch_feed:
            items = channel["fetch"](
                source=channel["name"],
                source_method=channel["method"],
                url=channel["target"],
                limit=limit,
            )
        else:
            items = channel["fetch"](limit)
        result = upsert_items(db_path, items)
        return FetchReport(channel=channel["name"], fetched=len(items), result=result)
    except Exception as exc:
        return FetchReport(channel=channel["name"], fetched=0, error=str(exc))


def fetch_all_channels(*, limit: int, db_path: str | Path | None = None) -> list[FetchReport]:
    return [fetch_channel(name, limit=limit, db_path=db_path) for name in CHANNELS]
