from __future__ import annotations

from typing import Any

from signal_archive.channels import hackernews
from signal_archive.channels.feed import fetch_feed
from signal_archive.schemas import NewsItem


Channel = dict[str, Any]


def _rss_channel(name: str, method: str, target: str) -> Channel:
    return {"name": name, "method": method, "target": target, "fetch": fetch_feed}


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
        "target": hackernews.TARGET,
        "fetch": hackernews.fetch,
    },
}


def get_channel(name: str) -> Channel:
    try:
        return CHANNELS[name]
    except KeyError as exc:
        raise ValueError(f"unknown channel: {name}") from exc
