# Signal Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working `signal-archive` CLI that fetches metadata from four channels and stores it in SQLite.

**Architecture:** Keep one Python package, `signal_archive`, with a thin `argparse` CLI. Channel modules normalize external data into one Pydantic `NewsItem`; `store.py` owns SQLite schema, dedup, upsert, and listing.

**Tech Stack:** Python 3.12, uv, stdlib `argparse`/`sqlite3`/`unittest`, `httpx`, `feedparser`, `pydantic`.

---

## File Map

- Modify: `pyproject.toml`
  - Rename project to `signal-archive`.
  - Add runtime dependencies.
  - Add console script entrypoint.
- Create: `signal_archive/__init__.py`
  - Package marker and version.
- Create: `signal_archive/schemas.py`
  - Pydantic `NewsItem`.
- Create: `signal_archive/store.py`
  - SQLite init, dedup key generation, upsert, list query.
- Create: `signal_archive/channels/feed.py`
  - Shared RSS/Atom fetch helper for GeekNews, Product Hunt, Indie Hackers.
- Create: `signal_archive/channels/geeknews.py`
  - GeekNews channel wrapper.
- Create: `signal_archive/channels/producthunt.py`
  - Product Hunt channel wrapper.
- Create: `signal_archive/channels/indiehackers.py`
  - Indie Hackers channel wrapper using unofficial RSS.
- Create: `signal_archive/channels/hackernews.py`
  - Hacker News Firebase API channel.
- Create: `signal_archive/channels/__init__.py`
  - Channel registry.
- Create: `signal_archive/core.py`
  - Fetch one/all channels and persist results.
- Create: `signal_archive/cli.py`
  - `argparse` commands.
- Create: `tests/test_store.py`
  - SQLite init/upsert/dedup tests.
- Create: `tests/test_channels.py`
  - Feed and HN normalization tests with mocked network.
- Create: `tests/test_cli.py`
  - CLI smoke tests.
- Modify: `README.md`
  - Replace “planned” wording with real install/test/run commands.

---

### Task 1: Package Config And Schema

**Files:**
- Modify: `pyproject.toml`
- Create: `signal_archive/__init__.py`
- Create: `signal_archive/schemas.py`
- Test: `tests/test_schemas.py`

- [ ] **Step 1: Write schema tests**

Create `tests/test_schemas.py`:

```python
from datetime import datetime, timezone

from pydantic import ValidationError

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
    try:
        NewsItem(
            source="geeknews",
            source_method="official_rss",
            title="Example",
            url="not-a-url",
        )
    except ValidationError as exc:
        assert "url" in str(exc)
    else:
        raise AssertionError("expected ValidationError")


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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
uv run python -m unittest discover -s tests -p test_schemas.py
```

Expected: FAIL with `ModuleNotFoundError: No module named 'signal_archive'`.

- [ ] **Step 3: Update project config**

Replace `pyproject.toml` with:

```toml
[project]
name = "signal-archive"
version = "0.1.0"
description = "Archive links and metadata from tech/news channels."
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "feedparser>=6.0.11",
    "httpx>=0.27.0",
    "pydantic>=2.0.0",
]

[project.scripts]
signal-archive = "signal_archive.cli:main"
```

- [ ] **Step 4: Create package marker**

Create `signal_archive/__init__.py`:

```python
__version__ = "0.1.0"
```

- [ ] **Step 5: Create Pydantic schema**

Create `signal_archive/schemas.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator


SourceMethod = Literal["official_api", "official_rss", "unofficial_rss"]


class NewsItem(BaseModel):
    source: str
    source_method: SourceMethod
    external_id: str | None = None
    title: str
    url: str
    author: str | None = None
    published_at: datetime | None = None
    score: int | None = None
    comments_count: int | None = None
    tags: list[str] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)

    @field_validator("source", "title")
    @classmethod
    def require_non_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value

    @field_validator("url")
    @classmethod
    def require_http_url(cls, value: str) -> str:
        value = value.strip()
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("must be an http(s) URL")
        return value
```

