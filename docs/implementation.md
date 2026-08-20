# Signal Archive 구현 메모

## 목적

Signal Archive는 여러 기술/뉴스 채널의 목록 메타데이터를 공통 형태로 정규화한 뒤 SQLite에 저장합니다.

첫 버전의 목표는 cloud 배포가 아니라 로컬에서 수집 방식과 저장 구조를 검증하는 것입니다.

## 구조

```text
signal_archive/
  main.py            # uvicorn ASGI 진입점
  cli.py             # argparse 기반 CLI
  core.py            # fetch orchestration
  collector.py       # one-shot 수집과 실행 이력 확정
  config.py          # Pydantic Settings
  db.py              # connect(one-shot) / make_pool(API)
  schemas.py         # Pydantic ArchiveItem, FetchResult
  api/
    __init__.py      # create_app
    deps.py          # 요청당 커넥션 대여와 repository 주입
    errors.py        # 도메인 예외와 전역 handler
    responses.py     # API 응답 모델
    routes/          # health, items, job_runs
  repository/
    records.py       # row 모델
    items.py         # items UPSERT·조회
    job_runs.py      # 실행 이력
  sources/           # Source별 수집기
```

`cli.py`는 사용자 명령만 처리합니다. 수집 흐름은 `core.py`·`collector.py`, DB 작업은 `repository/`, 외부 Source별 로직은 `sources/`에 둡니다.

API는 sync route를 threadpool에서 실행하므로 요청마다 `deps.py`가 pool에서 커넥션을 하나씩 대여합니다. psycopg 커넥션은 thread-safe하지 않고, 하나를 공유하면 모든 요청이 직렬화됩니다. one-shot collector는 단일 스레드라 `connect()`를 그대로 사용합니다.

## 데이터 흐름

```text
CLI -> core -> channel fetch -> NewsItem -> store.upsert_items -> SQLite
```

각 채널은 서로 다른 RSS/API 구조를 갖지만, 저장 전에는 모두 `NewsItem`으로 변환합니다.

저장과 무관하게 원본 payload만 확인하는 평행 흐름도 있습니다.

```text
CLI inspect -> core.inspect_* -> channel fetch_raw -> raw payload (저장 안 함)
```

`fetch`는 `NewsItem`으로 정규화하며 일부 필드만 `raw`에 담지만, `fetch_raw`는 feedparser entry 전체 또는 HN API item JSON을 그대로 반환합니다. DB 스키마에 새 필드(`summary`, `source_item_url`, `rank`, `item_type` 등)를 추가하기 전에 원본에 어떤 값이 오는지 확인할 때 사용합니다.

Hacker News는 2단계 호출 + 사전 필터 흐름을 따릅니다.

```text
CLI fetch(hackernews) -> core._fetch_hackernews_items
  -> hackernews._fetch_ids(feed)              # 1단계: id 리스트
  -> store.get_existing_ids(...)              # 사전 필터: DB에 있는 id 제외
  -> hackernews.fetch_payloads(new_ids)       # 2단계: 신규 id만 async fetch
  -> hackernews.fetch(payloads=...)           # NewsItem 정규화
  -> store.upsert_items                       # SQLite
```

`fetch-all`은 병렬 fetch + 일괄 write 2단계로 동작합니다.

```text
1단계 (병렬, ThreadPoolExecutor):
  geeknews / producthunt / indiehackers / hackernews:best / hackernews:show
  각 작업이 독립 스레드에서 네트워크 fetch (HN은 내부적으로 async)
  HN은 fetch 전 get_existing_ids(DB 읽기)로 신규 id만 2단계 호출

2단계 (순차, 단일 write):
  모든 NewsItem을 한 리스트로 모아 upsert_items 1회 호출
  SQLite connection 1회 열고 닫음
```

네트워크 I/O가 병렬로 처리되고 DB 쓰기는 단일 트랜잭션으로 직렬화됩니다. SQLite는 writer 1개만 허용하므로 쓰기를 한 번에 모으는 쪽이 자연스럽고, WAL 모드 없이도 읽기(1단계 사전 필터)와 쓰기(2단계)가 단계 분리되어 있어 충돌이 없습니다.

## 저장 규칙

- 공통 table 이름은 `items`입니다.
- source별로 없는 scalar 값은 `NULL`로 저장합니다.
- 태그가 없으면 `[]`로 저장합니다.
- 원본 확인에 필요한 작은 payload는 `raw_json`에 저장합니다.
- 중복 제거는 `source + dedup_key`로 처리합니다.
- `external_id`가 있으면 `external:{external_id}`를 사용합니다.
- `external_id`가 없으면 정규화한 URL hash로 `url:{url_hash}`를 사용합니다.
- 중복 제거는 `source + feed + dedup_key`로 처리합니다. 같은 HN item이라도 feed가 다르면(best/show) 별개 row로 저장됩니다.
- `feed` 컬럼은 HN의 `best`/`show`처럼 한 source 내 하위 분류를 구분합니다. RSS 채널은 `NULL`입니다.
- `idx_items_source_feed_external_id` 인덱스가 사전 중복 필터(`get_existing_ids`)와 feed별 조회를 지원합니다.

