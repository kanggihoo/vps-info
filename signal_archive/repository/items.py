"""정규화된 archive item의 PostgreSQL 영속화."""

from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from typing import Any, Sequence
from urllib.parse import urlparse, urlunparse

import psycopg
from psycopg.types.json import Json

from signal_archive.repository.records import ItemRecord, UpsertResult
from signal_archive.schemas import ArchiveItem


_COLUMNS = """id, source, source_method, external_id, title, summary, url,
              source_item_url, author, published_at, score, comments_count,
              rank, item_type, tags_json AS tags, raw_json AS raw,
              first_seen_at, last_seen_at"""

_UPSERT = """
    INSERT INTO items (
        source, source_method, external_id, title, summary, url, source_item_url,
        dedup_key, author, published_at, score, comments_count, rank, item_type,
        tags_json, raw_json, first_seen_at, last_seen_at
    ) VALUES (
        %(source)s, %(source_method)s, %(external_id)s, %(title)s, %(summary)s,
        %(url)s, %(source_item_url)s, %(dedup_key)s, %(author)s, %(published_at)s,
        %(score)s, %(comments_count)s, %(rank)s, %(item_type)s, %(tags)s, %(raw)s,
        %(first_seen_at)s, %(last_seen_at)s
    ) ON CONFLICT (source, dedup_key) DO UPDATE SET
        source_method = EXCLUDED.source_method,
        external_id = EXCLUDED.external_id,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        url = EXCLUDED.url,
        source_item_url = EXCLUDED.source_item_url,
        author = EXCLUDED.author,
        published_at = EXCLUDED.published_at,
        score = EXCLUDED.score,
        comments_count = EXCLUDED.comments_count,
        rank = EXCLUDED.rank,
        item_type = EXCLUDED.item_type,
        tags_json = EXCLUDED.tags_json,
        raw_json = EXCLUDED.raw_json,
        last_seen_at = EXCLUDED.last_seen_at
    RETURNING (xmax = 0) AS inserted
"""


def normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    return urlunparse(
        (parsed.scheme.lower(), parsed.netloc.lower(), parsed.path or "/", "", parsed.query, "")
    )


def make_dedup_key(item: ArchiveItem) -> str:
    """Source 자체 식별자를 우선해 Source 단위 dedup key를 만든다.

    ADR-0001 참고: item 동일성은 Source 범위로 한정되므로, 이 key는 하나의
    `source` 값 안에서만 유일하다.
    """
    if item.external_id:
        return f"external:{item.external_id}"
    return f"url:{sha256(normalize_url(str(item.url)).encode()).hexdigest()}"


def _filters(
    source: str | None, start_at: datetime | None, end_at: datetime | None
) -> tuple[str, dict[str, Any]]:
    """조회와 건수 집계가 서로 어긋나지 않도록 공용 WHERE 절을 만든다."""
    clauses: list[str] = []
    values: dict[str, Any] = {}
    if source:
        clauses.append("source = %(source)s")
        values["source"] = source
    if start_at:
        clauses.append("published_at >= %(start_at)s")
        values["start_at"] = start_at
    if end_at:
        clauses.append("published_at <= %(end_at)s")
        values["end_at"] = end_at
    return f"WHERE {' AND '.join(clauses)}" if clauses else "", values


class ItemRepository:
    """호출자가 소유한 커넥션에서 archive item을 조회하고 upsert한다."""

    def __init__(self, connection: psycopg.Connection):
        self.connection = connection

    def upsert_items(self, items: Sequence[ArchiveItem]) -> UpsertResult:
        """각 item을 하나의 transaction에서 삽입하거나 갱신한다.

        Args:
            items: 저장할 검증된 item 목록.

        Returns:
            새로 삽입된 row와 갱신된 row의 건수.
        """
        saved = updated = 0
        with self.connection.transaction():
            for item in items:
                now = datetime.now(UTC)
                values = {
                    "source": item.source,
                    "source_method": item.source_method,
                    "external_id": item.external_id,
                    "title": item.title,
                    "summary": item.summary,
                    "url": str(item.url),
                    "source_item_url": str(item.source_item_url) if item.source_item_url else None,
                    "dedup_key": make_dedup_key(item),
                    "author": item.author,
                    "published_at": item.published_at,
                    "score": item.score,
                    "comments_count": item.comments_count,
                    "rank": item.rank,
                    "item_type": item.item_type,
                    "tags": Json(item.tags),
                    "raw": Json(item.raw),
                    "first_seen_at": now,
                    "last_seen_at": now,
                }
                inserted = self.connection.execute(_UPSERT, values).fetchone()["inserted"]
                saved += int(inserted)
                updated += int(not inserted)
        return UpsertResult(saved=saved, updated=updated)

    def list_items(
        self,
        source: str | None,
        start_at: datetime | None,
        end_at: datetime | None,
        limit: int,
        offset: int,
    ) -> list[ItemRecord]:
        where, values = _filters(source, start_at, end_at)
        rows = self.connection.execute(
            f"""SELECT {_COLUMNS} FROM items {where}
                ORDER BY published_at DESC NULLS LAST, id DESC
                LIMIT %(limit)s OFFSET %(offset)s""",
            {**values, "limit": limit, "offset": offset},
        ).fetchall()
        return [ItemRecord.model_validate(row) for row in rows]

    def get_item(self, item_id: int) -> ItemRecord | None:
        row = self.connection.execute(
            f"SELECT {_COLUMNS} FROM items WHERE id = %s", (item_id,)
        ).fetchone()
        return ItemRecord.model_validate(row) if row else None

    def count_items(
        self, source: str | None, start_at: datetime | None, end_at: datetime | None
    ) -> int:
        where, values = _filters(source, start_at, end_at)
        return self.connection.execute(
            f"SELECT count(*) AS total FROM items {where}", values
        ).fetchone()["total"]
