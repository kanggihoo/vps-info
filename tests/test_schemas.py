from datetime import UTC, datetime
import pytest
from pydantic import ValidationError

from signal_archive.schemas import ArchiveItem


def test_archive_item_accepts_missing_optional_fields():
    item = ArchiveItem(
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


def test_archive_item_rejects_bad_url():
    with pytest.raises(ValueError, match="url"):
        ArchiveItem(
            source="geeknews",
            source_method="official_rss",
            title="Example",
            url="not-a-url",
        )


def test_archive_item_accepts_datetime():
    published_at = datetime(2026, 7, 3, tzinfo=UTC)
    item = ArchiveItem(
        source="hackernews",
        source_method="official_api",
        external_id="123",
        title="Example",
        url="https://news.ycombinator.com/item?id=123",
        published_at=published_at,
    )

    assert item.published_at == published_at


def test_archive_item_rejects_invalid_service_data():
    """Malformed source data must never reach the repository."""
    with pytest.raises(ValidationError):
        ArchiveItem(
            source="geeknews",
            source_method="official_rss",
            title=" ",
            url="ftp://example.com/post",
            score="3",
        )


def test_archive_item_normalizes_iso_datetime_to_utc():
    """Offset timestamps need one stable representation for database queries."""
    item = ArchiveItem(
        source="geeknews",
        source_method="official_rss",
        title="Example",
        url="https://example.com/post",
        published_at="2026-07-03T09:00:00+09:00",
    )

    assert item.published_at == datetime(2026, 7, 3, tzinfo=UTC)
