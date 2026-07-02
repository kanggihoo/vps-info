from signal_archive.channels.feed import fetch_feed
from signal_archive.schemas import NewsItem


NAME = "geeknews"
METHOD = "official_rss"
TARGET = "https://news.hada.io/rss/news"


def fetch(limit: int) -> list[NewsItem]:
    return fetch_feed(source=NAME, source_method=METHOD, url=TARGET, limit=limit)
