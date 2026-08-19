from datetime import datetime, timezone
import pytest

from signal_archive.schemas import NewsItem


def test_news_item_accepts_missing_optional_fields():
    item = NewsItem(
        source="geeknews",
        source_method="official_rss",
        title="Example",
        url="https://example.com/post",
    )

    assert item.external_id is None
    assert item.author is None
    assert item.published_at is None
    assert item.score is None
    assert item.comments_count is None
    assert item.tags == []
    assert item.raw == {}


def test_news_item_rejects_bad_url():
    with pytest.raises(ValueError, match="url"):
        NewsItem(
            source="geeknews",
            source_method="official_rss",
            title="Example",
            url="not-a-url",
        )


def test_news_item_accepts_datetime():
    published_at = datetime(2026, 7, 3, tzinfo=timezone.utc)
    item = NewsItem(
        source="hackernews",
        source_method="official_api",
        external_id="123",
        title="Example",
        url="https://news.ycombinator.com/item?id=123",
        published_at=published_at,
    )

    assert item.published_at == published_at

