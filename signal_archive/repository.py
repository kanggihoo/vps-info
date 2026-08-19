"""PostgreSQL persistence for normalized archive items."""

from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from typing import Literal, Sequence
from urllib.parse import urlparse, urlunparse

import psycopg
from psycopg.types.json import Json
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from signal_archive.schemas import NewsItem


def _camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.title() for part in tail)


class UpsertResult(BaseModel):
    saved: int = 0
    updated: int = 0


class ItemRecord(BaseModel):
    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True)
    id: int
    source: str
    source_method: str
    external_id: str | None = None
    title: str
    summary: str | None = None
    url: HttpUrl
    source_item_url: HttpUrl | None = None
    author: str | None = None
    published_at: datetime | None = None
    score: int | None = None
    comments_count: int | None = None
    rank: int | None = None
    item_type: str | None = None
    tags: list[str]
    raw: dict = {}
    first_seen_at: datetime
    last_seen_at: datetime


RunStatus = Literal["RUNNING", "SUCCESS", "PARTIAL", "FAILED"]


class RunCounts(BaseModel):
    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    skipped: int = 0
    retry_count: int = 0


class RunError(BaseModel):
    error_type: str
    error_message: str


class JobRunRecord(BaseModel):
    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True)
    id: int
    parent_run_id: int | None = None
    job_key: str
    triggered_by: str
    started_at: datetime
    finished_at: datetime | None = None
    status: RunStatus
    fetched_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    retry_count: int = 0
    error_type: str | None = None
    error_message: str | None = None
    children: list["JobRunRecord"] = Field(default_factory=list)


def normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path or "/", "", parsed.query, ""))


def make_dedup_key(item: NewsItem) -> str:
    if item.external_id:
        return f"external:{item.external_id}"
    return f"url:{sha256(normalize_url(str(item.url)).encode()).hexdigest()}"


class ItemRepository:
    def __init__(self, connection: psycopg.Connection):
        self.connection = connection

    def upsert_items(self, items: Sequence[NewsItem]) -> UpsertResult:
        saved = updated = 0
        sql = """
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
                inserted = self.connection.execute(sql, values).fetchone()["inserted"]
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
        clauses, values = [], {"limit": limit, "offset": offset}
        if source:
            clauses.append("source = %(source)s")
            values["source"] = source
        if start_at:
            clauses.append("published_at >= %(start_at)s")
            values["start_at"] = start_at
        if end_at:
            clauses.append("published_at <= %(end_at)s")
            values["end_at"] = end_at
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self.connection.execute(
            f"""SELECT id, source, source_method, external_id, title, summary, url,
                       source_item_url, author, published_at, score, comments_count,
                       rank, item_type, tags_json AS tags, raw_json AS raw,
                       first_seen_at, last_seen_at
                FROM items {where}
                ORDER BY published_at DESC NULLS LAST, id DESC
                LIMIT %(limit)s OFFSET %(offset)s""",
            values,
        ).fetchall()
        return [ItemRecord.model_validate(row) for row in rows]

    def get_item(self, item_id: int) -> ItemRecord | None:
        rows = self.connection.execute(
            """SELECT id, source, source_method, external_id, title, summary, url,
                      source_item_url, author, published_at, score, comments_count,
                      rank, item_type, tags_json AS tags, raw_json AS raw,
                      first_seen_at, last_seen_at
               FROM items WHERE id = %s""",
            (item_id,),
        ).fetchall()
        return ItemRecord.model_validate(rows[0]) if rows else None

    def count_items(
        self, source: str | None, start_at: datetime | None, end_at: datetime | None
    ) -> int:
        clauses, values = [], {}
        if source:
            clauses.append("source = %(source)s")
            values["source"] = source
        if start_at:
            clauses.append("published_at >= %(start_at)s")
            values["start_at"] = start_at
        if end_at:
            clauses.append("published_at <= %(end_at)s")
            values["end_at"] = end_at
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        return self.connection.execute(f"SELECT count(*) AS total FROM items {where}", values).fetchone()["total"]

    def get_existing_external_ids(self, source: str, ids: Sequence[str]) -> set[str]:
        if not ids:
            return set()
        rows = self.connection.execute(
            "SELECT external_id FROM items WHERE source = %s AND external_id = ANY(%s)",
            (source, list(ids)),
        ).fetchall()
        return {row["external_id"] for row in rows}


class JobRunRepository:
    def __init__(self, connection: psycopg.Connection):
        self.connection = connection

    def start_run(self, job_key: str, triggered_by: str, parent_run_id: int | None) -> int:
        row = self.connection.execute(
            """INSERT INTO job_run (parent_run_id, job_key, triggered_by, started_at, status)
               VALUES (%s, %s, %s, %s, 'RUNNING') RETURNING id""",
            (parent_run_id, job_key, triggered_by, datetime.now(UTC)),
        ).fetchone()
        self.connection.commit()
        return row["id"]

    def finish_run(
        self, run_id: int, status: RunStatus, counts: RunCounts, error: RunError | None
    ) -> None:
        self.connection.execute(
            """UPDATE job_run SET finished_at = %s, status = %s,
                   fetched_count = %s, inserted_count = %s, updated_count = %s,
                   skipped_count = %s, retry_count = %s, error_type = %s, error_message = %s
               WHERE id = %s""",
            (
                datetime.now(UTC), status, counts.fetched, counts.inserted, counts.updated,
                counts.skipped, counts.retry_count, error.error_type if error else None,
                error.error_message[:1000] if error else None, run_id,
            ),
        )
        self.connection.commit()

    def list_parent_runs(self, limit: int, offset: int) -> list[JobRunRecord]:
        rows = self.connection.execute(
            """SELECT * FROM job_run WHERE parent_run_id IS NULL
               ORDER BY started_at DESC, id DESC LIMIT %s OFFSET %s""",
            (limit, offset),
        ).fetchall()
        return [JobRunRecord.model_validate(row) for row in rows]

    def get_run_with_children(self, run_id: int) -> JobRunRecord | None:
        row = self.connection.execute("SELECT * FROM job_run WHERE id = %s", (run_id,)).fetchone()
        if row is None:
            return None
        children = self.connection.execute(
            "SELECT * FROM job_run WHERE parent_run_id = %s ORDER BY started_at, id", (run_id,)
        ).fetchall()
        return JobRunRecord.model_validate({**row, "children": children})
