from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import pytest

from signal_archive.schemas import NewsItem
from signal_archive.store import init_db, list_items, upsert_items


def test_upsert_inserts_and_updates_by_external_id(tmp_path: Path):
    db_path = tmp_path / "archive.sqlite3"
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

    changed = replace(item, title="Changed title", score=2)
    second = upsert_items(db_path, [changed])
    rows = list_items(db_path)

    assert first.saved == 1
    assert second.updated == 1
    assert len(rows) == 1
    assert rows[0]["title"] == "Changed title"
    assert rows[0]["score"] == 2


def test_upsert_dedups_by_url_when_external_id_missing(tmp_path: Path):
    db_path = tmp_path / "archive.sqlite3"
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

    assert result.updated == 1
    assert len(rows) == 1
    assert rows[0]["title"] == "Second"


def test_list_filters_by_channel(tmp_path: Path):
    db_path = tmp_path / "archive.sqlite3"
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

    assert len(rows) == 1
    assert rows[0]["source"] == "geeknews"


def test_schema_does_not_store_unused_url_hash_column(tmp_path: Path):
    db_path = tmp_path / "archive.sqlite3"
    init_db(db_path)

    conn = sqlite3.connect(db_path)
    try:
        columns = [row[1] for row in conn.execute("PRAGMA table_info(items)")]
    finally:
        conn.close()

    assert "url_hash" not in columns


def test_init_db_drops_legacy_url_hash_column(tmp_path: Path):
    db_path = tmp_path / "archive.sqlite3"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                source_method TEXT NOT NULL,
                external_id TEXT,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                url_hash TEXT NOT NULL,
                dedup_key TEXT NOT NULL,
                author TEXT,
                published_at TEXT,
                score INTEGER,
                comments_count INTEGER,
                tags_json TEXT NOT NULL DEFAULT '[]',
                raw_json TEXT NOT NULL DEFAULT '{}',
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                UNIQUE(source, dedup_key)
            )
            """
        )
    finally:
        conn.close()

    init_db(db_path)
    upsert_items(
        db_path,
        [
            NewsItem(
                source="geeknews",
                source_method="official_rss",
                title="Migrated",
                url="https://example.com/migrated",
            )
        ],
    )

    conn = sqlite3.connect(db_path)
    try:
        columns = [row[1] for row in conn.execute("PRAGMA table_info(items)")]
        count = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
    finally:
        conn.close()

    assert "url_hash" not in columns
    assert count == 1


def test_upsert_does_not_silently_skip_bad_payloads(tmp_path: Path):
    db_path = tmp_path / "archive.sqlite3"
    item = NewsItem(
        source="geeknews",
        source_method="official_rss",
        title="Bad raw",
        url="https://example.com/bad",
        raw={"bad": {1, 2}},
    )

    with pytest.raises(TypeError):
        upsert_items(db_path, [item])

