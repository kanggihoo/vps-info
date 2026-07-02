from unittest import mock
import unittest

from signal_archive.channels import CHANNELS
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


class ChannelTests(unittest.TestCase):
    def test_rss_channels_use_shared_fetcher(self):
        self.assertIs(CHANNELS["geeknews"]["fetch"], fetch_feed)
        self.assertIs(CHANNELS["producthunt"]["fetch"], fetch_feed)
        self.assertIs(CHANNELS["indiehackers"]["fetch"], fetch_feed)

    def test_fetch_feed_normalizes_entries(self):
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

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].source, "geeknews")
        self.assertEqual(items[0].external_id, "abc")
        self.assertEqual(items[0].title, "Example title")
        self.assertEqual(items[0].tags, ["AI"])

    def test_hackernews_fetch_uses_fallback_url_for_text_posts(self):
        responses = [
            FakeResponse(data=[42]),
            FakeResponse(
                data={
                    "id": 42,
                    "type": "story",
                    "by": "alice",
                    "title": "Ask HN",
                    "time": 1783036800,
                    "score": 10,
                    "descendants": 3,
                }
            ),
        ]

        with mock.patch("httpx.Client") as client_cls:
            client = client_cls.return_value.__enter__.return_value
            client.get.side_effect = responses
            items = fetch_hackernews(limit=1)

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].source, "hackernews")
        self.assertEqual(items[0].external_id, "42")
        self.assertEqual(items[0].url, "https://news.ycombinator.com/item?id=42")
        self.assertEqual(items[0].score, 10)
        self.assertEqual(items[0].comments_count, 3)


if __name__ == "__main__":
    unittest.main()
