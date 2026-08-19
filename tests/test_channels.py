from unittest import mock

import pytest

from signal_archive.channels import CHANNELS, collection_jobs
from signal_archive.channels.feed import fetch_feed
from signal_archive.channels.hackernews import fetch as fetch_hackernews


class FakeResponse:
    def __init__(self, data=None, content=b""):
        self._data = data
        self.content = content

    def json(self):
        return self._data

    def raise_for_status(self):
        return None


def test_rss_channels_use_shared_fetcher():
    assert CHANNELS["geeknews"]["fetch"] is fetch_feed
    assert CHANNELS["producthunt"]["fetch"] is fetch_feed
    assert CHANNELS["indiehackers"]["fetch"] is fetch_feed


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
        items = fetch_feed(
            source="geeknews",
            source_method="official_rss",
            url="https://example.com/rss",
            limit=5,
        )

    assert len(items) == 1
    assert items[0].source == "geeknews"
    assert items[0].external_id == "abc"
    assert items[0].title == "Example title"
    assert items[0].tags == ["AI"]


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

    items = fetch_hackernews(limit=1, payloads=[payload], ranks=[1])

    assert len(items) == 1
    assert items[0].source == "hackernews"
    assert items[0].external_id == "42"
    assert str(items[0].url) == "https://news.ycombinator.com/item?id=42"
    assert str(items[0].source_item_url) == "https://news.ycombinator.com/item?id=42"
    assert items[0].rank == 1
    assert items[0].item_type == "story"
    assert items[0].score == 10
    assert items[0].comments_count == 3


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
            __import__("httpx").TimeoutException("first"),
            __import__("httpx").TimeoutException("second"),
            FakeResponse(content=xml),
        ]
    )
    monkeypatch.setattr("signal_archive.channels.feed.httpx.get", get)

    items = fetch_feed(
        source="geeknews", source_method="official_rss", url="https://example.com/rss", limit=1
    )

    assert len(items) == 1
    assert get.call_count == 3


def test_rss_parse_error_is_not_retried(monkeypatch):
    """A malformed feed is bad input, not a temporary network outage."""
    get = mock.Mock(return_value=FakeResponse(content=b"not an RSS document"))
    monkeypatch.setattr("signal_archive.channels.feed.httpx.get", get)

    with pytest.raises(ValueError, match="failed to parse"):
        fetch_feed(
            source="geeknews", source_method="official_rss", url="https://example.com/rss", limit=1
        )

    assert get.call_count == 1
