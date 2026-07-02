from signal_archive.channels.feed import fetch_feed
from signal_archive.schemas import NewsItem


NAME = "indiehackers"
METHOD = "unofficial_rss"
TARGET = "https://feed.indiehackers.world/posts.rss"


def fetch(limit: int) -> list[NewsItem]:
    return fetch_feed(source=NAME, source_method=METHOD, url=TARGET, limit=limit)
