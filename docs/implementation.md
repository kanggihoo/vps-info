# Signal Archive 구현 메모

## 목적

Signal Archive는 여러 기술/뉴스 채널의 목록 메타데이터를 공통 형태로 정규화한 뒤 SQLite에 저장합니다.

첫 버전의 목표는 cloud 배포가 아니라 로컬에서 수집 방식과 저장 구조를 검증하는 것입니다.

## 구조

```text
signal_archive/
  cli.py          # argparse 기반 CLI
  core.py         # fetch orchestration
  schemas.py      # Pydantic NewsItem
  store.py        # SQLite init/upsert/list
  channels/       # 채널별 수집기
```

`cli.py`는 사용자 명령만 처리합니다. 실제 수집 흐름은 `core.py`, DB 작업은 `store.py`, 외부 사이트별 로직은 `channels/`에 둡니다.

## 데이터 흐름

```text
CLI -> core -> channel fetch -> NewsItem -> store.upsert_items -> SQLite
```

각 채널은 서로 다른 RSS/API 구조를 갖지만, 저장 전에는 모두 `NewsItem`으로 변환합니다.

## 저장 규칙

- 공통 table 이름은 `items`입니다.
- source별로 없는 scalar 값은 `NULL`로 저장합니다.
- 태그가 없으면 `[]`로 저장합니다.
- 원본 확인에 필요한 작은 payload는 `raw_json`에 저장합니다.
- 중복 제거는 `source + dedup_key`로 처리합니다.
- `external_id`가 있으면 `external:{external_id}`를 사용합니다.
- `external_id`가 없으면 정규화한 URL hash로 `url:{url_hash}`를 사용합니다.

## 채널별 수집 방식

- GeekNews: `https://news.hada.io/rss/news`
- Product Hunt: `https://www.producthunt.com/feed`
- Indie Hackers: `https://feed.indiehackers.world/posts.rss`
- Hacker News: `https://hacker-news.firebaseio.com/v0/topstories.json`

Indie Hackers feed는 공식 RSS가 아니므로 DB의 `source_method`는 `unofficial_rss`로 저장합니다.

## 수동 확인

```bash
uv run signal-archive channels
uv run signal-archive fetch --channel geeknews --limit 3
uv run signal-archive fetch --channel hackernews --limit 3
uv run signal-archive fetch-all --limit 3
uv run signal-archive list --limit 10
```

`fetch-all`은 일부 채널이 실패해도 나머지 채널 수집을 계속합니다.

## 다음 단계 후보

- SQLite 데이터가 충분히 쌓인 뒤 schema 수정 여부 확인
- X/Twitter, Reddit은 Agent Reach 로그인 세션 기반으로 별도 설계
- 검색 품질이 부족하면 SQLite FTS5 검토
- 운영 필요가 생기면 cloud scheduling과 CI/CD 설계
- dashboard가 필요해지면 별도 app 또는 API로 분리
