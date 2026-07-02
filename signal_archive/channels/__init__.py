from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from signal_archive.channels import geeknews, hackernews, indiehackers, producthunt
from signal_archive.schemas import NewsItem


FetchFn = Callable[[int], list[NewsItem]]


@dataclass(frozen=True)
class Channel:
    name: str
    method: str
    target: str
    fetch: FetchFn


CHANNELS: dict[str, Channel] = {
    geeknews.NAME: Channel(geeknews.NAME, geeknews.METHOD, geeknews.TARGET, geeknews.fetch),
    producthunt.NAME: Channel(
        producthunt.NAME,
        producthunt.METHOD,
        producthunt.TARGET,
        producthunt.fetch,
    ),
    indiehackers.NAME: Channel(
        indiehackers.NAME,
        indiehackers.METHOD,
        indiehackers.TARGET,
        indiehackers.fetch,
    ),
    hackernews.NAME: Channel(
        hackernews.NAME,
        hackernews.METHOD,
        hackernews.TARGET,
        hackernews.fetch,
    ),
}


def get_channel(name: str) -> Channel:
    try:
        return CHANNELS[name]
    except KeyError as exc:
        raise ValueError(f"unknown channel: {name}") from exc
