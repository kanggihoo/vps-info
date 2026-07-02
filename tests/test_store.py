from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from signal_archive.schemas import NewsItem
from signal_archive.store import init_db, list_items, upsert_items


class StoreTests(unittest.TestCase):
    def test_upsert_inserts_and_updates_by_external_id(self):
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "archive.sqlite3"
            init_db(db_path)

            item = NewsItem(
                source="hackernews",
                source_method="official_api",
                external_id="42",
                title="First title",
                url="https://news.ycombinator.com/item?id=42",
                score=1,
                published_at=datetime(2026, 7, 3, tzinfo=timezone.utc),
            )
            first = upsert_items(db_path, [item])

            changed = item.model_copy(update={"title": "Changed title", "score": 2})
            second = upsert_items(db_path, [changed])
            rows = list_items(db_path)

            self.assertEqual(first.saved, 1)
            self.assertEqual(second.updated, 1)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["title"], "Changed title")
            self.assertEqual(rows[0]["score"], 2)

    def test_upsert_dedups_by_url_when_external_id_missing(self):
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "archive.sqlite3"
            init_db(db_path)

            first = NewsItem(
                source="geeknews",
                source_method="official_rss",
                title="First",
                url="https://example.com/post#comments",
            )
            second = NewsItem(
                source="geeknews",
                source_method="official_rss",
                title="Second",
                url="https://example.com/post",
            )

            upsert_items(db_path, [first])
            result = upsert_items(db_path, [second])
            rows = list_items(db_path)

            self.assertEqual(result.updated, 1)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["title"], "Second")

    def test_list_filters_by_channel(self):
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "archive.sqlite3"
            init_db(db_path)
            upsert_items(
                db_path,
                [
                    NewsItem(
                        source="geeknews",
                        source_method="official_rss",
                        title="Geek",
                        url="https://example.com/geek",
                    ),
                    NewsItem(
                        source="producthunt",
                        source_method="official_rss",
                        title="Product",
                        url="https://example.com/product",
                    ),
                ],
            )

            rows = list_items(db_path, channel="geeknews")

            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["source"], "geeknews")


if __name__ == "__main__":
    unittest.main()
