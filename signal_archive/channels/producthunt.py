from signal_archive.channels.feed import fetch_feed
from signal_archive.schemas import NewsItem


NAME = "producthunt"
METHOD = "official_rss"
TARGET = "https://www.producthunt.com/feed"


def fetch(limit: int) -> list[NewsItem]:
    return fetch_feed(source=NAME, source_method=METHOD, url=TARGET, limit=limit)
