from unittest import mock

import httpx
import pytest

from signal_archive.sources import SOURCES, collection_jobs
from signal_archive.sources.feed import fetch_feed
from signal_archive.sources.hackernews import fetch as fetch_hackernews


class FakeResponse:
    def __init__(self, data=None, content=b"", status_code=200, headers=None):
        self._data = data
        self.content = content
        self.status_code = status_code
        self.headers = headers or {}

    def json(self):
        return self._data

    def raise_for_status(self):
        return None


def test_rss_sources_use_shared_fetcher():
    assert SOURCES["geeknews"]["fetch"] is fetch_feed
    assert SOURCES["producthunt"]["fetch"] is fetch_feed
    assert SOURCES["indiehackers"]["fetch"] is fetch_feed


def test_fetch_feed_normalizes_entries():
    xml = b"""<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Example title</title>
          <link>https://example.com/post</link>
          <guid>abc</guid>
          <pubDate>Fri, 03 Jul 2026 00:00:00 GMT</pubDate>
          <category>AI</category>
        </item>
      </channel>
    </rss>
    """
    with mock.patch("httpx.get", return_value=FakeResponse(content=xml)):
        result = fetch_feed(
            source="geeknews",
            source_method="official_rss",
            url="https://example.com/rss",
            limit=5,
        )

    assert len(result.items) == 1
    assert result.items[0].source == "geeknews"
    assert result.items[0].external_id == "abc"
    assert result.items[0].title == "Example title"
    assert result.items[0].tags == ["AI"]
    assert result.skipped == 0
    assert result.retry_count == 0


def test_fetch_feed_counts_skipped_entries_missing_link_or_title():
    """Entries without a link or title cannot be persisted, so they must be tallied, not silently dropped."""
    xml = b"""<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item><title>Has both</title><link>https://example.com/a</link></item>
        <item><title>No link</title></item>
      </channel>
    </rss>
    """
    with mock.patch("httpx.get", return_value=FakeResponse(content=xml)):
        result = fetch_feed(
            source="geeknews", source_method="official_rss", url="https://example.com/rss", limit=5
        )

    assert len(result.items) == 1
    assert result.skipped == 1


def test_hackernews_fetch_uses_fallback_url_for_text_posts():
    payload = {
        "id": 42,
        "type": "story",
        "by": "alice",
        "title": "Ask HN",
        "time": 1783036800,
        "score": 10,
        "descendants": 3,
    }

    result = fetch_hackernews(limit=1, payloads=[payload], ranks=[1])

    assert len(result.items) == 1
    item = result.items[0]
    assert item.source == "hackernews"
    assert item.external_id == "42"
    assert str(item.url) == "https://news.ycombinator.com/item?id=42"
    assert str(item.source_item_url) == "https://news.ycombinator.com/item?id=42"
    assert item.rank == 1
    assert item.item_type == "story"
    assert item.score == 10
    assert item.comments_count == 3
    assert result.skipped == 0


def test_hackernews_fetch_counts_skipped_dead_and_deleted_payloads():
    """Dead/deleted HN items must be tallied as skipped, not silently disappear."""
    payloads = [
        {"id": 1, "title": "alive", "type": "story"},
        {"id": 2, "title": "dead one", "type": "story", "dead": True},
        {"id": 3, "type": "story"},  # missing title
    ]

    result = fetch_hackernews(limit=10, payloads=payloads, ranks=[1, 2, 3])

    assert [item.external_id for item in result.items] == ["1"]
    assert result.skipped == 2


def test_registered_collection_jobs_are_exactly_four():
    """The retired HN show feed must never be scheduled again."""
    assert collection_jobs() == [
        "geeknews", "producthunt", "indiehackers", "hackernews:best"
    ]


def test_rss_timeout_is_retried(monkeypatch):
    """Transient RSS timeouts should recover without retrying parsing later."""
    xml = b"""<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><item><title>Example</title><link>https://example.com/a</link></item></channel></rss>"""
    get = mock.Mock(
        side_effect=[
            httpx.TimeoutException("first"),
            httpx.TimeoutException("second"),
            FakeResponse(content=xml),
        ]
    )
    monkeypatch.setattr("signal_archive.sources.feed.httpx.get", get)

    result = fetch_feed(
        source="geeknews", source_method="official_rss", url="https://example.com/rss", limit=1
    )

    assert len(result.items) == 1
    assert get.call_count == 3
    assert result.retry_count == 2


def test_rss_parse_error_is_not_retried(monkeypatch):
    """A malformed feed is bad input, not a temporary network outage."""
    get = mock.Mock(return_value=FakeResponse(content=b"not an RSS document"))
    monkeypatch.setattr("signal_archive.sources.feed.httpx.get", get)

    with pytest.raises(ValueError, match="failed to parse"):
        fetch_feed(
            source="geeknews", source_method="official_rss", url="https://example.com/rss", limit=1
        )

    assert get.call_count == 1


def test_hackernews_ids_retry_on_rate_limit(monkeypatch):
    """HN's list endpoint must recover from a transient 503 like the RSS fetchers do."""
    import signal_archive.sources.hackernews as hackernews

    responses = [FakeResponse(status_code=503), FakeResponse(data=[1, 2, 3])]

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, *args, **kwargs):
            return responses.pop(0)

    monkeypatch.setattr(hackernews.httpx, "Client", FakeClient)

    ids = hackernews._fetch_ids()

    assert ids == [1, 2, 3]
    assert hackernews._fetch_ids.statistics["attempt_number"] == 2