- [ ] **Step 6: Run schema tests**

Run:

```bash
uv run python -m unittest discover -s tests -p test_schemas.py
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add pyproject.toml signal_archive/__init__.py signal_archive/schemas.py tests/test_schemas.py
git commit -m "feat: add signal archive schema"
```

---

### Task 2: SQLite Store

**Files:**
- Create: `signal_archive/store.py`
- Test: `tests/test_store.py`

- [ ] **Step 1: Write store tests**

Create `tests/test_store.py`:

```python
from datetime import datetime, timezone
from tempfile import TemporaryDirectory
from pathlib import Path
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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
uv run python -m unittest discover -s tests -p test_store.py
```

Expected: FAIL with `ModuleNotFoundError: No module named 'signal_archive.store'`.

- [ ] **Step 3: Create SQLite store**

Create `signal_archive/store.py`:

```python
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
    skipped: int = 0


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


def _dt(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(UTC).isoformat()


def upsert_items(db_path: str | Path | None, items: list[NewsItem]) -> UpsertResult:
    init_db(db_path)
    saved = 0
    updated = 0
    skipped = 0
    now = datetime.now(UTC).isoformat()

    with connect(db_path) as conn:
        for item in items:
            try:
                url_hash = hash_url(item.url)
                dedup_key = make_dedup_key(item)
                existing = conn.execute(
                    "SELECT id FROM items WHERE source = ? AND dedup_key = ?",
                    (item.source, dedup_key),
                ).fetchone()
                values = {
                    "source": item.source,
                    "source_method": item.source_method,
                    "external_id": item.external_id,
                    "title": item.title,
                    "url": item.url,
                    "url_hash": url_hash,
                    "dedup_key": dedup_key,
                    "author": item.author,
                    "published_at": _dt(item.published_at),
                    "score": item.score,
                    "comments_count": item.comments_count,
                    "tags_json": json.dumps(item.tags, ensure_ascii=False),
                    "raw_json": json.dumps(item.raw, ensure_ascii=False),
                    "last_seen_at": now,
                }
                if existing:
                    conn.execute(
                        """
                        UPDATE items
                        SET source_method = :source_method,
                            external_id = :external_id,
                            title = :title,
                            url = :url,
                            url_hash = :url_hash,
                            author = :author,
                            published_at = :published_at,
                            score = :score,
                            comments_count = :comments_count,
                            tags_json = :tags_json,
                            raw_json = :raw_json,
                            last_seen_at = :last_seen_at
                        WHERE source = :source AND dedup_key = :dedup_key
                        """,
                        values,
                    )
                    updated += 1
                else:
                    conn.execute(
                        """
                        INSERT INTO items (
                            source, source_method, external_id, title, url,
                            url_hash, dedup_key, author, published_at, score,
                            comments_count, tags_json, raw_json, first_seen_at,
                            last_seen_at
                        )
                        VALUES (
                            :source, :source_method, :external_id, :title, :url,
                            :url_hash, :dedup_key, :author, :published_at, :score,
                            :comments_count, :tags_json, :raw_json, :first_seen_at,
                            :last_seen_at
                        )
                        """,
                        values | {"first_seen_at": now},
                    )
                    saved += 1
            except (sqlite3.Error, TypeError, ValueError):
                skipped += 1

    return UpsertResult(saved=saved, updated=updated, skipped=skipped)


def list_items(
    db_path: str | Path | None = None,
    *,
    channel: str | None = None,
    limit: int = 20,
) -> list[dict[str, object]]:
    init_db(db_path)
    sql = "SELECT * FROM items"
    params: list[object] = []
    if channel:
        sql += " WHERE source = ?"
        params.append(channel)
    sql += " ORDER BY COALESCE(published_at, first_seen_at) DESC LIMIT ?"
    params.append(limit)

    with connect(db_path) as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(row) for row in rows]
```

- [ ] **Step 4: Run store tests**

Run:

```bash
uv run python -m unittest discover -s tests -p test_store.py
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add signal_archive/store.py tests/test_store.py
git commit -m "feat: add sqlite item store"
```

