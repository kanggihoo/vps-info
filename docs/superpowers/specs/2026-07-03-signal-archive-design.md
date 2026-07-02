# Signal Archive Design

## Goal

Build a small Python collector that archives links and metadata from public tech/news channels into SQLite. The first version is for local testing and schema validation, not cloud scheduling.

The archive is optimized for reading and searching saved items. Ranking, LLM analysis, article hydration, X/Twitter, and Reddit are out of scope for this first version.

## Scope

Included channels:

- GeekNews via official RSS: `https://news.hada.io/rss/news`
- Product Hunt via public feed: `https://www.producthunt.com/feed`
- Indie Hackers via unofficial RSS: `https://feed.indiehackers.world/posts.rss`
- Hacker News via official Firebase API

Excluded for this phase:

- Cron, systemd timer, GitHub Actions, or cloud deployment
- X/Twitter and Reddit collection
- Full article/body scraping
- Dashboard or web API
- Postgres

X/Twitter and Reddit will be designed later around login-session based collection through Agent Reach.

## Naming

The project name and CLI should be `signal-archive`.

The current repository directory may remain named `vps-info` for now. The Python package should use an underscore because Python imports cannot use hyphens:

```text
project name: signal-archive
CLI command:  signal-archive
package:      signal_archive
```

## Project Structure

```text
.
├── pyproject.toml
├── README.md
├── signal_archive/
│   ├── __init__.py
│   ├── cli.py
│   ├── core.py
│   ├── schemas.py
│   ├── store.py
│   └── channels/
│       ├── __init__.py
│       ├── geeknews.py
│       ├── producthunt.py
│       ├── indiehackers.py
│       └── hackernews.py
└── tests/
```

Module roles:

- `cli.py`: `argparse` command parsing only.
- `core.py`: fetch orchestration for one channel or all channels.
- `schemas.py`: Pydantic app models.
- `store.py`: SQLite schema, upsert, and query functions.
- `channels/`: channel-specific fetch and normalization logic.
- `channels/__init__.py`: channel registry used by `channels`, `fetch`, and `fetch-all`.

This stays as one Python package for now. If a dashboard or API grows later, the repo can become a monorepo with `packages/core`, `packages/cli`, and `apps/dashboard`.

## Dependencies

Use uv for project and dependency management.

Runtime dependencies:

- `httpx`
- `feedparser`
- `pydantic`

Do not use Typer, SQLAlchemy, SQLModel, or an ORM in the MVP. `argparse` and direct SQLite are enough.

`pyproject.toml` should expose:

```toml
[project.scripts]
signal-archive = "signal_archive.cli:main"
```

## CLI

Commands:

```bash
uv run signal-archive init-db
uv run signal-archive channels
uv run signal-archive fetch --channel geeknews --limit 20
uv run signal-archive fetch-all --limit 20
uv run signal-archive list --channel geeknews --limit 20
```

Behavior:

- `init-db`: create SQLite schema.
- `channels`: print registered channels, method, and feed/API target.
- `fetch`: fetch one channel and save items. Auto-create DB if missing.
- `fetch-all`: fetch every registered channel. One failed channel must not stop the rest.
- `list`: print saved items from SQLite. It must not fetch network data or mutate the DB.

The DB path defaults to `data/signal-archive.sqlite3` and can be overridden with `SIGNAL_ARCHIVE_DB_PATH`.

## Data Model

Use Pydantic v2 for app-level validation.

`NewsItem` fields:

- `source`: stable source key, such as `geeknews`, `producthunt`, `indiehackers`, or `hackernews`.
- `source_method`: `official_rss`, `official_api`, or `unofficial_rss`.
- `external_id`: item ID from the source when available.
- `title`: item title.
- `url`: item URL. HN text posts may fall back to the HN item URL.
- `author`: author or submitter when available.
- `published_at`: source publication time when available.
- `score`: points, votes, or upvotes when available.
- `comments_count`: comment count when available.
- `tags`: list of tags or categories. Missing tags become an empty list.
- `raw`: small source-specific payload for debugging and future parser changes.

Missing scalar fields should be stored as `NULL`. Missing list fields should become `[]`.

## SQLite Schema

Use one table: `items`.

Columns:

- `id`: internal primary key.
- `source`: channel/source key.
- `source_method`: collection method.
- `external_id`: source item ID.
- `title`: saved title.
- `url`: saved URL.
- `url_hash`: normalized URL hash used for deduplication fallback.
- `dedup_key`: computed key used for one unique constraint.
- `author`: nullable author.
- `published_at`: nullable source timestamp.
- `score`: nullable score.
- `comments_count`: nullable comment count.
- `tags_json`: JSON array string.
- `raw_json`: JSON object string.
- `first_seen_at`: first local save time.
- `last_seen_at`: most recent local observation time.

Deduplication:

- Compute `dedup_key = "external:" + external_id` when `external_id` exists.
- Otherwise compute `dedup_key = "url:" + url_hash`.
- Enforce `UNIQUE(source, dedup_key)`.

Update policy:

- Keep `first_seen_at`.
- Update `last_seen_at`, `title`, `score`, `comments_count`, and `raw_json` when an item is seen again.

Search:

- MVP uses simple title `LIKE` search or channel-filtered listing.
- SQLite FTS5 or Postgres full-text search can be added later.

## Channel Behavior

Each channel module should expose a fetch function with this contract:

```python
def fetch(limit: int) -> list[NewsItem]:
    ...
```

Channel notes:

- GeekNews and Product Hunt use `feedparser`.
- Indie Hackers uses `feedparser` against the unofficial `feed.indiehackers.world` RSS feed. Store `source_method = "unofficial_rss"`.
- Hacker News uses `httpx` against the Firebase API. Fetch IDs from a story list endpoint, then fetch item details.

## Error Handling

Rules:

- A failed channel must not stop `fetch-all`.
- A malformed item should be skipped and counted.
- HTTP timeout default should be 15 seconds.
- RSS parse errors should mark that channel as failed.
- DB upsert failure for one item should skip that item and continue.

Example output:

```text
geeknews: fetched=20 saved=18 updated=2 skipped=0
producthunt: fetched=20 saved=20 updated=0 skipped=0
indiehackers: failed timeout
hackernews: fetched=20 saved=17 updated=3 skipped=0
```

## Testing

Default tests should not depend on live network access.

Required test coverage:

- Channel normalization with fixture payloads.
- Pydantic validation for missing optional fields.
- SQLite init and upsert behavior.
- Deduplication by `external_id`.
- Deduplication fallback by URL hash.
- CLI smoke test for command parsing.

Manual live checks:

```bash
uv run signal-archive fetch --channel geeknews --limit 3
uv run signal-archive fetch-all --limit 3
uv run signal-archive list --limit 10
```

## Future Work

- Add X/Twitter and Reddit channels using Agent Reach login-session based collectors.
- Add Postgres once SQLite is too limiting.
- Add article/body hydration only after metadata collection is stable.
- Add dashboard as a separate app, likely under `apps/dashboard`, backed by an API or Postgres.
- Add cloud scheduling and CI/CD after local collection and schema validation are stable.
