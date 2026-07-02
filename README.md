# Signal Archive

Signal Archive는 기술/뉴스 채널에서 링크와 메타데이터를 가져와 SQLite에 저장하는 수집 도구입니다.

현재 저장소 디렉토리 이름은 `vps-info`일 수 있지만, 프로젝트 이름과 CLI 이름은 `signal-archive`입니다.

## 수집 채널

- GeekNews: 공식 RSS
- Product Hunt: 공개 feed
- Indie Hackers: 비공식 RSS, `https://feed.indiehackers.world/posts.rss`
- Hacker News: 공식 Firebase API

첫 버전에서는 X/Twitter, Reddit, cloud scheduling, dashboard, Postgres, 본문 scraping을 다루지 않습니다.

## 설치

```bash
uv sync
```

## 명령어

```bash
uv run signal-archive init-db
uv run signal-archive channels
uv run signal-archive fetch --channel geeknews --limit 20
uv run signal-archive fetch-all --limit 20
uv run signal-archive list --channel geeknews --limit 20
```

명령어 역할:

- `init-db`: SQLite DB와 table 생성
- `channels`: 등록된 수집 채널 목록 출력
- `fetch`: 한 채널 수집 후 저장
- `fetch-all`: 모든 채널 수집 후 저장
- `list`: 저장된 item 조회

SQLite 경로를 직접 지정:

```bash
uv run signal-archive --db data/dev.sqlite3 fetch-all --limit 5
```

환경변수로 SQLite 경로 지정:

```bash
SIGNAL_ARCHIVE_DB_PATH=data/dev.sqlite3 uv run signal-archive fetch-all --limit 5
```

## 테스트

```bash
uv run python -m unittest discover -s tests
```

## 문서

- 설계: `docs/superpowers/specs/2026-07-03-signal-archive-design.md`
- 구현 메모: `docs/implementation.md`