---

### Task 3: Channels

**Files:**
- Create: `signal_archive/channels/feed.py`
- Create: `signal_archive/channels/geeknews.py`
- Create: `signal_archive/channels/producthunt.py`
- Create: `signal_archive/channels/indiehackers.py`
- Create: `signal_archive/channels/hackernews.py`
- Create: `signal_archive/channels/__init__.py`
- Test: `tests/test_channels.py`

- [ ] **Step 1: Write channel tests**

Create `tests/test_channels.py`:

```python
from unittest import mock
import unittest

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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
uv run python -m unittest discover -s tests -p test_channels.py
```

Expected: FAIL with `ModuleNotFoundError` for channel modules.

- [ ] **Step 3: Create shared feed channel helper**

Create `signal_archive/channels/feed.py`:

```python
from __future__ import annotations

from datetime import datetime, timezone
from time import struct_time
from typing import Any

import feedparser
import httpx

from signal_archive.schemas import NewsItem, SourceMethod


TIMEOUT_SECONDS = 15


def _published(entry: Any) -> datetime | None:
    value: struct_time | None = getattr(entry, "published_parsed", None) or getattr(
        entry, "updated_parsed", None
    )
    if value is None:
        return None
    return datetime(*value[:6], tzinfo=timezone.utc)


def _tags(entry: Any) -> list[str]:
    return [
        tag.get("term")
        for tag in getattr(entry, "tags", [])
        if isinstance(tag, dict) and tag.get("term")
    ]


def fetch_feed(
    *,
    source: str,
    source_method: SourceMethod,
    url: str,
    limit: int,
) -> list[NewsItem]:
    response = httpx.get(url, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    parsed = feedparser.parse(response.content)
    if parsed.bozo and not parsed.entries:
        raise ValueError(f"failed to parse feed: {url}")

    items: list[NewsItem] = []
    for entry in parsed.entries[:limit]:
        link = entry.get("link")
        title = entry.get("title")
        if not link or not title:
            continue
        external_id = entry.get("id") or entry.get("guid") or link
        items.append(
            NewsItem(
                source=source,
                source_method=source_method,
                external_id=str(external_id),
                title=str(title),
                url=str(link),
                author=entry.get("author"),
                published_at=_published(entry),
                tags=_tags(entry),
                raw={
                    "id": entry.get("id"),
                    "guid": entry.get("guid"),
                    "link": link,
                    "title": title,
                },
            )
        )
    return items
```

- [ ] **Step 4: Create RSS channel wrappers**

Create `signal_archive/channels/geeknews.py`:

```python
from signal_archive.channels.feed import fetch_feed
from signal_archive.schemas import NewsItem


NAME = "geeknews"
METHOD = "official_rss"
TARGET = "https://news.hada.io/rss/news"


def fetch(limit: int) -> list[NewsItem]:
    return fetch_feed(source=NAME, source_method=METHOD, url=TARGET, limit=limit)
```

Create `signal_archive/channels/producthunt.py`:

```python
from signal_archive.channels.feed import fetch_feed
from signal_archive.schemas import NewsItem


NAME = "producthunt"
METHOD = "official_rss"
TARGET = "https://www.producthunt.com/feed"


def fetch(limit: int) -> list[NewsItem]:
    return fetch_feed(source=NAME, source_method=METHOD, url=TARGET, limit=limit)
```

Create `signal_archive/channels/indiehackers.py`:

```python
from signal_archive.channels.feed import fetch_feed
from signal_archive.schemas import NewsItem


NAME = "indiehackers"
METHOD = "unofficial_rss"
TARGET = "https://feed.indiehackers.world/posts.rss"


def fetch(limit: int) -> list[NewsItem]:
    return fetch_feed(source=NAME, source_method=METHOD, url=TARGET, limit=limit)
```

- [ ] **Step 5: Create Hacker News channel**

Create `signal_archive/channels/hackernews.py`:

```python
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from signal_archive.schemas import NewsItem


NAME = "hackernews"
METHOD = "official_api"
TARGET = "https://hacker-news.firebaseio.com/v0/topstories.json"
ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{item_id}.json"
TIMEOUT_SECONDS = 15


def _item_url(item_id: int) -> str:
    return f"https://news.ycombinator.com/item?id={item_id}"


def _normalize(payload: dict[str, Any]) -> NewsItem | None:
    item_id = payload.get("id")
    title = payload.get("title")
    if item_id is None or not title or payload.get("dead") or payload.get("deleted"):
        return None

    timestamp = payload.get("time")
    published_at = None
    if isinstance(timestamp, int):
        published_at = datetime.fromtimestamp(timestamp, tz=timezone.utc)

    return NewsItem(
        source=NAME,
        source_method=METHOD,
        external_id=str(item_id),
        title=str(title),
        url=str(payload.get("url") or _item_url(int(item_id))),
        author=payload.get("by"),
        published_at=published_at,
        score=payload.get("score"),
        comments_count=payload.get("descendants"),
        raw={
            "id": item_id,
            "type": payload.get("type"),
            "url": payload.get("url"),
            "score": payload.get("score"),
            "descendants": payload.get("descendants"),
        },
    )


def fetch(limit: int) -> list[NewsItem]:
    with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
        response = client.get(TARGET)
        response.raise_for_status()
        ids = response.json()[:limit]

        items: list[NewsItem] = []
        for item_id in ids:
            item_response = client.get(ITEM_URL.format(item_id=item_id))
            item_response.raise_for_status()
            item = _normalize(item_response.json() or {})
            if item is not None:
                items.append(item)
        return items
```

- [ ] **Step 6: Create channel registry**

Create `signal_archive/channels/__init__.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from signal_archive.schemas import NewsItem
from signal_archive.channels import geeknews, hackernews, indiehackers, producthunt


FetchFn = Callable[[int], list[NewsItem]]


@dataclass(frozen=True)
class Channel:
    name: str
    method: str
    target: str
    fetch: FetchFn


CHANNELS: dict[str, Channel] = {
    geeknews.NAME: Channel(geeknews.NAME, geeknews.METHOD, geeknews.TARGET, geeknews.fetch),
    producthunt.NAME: Channel(
        producthunt.NAME,
        producthunt.METHOD,
        producthunt.TARGET,
        producthunt.fetch,
    ),
    indiehackers.NAME: Channel(
        indiehackers.NAME,
        indiehackers.METHOD,
        indiehackers.TARGET,
        indiehackers.fetch,
    ),
    hackernews.NAME: Channel(
        hackernews.NAME,
        hackernews.METHOD,
        hackernews.TARGET,
        hackernews.fetch,
    ),
}


def get_channel(name: str) -> Channel:
    try:
        return CHANNELS[name]
    except KeyError as exc:
        raise ValueError(f"unknown channel: {name}") from exc
```

- [ ] **Step 7: Run channel tests**

Run:

```bash
uv run python -m unittest discover -s tests -p test_channels.py
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add signal_archive/channels tests/test_channels.py
git commit -m "feat: add news channels"
```

---

### Task 4: Core And CLI

**Files:**
- Create: `signal_archive/core.py`
- Create: `signal_archive/cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write CLI tests**

Create `tests/test_cli.py`:

```python
from io import StringIO
from unittest import mock
import unittest

from signal_archive import cli
from signal_archive.core import FetchReport
from signal_archive.store import UpsertResult


