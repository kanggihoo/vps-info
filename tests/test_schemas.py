from datetime import datetime, timezone
import unittest

from pydantic import ValidationError

from signal_archive.schemas import NewsItem


class NewsItemTests(unittest.TestCase):
    def test_news_item_accepts_missing_optional_fields(self):
        item = NewsItem(
            source="geeknews",
            source_method="official_rss",
            title="Example",
            url="https://example.com/post",
        )

        self.assertIsNone(item.external_id)
        self.assertIsNone(item.author)
        self.assertIsNone(item.published_at)
        self.assertIsNone(item.score)
        self.assertIsNone(item.comments_count)
        self.assertEqual(item.tags, [])
        self.assertEqual(item.raw, {})

    def test_news_item_rejects_bad_url(self):
        with self.assertRaises(ValidationError) as ctx:
            NewsItem(
                source="geeknews",
                source_method="official_rss",
                title="Example",
                url="not-a-url",
            )

        self.assertIn("url", str(ctx.exception))

    def test_news_item_accepts_datetime(self):
        published_at = datetime(2026, 7, 3, tzinfo=timezone.utc)
        item = NewsItem(
            source="hackernews",
            source_method="official_api",
            external_id="123",
            title="Example",
            url="https://news.ycombinator.com/item?id=123",
            published_at=published_at,
        )

        self.assertEqual(item.published_at, published_at)


if __name__ == "__main__":
    unittest.main()
