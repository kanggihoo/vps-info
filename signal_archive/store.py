"""SQLite 기반 뉴스 아이템 영속화 및 중복 제거 저장소 모듈."""

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
    """DB upsert 작업 통계를 나타내는 데이터 클래스.

    Attributes:
        saved: 새로 저장된 아이템 개수.
        updated: 기존 항목에서 변경되어 업데이트된 아이템 개수.
    """

    saved: int = 0
    updated: int = 0


def get_db_path(value: str | Path | None = None) -> Path:
    """사용할 SQLite 데이터베이스 파일 경로를 반환합니다.

    Args:
        value: 직접 지정한 DB 경로 (기본값: None).

    Returns:
        환경 변수(`SIGNAL_ARCHIVE_DB_PATH`) 또는 기본값이 적용된 Path 객체.
    """
    if value is not None:
        return Path(value)
    return Path(os.environ.get("SIGNAL_ARCHIVE_DB_PATH", DEFAULT_DB_PATH))


def connect(db_path: str | Path | None = None) -> sqlite3.Connection:
    """SQLite DB 연결을 생성하고 Row 팩토리를 설정하여 반환합니다.

    Args:
        db_path: 데이터베이스 파일 경로.

    Returns:
        sqlite3.Row 팩토리가 적용된 Connection 객체.
    """
    path = get_db_path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str | Path | None = None) -> None:
    """테이블과 인덱스를 생성하고 스키마 마이그레이션을 수행합니다.

    Args:
        db_path: 대상 데이터베이스 파일 경로.
    """
    conn = connect(db_path)
    try:
        with conn:
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
                    feed TEXT NOT NULL DEFAULT '',
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
                conn.execute("ALTER TABLE items ADD COLUMN feed TEXT NOT NULL DEFAULT ''")
            conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_feed_dedup_key
                ON items(source, feed, dedup_key)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_items_source_feed_external_id
                ON items(source, feed, external_id)
                """
            )
    finally:
        conn.close()


def normalize_url(url: str) -> str:
    """중복 제거를 위해 URL 스킴, 도메인, 경로를 정규화합니다.

    Args:
        url: 정규화할 원본 URL 문자열.

    Returns:
        소문자 변환 및 기본 경로(`/`)가 보정된 정규화 URL.
    """
    parsed = urlparse(url.strip())
    netloc = parsed.netloc.lower()
    scheme = parsed.scheme.lower()
    path = parsed.path or "/"
    return urlunparse((scheme, netloc, path, "", parsed.query, ""))


def hash_url(url: str) -> str:
    """정규화된 URL의 SHA-256 해시 문자열을 생성합니다.

    Args:
        url: 해시할 URL 문자열.

    Returns:
        64자 16진수 SHA-256 해시값.
    """
    return sha256(normalize_url(url).encode("utf-8")).hexdigest()


def make_dedup_key(item: NewsItem) -> str:
    """아이템 중복 검사용 고유 키를 생성합니다.

    Args:
        item: 중복 키를 생성할 NewsItem 객체.

    Returns:
        'external:<id>' 또는 'url:<hash>' 형식의 식별자 문자열.
    """
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
    """주어진 ID 목록 중 DB에 이미 존재하는 ID 집합을 반환합니다.

    Args:
        db_path: 데이터베이스 파일 경로.
        source: 채널 식별자 이름.
        feed: 세부 피드 식별자 (선택 사항).
        ids: 중복 여부를 확인할 external_id 목록.

    Returns:
        이미 DB에 존재하는 external_id의 set.
    """
    if not ids:
        return set()
    init_db(db_path)
    placeholders = ",".join("?" * len(ids))
    sql = f"""
        SELECT external_id FROM items
        WHERE source = ? AND feed = ? AND external_id IS NOT NULL
          AND external_id IN ({placeholders})
    """
    params: list[object] = [source, feed or "", *ids]
    conn = connect(db_path)
    try:
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    return {row["external_id"] for row in rows}


def _dt(value: datetime | None) -> str | None:
    """datetime 객체를 UTC 기준 ISO 8601 형식 문자열로 변환합니다."""
    if value is None:
        return None
    return value.astimezone(UTC).isoformat()


def upsert_items(db_path: str | Path | None, items: list[NewsItem]) -> UpsertResult:
    """뉴스 아이템 목록을 DB에 신규 저장하거나 기존 항목을 업데이트합니다.

    Args:
        db_path: 데이터베이스 파일 경로.
        items: 저장할 NewsItem 객체 목록.

    Returns:
        신규 저장 건수(saved)와 갱신 건수(updated)를 담은 UpsertResult.
    """
    init_db(db_path)
    saved = 0
    updated = 0

    conn = connect(db_path)
    try:
        with conn:
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
                    "feed": item.feed or "",
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
                    WHERE source = :source AND feed = :feed AND dedup_key = :dedup_key
                    """,
                    values,
                )
                updated += 1
    finally:
        conn.close()

    return UpsertResult(saved=saved, updated=updated)


def list_items(
    db_path: str | Path | None = None,
    *,
    channel: str | None = None,
    feed: str | None = None,
    limit: int = 20,
) -> list[dict[str, object]]:
    """저장된 뉴스 아이템을 최신순(published_at/first_seen_at)으로 조회합니다.

    Args:
        db_path: 데이터베이스 파일 경로 (선택 사항).
        channel: 필터링할 채널 이름 (선택 사항).
        feed: 필터링할 피드 이름 (선택 사항).
        limit: 조회할 최대 건수 (기본값: 20).

    Returns:
        조회된 레코드 딕셔너리 목록.
    """
    init_db(db_path)
    sql = "SELECT * FROM items"
    params: list[object] = []
    clauses: list[str] = []
    if channel:
        clauses.append("source = ?")
        params.append(channel)
    if feed is not None:
        clauses.append("feed = ?")
        params.append(feed or "")
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY COALESCE(published_at, first_seen_at) DESC LIMIT ?"
    params.append(limit)

    conn = connect(db_path)
    try:
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    return [dict(row) for row in rows]