class CliTests(unittest.TestCase):
    def test_channels_command_prints_registered_channels(self):
        stdout = StringIO()

        with mock.patch("sys.stdout", stdout):
            exit_code = cli.main(["channels"])

        self.assertEqual(exit_code, 0)
        self.assertIn("geeknews", stdout.getvalue())
        self.assertIn("hackernews", stdout.getvalue())

    def test_fetch_command_prints_summary(self):
        stdout = StringIO()
        report = FetchReport(
            channel="geeknews",
            fetched=2,
            result=UpsertResult(saved=1, updated=1, skipped=0),
        )

        with mock.patch("signal_archive.cli.fetch_channel", return_value=report):
            with mock.patch("sys.stdout", stdout):
                exit_code = cli.main(["fetch", "--channel", "geeknews", "--limit", "2"])

        self.assertEqual(exit_code, 0)
        self.assertIn("geeknews: fetched=2 saved=1 updated=1 skipped=0", stdout.getvalue())

    def test_fetch_all_continues_after_failed_channel(self):
        stdout = StringIO()
        reports = [
            FetchReport(
                channel="geeknews",
                fetched=1,
                result=UpsertResult(saved=1, updated=0, skipped=0),
            ),
            FetchReport(channel="indiehackers", fetched=0, error="timeout"),
        ]

        with mock.patch("signal_archive.cli.fetch_all_channels", return_value=reports):
            with mock.patch("sys.stdout", stdout):
                exit_code = cli.main(["fetch-all", "--limit", "1"])

        self.assertEqual(exit_code, 1)
        self.assertIn("geeknews: fetched=1 saved=1 updated=0 skipped=0", stdout.getvalue())
        self.assertIn("indiehackers: failed timeout", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
uv run python -m unittest discover -s tests -p test_cli.py
```

Expected: FAIL with missing `signal_archive.core` or `signal_archive.cli`.

- [ ] **Step 3: Create core orchestration**

Create `signal_archive/core.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from signal_archive.channels import CHANNELS, get_channel
from signal_archive.store import UpsertResult, upsert_items


@dataclass(frozen=True)
class FetchReport:
    channel: str
    fetched: int
    result: UpsertResult = UpsertResult()
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


def fetch_channel(channel_name: str, *, limit: int, db_path: str | Path | None = None) -> FetchReport:
    channel = get_channel(channel_name)
    try:
        items = channel.fetch(limit)
        result = upsert_items(db_path, items)
        return FetchReport(channel=channel.name, fetched=len(items), result=result)
    except Exception as exc:
        return FetchReport(channel=channel.name, fetched=0, error=str(exc))


def fetch_all_channels(*, limit: int, db_path: str | Path | None = None) -> list[FetchReport]:
    return [
        fetch_channel(name, limit=limit, db_path=db_path)
        for name in CHANNELS
    ]
```

- [ ] **Step 4: Create argparse CLI**

Create `signal_archive/cli.py`:

```python
from __future__ import annotations

import argparse
from pathlib import Path
import sys

from signal_archive.channels import CHANNELS
from signal_archive.core import FetchReport, fetch_all_channels, fetch_channel
from signal_archive.store import init_db, list_items


def _print_report(report: FetchReport) -> None:
    if report.error:
        print(f"{report.channel}: failed {report.error}")
        return
    print(
        f"{report.channel}: fetched={report.fetched} "
        f"saved={report.result.saved} "
        f"updated={report.result.updated} "
        f"skipped={report.result.skipped}"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="signal-archive")
    parser.add_argument("--db", type=Path, default=None, help="SQLite DB path")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init-db", help="Create SQLite schema")
    subparsers.add_parser("channels", help="List registered channels")

    fetch_parser = subparsers.add_parser("fetch", help="Fetch one channel")
    fetch_parser.add_argument("--channel", required=True, choices=sorted(CHANNELS))
    fetch_parser.add_argument("--limit", type=int, default=20)

    fetch_all_parser = subparsers.add_parser("fetch-all", help="Fetch all channels")
    fetch_all_parser.add_argument("--limit", type=int, default=20)

    list_parser = subparsers.add_parser("list", help="List saved items")
    list_parser.add_argument("--channel", choices=sorted(CHANNELS), default=None)
    list_parser.add_argument("--limit", type=int, default=20)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.command == "init-db":
        init_db(args.db)
        print("initialized")
        return 0

    if args.command == "channels":
        for channel in CHANNELS.values():
            print(f"{channel.name}\t{channel.method}\t{channel.target}")
        return 0

    if args.command == "fetch":
        report = fetch_channel(args.channel, limit=args.limit, db_path=args.db)
        _print_report(report)
        return 0 if report.ok else 1

    if args.command == "fetch-all":
        reports = fetch_all_channels(limit=args.limit, db_path=args.db)
        for report in reports:
            _print_report(report)
        return 0 if all(report.ok for report in reports) else 1

    if args.command == "list":
        for item in list_items(args.db, channel=args.channel, limit=args.limit):
            published = item["published_at"] or ""
            print(f"{published}\t{item['source']}\t{item['title']}\t{item['url']}")
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Run CLI tests**

Run:

```bash
uv run python -m unittest discover -s tests -p test_cli.py
```

Expected: PASS.

- [ ] **Step 6: Run all tests**

Run:

```bash
uv run python -m unittest discover -s tests
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add signal_archive/core.py signal_archive/cli.py tests/test_cli.py
git commit -m "feat: add signal archive cli"
```

---

### Task 5: README And Live Smoke Check

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Replace `README.md` with:

```markdown
# Signal Archive

Signal Archive archives links and metadata from tech/news channels into SQLite.

The repository directory may still be named `vps-info`, but the project and CLI are `signal-archive`.

## Channels

- GeekNews: official RSS
- Product Hunt: public feed
- Indie Hackers: unofficial RSS, `https://feed.indiehackers.world/posts.rss`
- Hacker News: official Firebase API

X/Twitter, Reddit, cloud scheduling, dashboards, Postgres, and full article scraping are out of scope for the first version.

## Setup

```bash
uv sync
```

## Commands

```bash
uv run signal-archive init-db
uv run signal-archive channels
uv run signal-archive fetch --channel geeknews --limit 20
uv run signal-archive fetch-all --limit 20
uv run signal-archive list --channel geeknews --limit 20
```

Use a custom SQLite path:

```bash
uv run signal-archive --db data/dev.sqlite3 fetch-all --limit 5
```

Or with an environment variable:

```bash
SIGNAL_ARCHIVE_DB_PATH=data/dev.sqlite3 uv run signal-archive fetch-all --limit 5
```

## Test

```bash
uv run python -m unittest discover -s tests
```

## Design

See `docs/superpowers/specs/2026-07-03-signal-archive-design.md`.
```

- [ ] **Step 2: Run all tests**

Run:

```bash
uv run python -m unittest discover -s tests
```

Expected: all tests PASS.

- [ ] **Step 3: Run local CLI smoke checks**

Run:

```bash
uv run signal-archive channels
uv run signal-archive init-db
uv run signal-archive list --limit 5
```

Expected:

- `channels` prints four rows.
- `init-db` prints `initialized`.
- `list` exits successfully even with no saved items.

- [ ] **Step 4: Run live fetch checks**

Run:

```bash
uv run signal-archive fetch --channel geeknews --limit 3
uv run signal-archive fetch --channel hackernews --limit 3
uv run signal-archive fetch-all --limit 3
uv run signal-archive list --limit 10
```

Expected:

- At least GeekNews and Hacker News return saved or updated rows.
- If Product Hunt or Indie Hackers fails due to feed/network behavior, `fetch-all` prints that channel failure and continues.
- `list` prints saved rows.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md
git commit -m "docs: add signal archive usage"
```

---

## Self-Review

Spec coverage:

- Public channels covered by Task 3.
- SQLite schema, dedup, nullable fields covered by Task 2.
- Pydantic model covered by Task 1.
- CLI commands covered by Task 4.
- README covered by Task 5.
- X/Twitter, Reddit, dashboard, Postgres, scheduling intentionally excluded.

Ponytail cuts:

- No ORM.
- No Typer.
- No monorepo.
- No dashboard placeholder.
- No live network dependency in default tests.
- No article hydration.

Execution order:

1. Task 1 creates importable package and schema.
2. Task 2 stores normalized items.
3. Task 3 fetches normalized items.
4. Task 4 wires CLI to core/store/channels.
5. Task 5 verifies and documents usage.
