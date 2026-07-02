# Signal Archive

Signal Archive is a planned Python collector for archiving links and metadata from tech/news channels into SQLite.

The current repository directory may still be named `vps-info`, but the project and CLI will use `signal-archive`.

## MVP Scope

Initial channels:

- GeekNews official RSS
- Product Hunt public feed
- Indie Hackers unofficial RSS: `https://feed.indiehackers.world/posts.rss`
- Hacker News official Firebase API

Out of scope for the first version:

- X/Twitter and Reddit collection
- Cloud scheduling
- GitHub Actions deployment
- Dashboard
- Full article scraping
- Postgres

## Planned CLI

```bash
uv run signal-archive init-db
uv run signal-archive channels
uv run signal-archive fetch --channel geeknews --limit 20
uv run signal-archive fetch-all --limit 20
uv run signal-archive list --channel geeknews --limit 20
```

`fetch` saves new data to SQLite. `list` reads already saved data and does not call external sites.

## Planned Structure

```text
signal_archive/
  cli.py
  core.py
  schemas.py
  store.py
  channels/
    geeknews.py
    producthunt.py
    indiehackers.py
    hackernews.py
```

Design spec: `docs/superpowers/specs/2026-07-03-signal-archive-design.md`
