from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
import json
import os
from pathlib import Path
import sqlite3
from urllib.parse import urlparse, urlunparse

from signal_archive.schemas import NewsItem


DEFAULT_DB_PATH = Path("data/signal-archive.sqlite3")


@dataclass(frozen=True)
class UpsertResult:
    saved: int = 0
    updated: int = 0


def get_db_path(value: str | Path | None = None) -> Path:
    if value is not None:
        return Path(value)
    return Path(os.environ.get("SIGNAL_ARCHIVE_DB_PATH", DEFAULT_DB_PATH))


def connect(db_path: str | Path | None = None) -> sqlite3.Connection:
    path = get_db_path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str | Path | None = None) -> None:
    with connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                source_method TEXT NOT NULL,
                external_id TEXT,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                dedup_key TEXT NOT NULL,
                author TEXT,
                published_at TEXT,
                score INTEGER,
                comments_count INTEGER,
                tags_json TEXT NOT NULL DEFAULT '[]',
                raw_json TEXT NOT NULL DEFAULT '{}',
                feed TEXT,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                UNIQUE(source, feed, dedup_key)
            )
            """
        )
        columns = [row["name"] for row in conn.execute("PRAGMA table_info(items)")]
        if "url_hash" in columns:
            conn.execute("ALTER TABLE items DROP COLUMN url_hash")
        if "feed" not in columns:
            conn.execute("ALTER TABLE items ADD COLUMN feed TEXT")
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_items_source_feed_external_id
            ON items(source, feed, external_id)
            """
        )


def normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    netloc = parsed.netloc.lower()
    scheme = parsed.scheme.lower()
    path = parsed.path or "/"
    return urlunparse((scheme, netloc, path, "", parsed.query, ""))


def hash_url(url: str) -> str:
    return sha256(normalize_url(url).encode("utf-8")).hexdigest()


def make_dedup_key(item: NewsItem) -> str:
    if item.external_id:
        return f"external:{item.external_id}"
    return f"url:{hash_url(item.url)}"


def get_existing_ids(
    db_path: str | Path | None,
    *,
    source: str,
    feed: str | None,
    ids: list[str],
) -> set[str]:
    """Return ids from ``ids`` that already exist in the DB.

    Uses an IN-clause over at most ``len(ids)`` keys (capped by the API list
    size, ~500) so cost is O(M log N), not O(N). Callers compute the
    difference in Python to preserve API/ranking order.
    """
    if not ids:
        return set()
    init_db(db_path)
    placeholders = ",".join("?" * len(ids))
    params: list[object] = [source]
    if feed is None:
        sql = f"""
            SELECT external_id FROM items
            WHERE source = ? AND external_id IS NOT NULL
              AND external_id IN ({placeholders})
        """
    else:
        sql = f"""
            SELECT external_id FROM items
            WHERE source = ? AND feed = ? AND external_id IS NOT NULL
              AND external_id IN ({placeholders})
        """
        params.append(feed)
    params.extend(ids)
    with connect(db_path) as conn:
        rows = conn.execute(sql, params).fetchall()
    return {row["external_id"] for row in rows}


def _dt(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(UTC).isoformat()


def upsert_items(db_path: str | Path | None, items: list[NewsItem]) -> UpsertResult:
    init_db(db_path)
    saved = 0
    updated = 0

    with connect(db_path) as conn:
        for item in items:
            now = datetime.now(UTC).isoformat()
            values = {
                "source": item.source,
                "source_method": item.source_method,
                "external_id": item.external_id,
                "title": item.title,
                "url": item.url,
                "dedup_key": make_dedup_key(item),
                "author": item.author,
                "published_at": _dt(item.published_at),
                "score": item.score,
                "comments_count": item.comments_count,
                "tags_json": json.dumps(item.tags, ensure_ascii=False),
                "raw_json": json.dumps(item.raw, ensure_ascii=False),
                "feed": item.feed,
                "last_seen_at": now,
            }
            cursor = conn.execute(
                """
                INSERT INTO items (
                    source, source_method, external_id, title, url,
                    dedup_key, author, published_at, score, comments_count,
                    tags_json, raw_json, feed, first_seen_at, last_seen_at
                )
                VALUES (
                    :source, :source_method, :external_id, :title, :url,
                    :dedup_key, :author, :published_at, :score, :comments_count,
                    :tags_json, :raw_json, :feed, :first_seen_at, :last_seen_at
                )
                ON CONFLICT(source, feed, dedup_key) DO NOTHING
                """,
                values | {"first_seen_at": now},
            )
            if cursor.rowcount:
                saved += 1
                continue

            conn.execute(
                """
                UPDATE items
                SET source_method = :source_method,
                    external_id = :external_id,
                    title = :title,
                    url = :url,
                    author = :author,
                    published_at = :published_at,
                    score = :score,
                    comments_count = :comments_count,
                    tags_json = :tags_json,
                    raw_json = :raw_json,
                    feed = :feed,
                    last_seen_at = :last_seen_at
                WHERE source = :source AND feed IS :feed AND dedup_key = :dedup_key
                """,
                values,
            )
            updated += 1

    return UpsertResult(saved=saved, updated=updated)


def list_items(
    db_path: str | Path | None = None,
    *,
    channel: str | None = None,
    feed: str | None = None,
    limit: int = 20,
) -> list[dict[str, object]]:
    init_db(db_path)
    sql = "SELECT * FROM items"
    params: list[object] = []
    clauses: list[str] = []
    if channel:
        clauses.append("source = ?")
        params.append(channel)
    if feed:
        clauses.append("feed = ?")
        params.append(feed)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY COALESCE(published_at, first_seen_at) DESC LIMIT ?"
    params.append(limit)

    with connect(db_path) as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(row) for row in rows]