## 채널별 수집 방식

- GeekNews: `https://news.hada.io/rss/news`
- Product Hunt: `https://www.producthunt.com/feed`
- Indie Hackers: `https://feed.indiehackers.world/posts.rss`
- Hacker News: `best` (`/v0/beststories.json`) + `show` (`/v0/showstories.json`) 두 feed

Indie Hackers feed는 공식 RSS가 아니므로 DB의 `source_method`는 `unofficial_rss`로 저장합니다.

### Hacker News feed 선택 이유

HN API는 `top`/`new`/`best`/`ask`/`show`/`job` 6개 stories 엔드포인트를 제공하지만, 정보수집 목적상 아래 2개만 사용합니다.

| feed | 사용 | 이유 |
| --- | --- | --- |
| `best` | O | 점수 기반 고품질 상위. 메인스트림 기술 신호 |
| `show` | O | Show HN. 사이드 프로젝트/도구 발견에 강함 |
| `top` | X | `new`가 상위집합. 중복 |
| `new` | X | 잡음 많음. 품질 미보장 |
| `ask` | X | 질문/토론 위주. 정보수집 가치 낮음 |
| `job` | X | 한국과 맥락 다름. 제외 |

`best`와 `show`는 교집합이 작아 feed별 독립 저장이 자연스럽습니다.

### Hacker News 2단계 호출 구조

HN API는 id 리스트만 주므로 item별 추가 호출이 필요합니다.

```text
1단계: GET /v0/{feed}stories.json -> [id, id, ...]  (최대 500개, 1회 요청)
2단계: GET /v0/item/<id>.json       -> {실제 story payload}  (id마다 1회)
```

2단계는 `httpx.AsyncClient` + `asyncio.Semaphore(20)`로 동시 처리합니다. 동기 순차 호출 대비 수배 빠름.

### Hacker News 사전 중복 필터

2단계 N+1 호출 비용을 줄이기 위해, 이미 DB에 있는 id는 2단계에서 스킵합니다.

```text
1단계: ids = feed 리스트 (500개)
사전 필터: existing = get_existing_ids(source, feed, ids)  # IN-clause, O(M log N)
2단계: new_ids = ids - existing (최대 limit개)만 async fetch
```

`get_existing_ids`는 `external_id IN (?, ?, ...)`로 DB에 있는 id만 가져옵니다. 기존 row 전체 로드가 아니라 API id(최대 500)만 질의하므로 데이터가 쌓여도 비용이 일정합니다. `idx_items_source_feed_external_id` 인덱스가 이 질의를 지원합니다.

차집합은 파이썬에서 계산해 HN 랭킹 순서를 보존합니다 (`NOT IN`은 DB 순서를 따라 랭킹이 깨짐).

## 수동 확인

```bash
uv run signal-archive channels
uv run signal-archive fetch --channel geeknews --limit 3
uv run signal-archive fetch --channel hackernews --type best --limit 5
uv run signal-archive fetch --channel hackernews --type show --limit 5
uv run signal-archive fetch-all --limit 3
uv run signal-archive list --limit 10
uv run signal-archive list --channel hackernews --feed show --limit 10
uv run signal-archive inspect --channel geeknews --limit 2
uv run signal-archive inspect --channel hackernews --type best --limit 2
uv run signal-archive inspect --limit 2
```

`fetch-all`은 일부 채널이 실패해도 나머지 채널 수집을 계속합니다. HN은 `fetch-all` 시 `best`와 `show` 두 feed를 별도 작업으로 실행합니다(RSS 3개 + HN 2개 = 총 5개 병렬 작업). 5개 작업이 스레드 풀에서 동시에 fetch한 뒤 결과를 모아 단일 트랜잭션으로 DB에 저장합니다. per-channel saved 집계는 근사치이며, 정확한 값은 `fetch --channel` 단건 실행으로 확인하세요.

`--type`은 HN 전용으로 `best`/`show` 중 하나를 고릅니다. RSS 채널에는 무시됩니다.

`inspect`는 DB에 저장하지 않고 원본 payload를 JSON pretty-print로 출력합니다. `--channel`을 생략하면 4개 채널 전체를 출력하며, HN은 `{best: [...], show: [...]}`로 feed별로 분리됩니다. RSS entry의 `struct_time` 등 JSON 직렬화가 안 되는 값은 문자열로 변환됩니다.

## CLI list 스냅샷

2026-07-03 기준 현재 CLI 코드로 4개 채널을 `fetch-all --limit 3` 수집한 뒤 `list` 결과를 별도 파일로 저장했습니다.

- CLI 출력: `data/cli-list-snapshots/list-command-results.txt`
- 샘플 DB: `data/cli-list-snapshots/list-results.sqlite3`
- DB row 샘플 JSON: `data/cli-list-snapshots/items-raw-sample.json`

실행 결과는 GeekNews, Product Hunt, Indie Hackers, Hacker News 모두 `fetched=3 saved=3 updated=0`으로 성공했습니다.

## 도메인별 NewsItem 필드 제공 여부

현재 저장 기준은 `signal_archive/schemas.py`의 `NewsItem`입니다. 아래 표는 `fetch-all --limit 3`으로 실제 저장된 row와 현재 fetcher 매핑 기준입니다.

| NewsItem 필드 | GeekNews RSS | Product Hunt RSS | Indie Hackers RSS | Hacker News API |
| --- | --- | --- | --- | --- |
| `source` | 제공 | 제공 | 제공 | 제공 |
| `source_method` | `official_rss` | `official_rss` | `unofficial_rss` | `official_api` |
| `title` | 제공 | 제공 | 제공 | 제공 |
| `url` | 제공 | 제공 | 제공 | 제공 |
| `external_id` | RSS `id/guid/link` | RSS `id/guid/link` | RSS `id/guid/link` | API `id` |
| `author` | 제공 | 제공 | 미제공 | API `by` |
| `published_at` | 제공 | 제공 | 제공 | API `time` |
| `score` | 미제공 | 미제공 | 미제공 | 제공 |
| `comments_count` | 미제공 | 미제공 | 미제공 | 제공 |
| `tags` | 현재 샘플 미제공 | 현재 샘플 미제공 | 일부 제공 | 미제공 |
| `feed` | `NULL` | `NULL` | `NULL` | `best` / `show` |
| `raw` | 부분 저장 | 부분 저장 | 부분 저장 | 부분 저장 |

관찰:

- RSS 3개 채널은 공통 fetcher를 사용하므로 `score`, `comments_count`는 구조상 비어 있습니다.
- Hacker News는 점수와 댓글 수를 안정적으로 제공합니다.
- Indie Hackers는 현재 샘플에서 `author`가 비어 있고, 일부 item만 category/tag를 제공합니다.
- RSS fetcher의 `raw`는 현재 `id`, `guid`, `link`, `title`만 저장합니다. 원본 RSS가 `summary`, `description`, `content`, media 계열 필드를 제공해도 현재 DB에는 보존하지 않습니다.
- Hacker News의 `raw`도 `id`, `type`, `url`, `score`, `descendants`만 저장합니다. API payload 전체를 보존하지는 않습니다.

## 최종 DB 스키마 업데이트 제안

현재 MVP 스키마는 4개 채널의 목록 조회에는 충분합니다. 다만 최종 저장 스키마로는 아래 컬럼을 추가하는 편이 좋습니다.

| 컬럼 | 타입 | 이유 |
| --- | --- | --- |
| `summary` | `TEXT` nullable | RSS의 설명/요약/본문 preview를 검색과 목록 품질에 활용 |
| `source_item_url` | `TEXT` nullable | 원문 URL과 플랫폼 내부 item/comment URL을 분리. 특히 Hacker News discussion URL 보존에 필요 |
| `rank` | `INTEGER` nullable | feed/API 목록에서 수집 당시 순위 보존. Hacker News best/show 순서 분석에 유용 |
| `item_type` | `TEXT` nullable | Hacker News `story`, `job`, `poll` 등 타입과 향후 채널별 item 종류 저장 |

`feed` 컬럼은 이미 추가되었습니다 (HN `best`/`show` 구분, RSS는 `NULL`).

바로 추가하지 않아도 되는 후보:

- `thumbnail_url`, `media_json`: Product Hunt 같은 채널의 미디어 노출이 필요할 때 추가합니다.
- `language`: 다국어 검색/필터가 실제 요구사항이 될 때 추가합니다.
- FTS5 별도 table: 데이터가 충분히 쌓이고 `title + summary` 검색 품질이 필요할 때 검토합니다.

제안하는 최종 `items` 핵심 컬럼은 아래와 같습니다.

```sql
CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_method TEXT NOT NULL,
    external_id TEXT,
    title TEXT NOT NULL,
    summary TEXT,
    url TEXT NOT NULL,
    source_item_url TEXT,
    dedup_key TEXT NOT NULL,
    author TEXT,
    published_at TEXT,
    score INTEGER,
    comments_count INTEGER,
    rank INTEGER,
    item_type TEXT,
    feed TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    raw_json TEXT NOT NULL DEFAULT '{}',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    UNIQUE(source, feed, dedup_key)
);
```

최소 변경 순서는 `summary`, `source_item_url`, `rank`, `item_type`만 nullable로 추가하고, 기존 upsert/list 동작은 유지하는 것입니다.

## 다음 단계 후보

- SQLite 데이터가 충분히 쌓인 뒤 `summary`, `source_item_url`, `rank`, `item_type` 추가 여부 확인
- X/Twitter, Reddit은 Agent Reach 로그인 세션 기반으로 별도 설계
- 검색 품질이 부족하면 SQLite FTS5 검토
- 운영 필요가 생기면 cloud scheduling과 CI/CD 설계
- dashboard가 필요해지면 별도 app 또는 API로 분리
