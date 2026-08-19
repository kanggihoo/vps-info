# Signal Archive 로컬 서비스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 CLI 수집기를 PostgreSQL 기반 Collector·FastAPI Backend·React/Vite Frontend로 전환하고, 배포 없이 로컬 통합 검증을 완료한다.

**Architecture:** Python 패키지의 채널 수집과 `NewsItem` 정규화 로직을 유지하고, SQLite 저장소를 PostgreSQL repository와 Alembic migration으로 교체한다. Collector는 네 채널을 한 번 수집하고 `job_run` 부모·자식 기록을 남긴 뒤 종료한다. Backend와 Frontend는 같은 도메인의 상대 경로 `/api`를 전제로 구성하되, 로컬에서는 Vite 개발 proxy를 사용한다.

**Tech Stack:** Python 3.12, uv, psycopg, Alembic, Tenacity, FastAPI, Uvicorn, pytest, PostgreSQL 16, React, TypeScript, Vite, Vitest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-19-signal-archive-service-transition-design.md`

## Global Constraints

- 구현 범위는 GeekNews, Product Hunt, Indie Hackers, Hacker News `best` 네 채널이다.
- 기존 SQLite 데이터는 이관하지 않으며, SQLite 저장소와 `feed` 모델은 PostgreSQL 서비스 경로에서 제거한다.
- PostgreSQL 연결 값은 `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`로만 받으며 URL 환경변수는 만들지 않는다.
- 첫 버전은 DB 계정 하나를 Collector, Backend, Alembic이 공유한다.
- 모든 아이템 중복 제거는 PostgreSQL의 `UNIQUE(source, dedup_key)`와 UPSERT가 담당한다.
- `job_run` 상태는 `RUNNING`, `SUCCESS`, `PARTIAL`, `FAILED`만 사용한다. `PARTIAL`은 부모 실행에만 사용한다.
- 네트워크 일시 오류만 재시도하며, 400/401·파싱 오류·잘못된 데이터·DB 오류는 즉시 실패한다.
- 배포, Jenkins, VPS Nginx, TLS, Basic Auth, systemd timer는 이 계획의 실행 범위가 아니다. 8장 로컬 통합 검증 결과와 사용자 승인이 있어야 별도 계획을 작성한다.
- 실제 `.env`와 비밀번호는 Git에 추가하지 않는다.

---

## 대상 파일 구조

```text
alembic.ini                                  # Alembic 실행 설정
alembic/env.py                               # 개별 POSTGRES_* 값을 Alembic 연결로 변환
alembic/versions/20260819_01_initial.py      # items와 조회 인덱스 생성
alembic/versions/20260819_02_job_runs.py     # job_run과 실행 이력 인덱스 생성
signal_archive/config.py                     # DatabaseSettings와 환경변수 검증
signal_archive/db.py                         # psycopg 연결과 transaction 경계
signal_archive/repository.py                 # items/job_run 조회·UPSERT repository
signal_archive/collector.py                  # one-shot 전체 수집과 실행 이력 확정
signal_archive/api.py                        # FastAPI 앱과 읽기 전용 endpoint
signal_archive/schemas.py                    # NewsItem 확장, API 응답 dataclass
signal_archive/core.py                       # PostgreSQL repository를 사용하는 채널 수집 흐름
signal_archive/cli.py                        # Collector 실행용 최소 CLI
signal_archive/channels/__init__.py          # HN best만 등록
signal_archive/channels/feed.py              # RSS summary/source URL 추출과 재시도 적용
signal_archive/channels/hackernews.py        # HN best 정규화와 재시도 적용
tests/conftest.py                            # 테스트 DB fixture와 migration fixture
tests/test_repository.py                     # PostgreSQL UPSERT·조회·job_run 테스트
tests/test_collector.py                      # 성공/부분 실패/DB 실패 Collector 테스트
tests/test_api.py                            # FastAPI endpoint 테스트
tests/test_channels.py                       # 네 채널 등록과 정규화·재시도 경계 테스트
Dockerfile                                   # Python Collector/Backend 이미지
compose.yml                                  # backend, frontend, collector와 외부 네트워크
compose.local.yml                            # 로컬 개발 포트와 Vite 개발 컨테이너 override
.env.example                                 # 비밀값 없는 POSTGRES_* 예시
frontend/                                    # React/Vite SPA
frontend/Dockerfile                          # 운영 정적 파일 이미지
frontend/src/api.ts                          # 상대 /api 요청 함수
frontend/src/App.tsx                         # 목록/상세/실행 이력 화면 전환
frontend/src/*.test.tsx                      # Frontend smoke 테스트
```

## Task 1: 의존성·환경 설정과 PostgreSQL 연결 단위 만들기

**Files:**
- Modify: `pyproject.toml`
- Create: `signal_archive/config.py`
- Create: `signal_archive/db.py`
- Create: `.env.example`
- Create: `tests/conftest.py`
- Create: `tests/test_config.py`

**Interfaces:**
- Produces: `DatabaseSettings.from_env(environ: Mapping[str, str]) -> DatabaseSettings`
- Produces: `DatabaseSettings.connection_kwargs() -> dict[str, str | int]`
- Produces: `connect(settings: DatabaseSettings) -> psycopg.Connection`
- Produces: pytest fixture `db_settings: DatabaseSettings`

- [ ] **Step 1: 필요한 런타임·개발 의존성을 선언한다.**

`pyproject.toml`의 runtime dependencies에 `psycopg[binary]`, `alembic`, `tenacity`, `fastapi`, `uvicorn`을 추가한다. dev dependencies에 `pytest`와 호환되는 `pytest` HTTP test 도구만 추가하고, ORM이나 별도 설정 라이브러리는 추가하지 않는다.

- [ ] **Step 2: 환경변수 누락 테스트를 먼저 작성한다.**

```python
def test_database_settings_requires_all_postgres_variables(monkeypatch):
    monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)

    with pytest.raises(ValueError, match="POSTGRES_PASSWORD"):
        DatabaseSettings.from_env(os.environ)
```

- [ ] **Step 3: 실패를 확인한다.**

Run: `rtk proxy uv run pytest tests/test_config.py -q`

Expected: FAIL because `signal_archive.config` does not exist.

- [ ] **Step 4: 최소 `DatabaseSettings`를 구현한다.**

```python
@dataclass(frozen=True)
class DatabaseSettings:
    host: str
    port: int
    database: str
    user: str
    password: str

    def connection_kwargs(self) -> dict[str, str | int]:
        return {"host": self.host, "port": self.port, "dbname": self.database,
                "user": self.user, "password": self.password}
```

공백 문자열과 숫자가 아닌 port는 `ValueError`로 거부한다. `db.py`의 `connect()`는 `psycopg.connect(**settings.connection_kwargs(), row_factory=dict_row)`만 담당하게 한다.

- [ ] **Step 5: `.env.example`과 테스트 fixture를 추가한다.**

```text
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=signal_archive
POSTGRES_USER=signal_archive
POSTGRES_PASSWORD=replace-me
```

`tests/conftest.py`는 `TEST_POSTGRES_*`가 있으면 그 값을 우선 사용하고, 없으면 테스트를 명확한 이유로 skip한다. 운영 DB 이름을 테스트 fixture에서 사용하지 않는다.

- [ ] **Step 6: 테스트를 통과시킨다.**

Run: `rtk proxy uv run pytest tests/test_config.py -q`

Expected: PASS.

- [ ] **Step 7: 변경을 커밋한다.**

```text
git add pyproject.toml uv.lock signal_archive/config.py signal_archive/db.py .env.example tests/conftest.py tests/test_config.py
git commit -m "feat: add PostgreSQL runtime settings"
```

## Task 2: Alembic 초기 스키마와 PostgreSQL item repository 만들기

**Files:**
- Create: `alembic.ini`
- Create: `alembic/env.py`
- Create: `alembic/versions/20260819_01_initial.py`
- Modify: `signal_archive/schemas.py`
- Create: `signal_archive/repository.py`
- Create: `tests/test_repository.py`

**Interfaces:**
- Consumes: `DatabaseSettings`, `connect()` from Task 1
- Produces: `ItemRepository.upsert_items(items: Sequence[NewsItem]) -> UpsertResult`
- Produces: `ItemRepository.list_items(source: str | None, start_at: datetime | None, end_at: datetime | None, limit: int, offset: int) -> list[ItemRecord]`
- Produces: `ItemRepository.get_item(item_id: int) -> ItemRecord | None`
- Produces: `ItemRepository.get_existing_external_ids(source: str, ids: Sequence[str]) -> set[str>`

`ItemRecord`은 `id`, `source`, `source_method`, `external_id`, `title`, `summary`, `url`, `source_item_url`, `author`, `published_at`, `score`, `comments_count`, `rank`, `item_type`, `tags`, `first_seen_at`, `last_seen_at`를 가진 immutable dataclass다. `UpsertResult`은 기존 `saved`, `updated` 정수 필드를 유지한다.

- [ ] **Step 1: PostgreSQL의 RSS 중복 테스트를 작성한다.**

```python
def test_upsert_keeps_one_rss_item_without_feed_column(repository):
    first = NewsItem(source="geeknews", source_method="official_rss",
                     title="first", url="https://example.com/a")
    second = replace(first, title="changed")

    assert repository.upsert_items([first]).saved == 1
    assert repository.upsert_items([second]).updated == 1
    assert len(repository.list_items(None, None, None, 10, 0)) == 1
```

- [ ] **Step 2: migration 적용 후 테스트가 실패하는지 확인한다.**

Run: `rtk proxy uv run pytest tests/test_repository.py::test_upsert_keeps_one_rss_item_without_feed_column -q`

Expected: FAIL because the migration and repository are absent.

- [ ] **Step 3: `NewsItem`에 서비스 컬럼을 추가한다.**

`NewsItem`에 `summary`, `source_item_url`, `rank`, `item_type`을 nullable로 추가한다. 기존 SQLite CLI가 아직 `feed`를 참조하므로 이 단계에서는 `feed` 필드를 유지한다. Task 4에서 HN show와 SQLite 경로를 함께 제거할 때 `feed`도 삭제한다. RSS는 새 필드를 채우지 않아도 되고 HN은 `source_item_url`, `rank`, `item_type`을 채운다.

- [ ] **Step 4: 초기 Alembic migration을 작성한다.**

Migration은 PostgreSQL에 아래를 만든다.

```sql
CREATE TABLE items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source TEXT NOT NULL,
  source_method TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT NOT NULL,
  source_item_url TEXT,
  dedup_key TEXT NOT NULL,
  author TEXT,
  published_at TIMESTAMPTZ,
  score INTEGER,
  comments_count INTEGER,
  rank INTEGER,
  item_type TEXT,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  UNIQUE (source, dedup_key)
);
```

`items(source, published_at DESC)`와 `items(last_seen_at DESC)` 인덱스도 같은 migration에 넣는다. `job_run`은 Task 3 migration에서 추가한다.

- [ ] **Step 5: 안전한 PostgreSQL UPSERT를 구현한다.**

`repository.py`에서 `ON CONFLICT (source, dedup_key) DO UPDATE`를 사용한다. 충돌 시 `first_seen_at`은 유지하고 title, summary, URL, 수집 가능한 메타데이터, `last_seen_at`만 갱신한다. 입력 목록 전체는 하나의 transaction 안에서 처리한다.

- [ ] **Step 6: HN 사전 필터와 목록 조회 테스트를 추가한다.**

```python
def test_existing_external_ids_returns_only_matching_ids(repository):
    repository.upsert_items([hn_item("1"), hn_item("2")])
    assert repository.get_existing_external_ids("hackernews", ["2", "3"]) == {"2"}

def test_list_items_filters_source_and_date(repository):
    old = NewsItem(source="geeknews", source_method="official_rss", title="old",
                   url="https://example.com/old", published_at=datetime(2026, 1, 1, tzinfo=UTC))
    recent = NewsItem(source="geeknews", source_method="official_rss", title="recent",
                      url="https://example.com/recent", published_at=datetime(2026, 2, 1, tzinfo=UTC))
    other = NewsItem(source="producthunt", source_method="official_rss", title="other",
                     url="https://example.com/other", published_at=datetime(2026, 2, 1, tzinfo=UTC))
    repository.upsert_items([old, recent, other])
    rows = repository.list_items("geeknews", datetime(2026, 1, 15, tzinfo=UTC), None, 10, 0)
    assert [row.title for row in rows] == ["recent"]
```

- [ ] **Step 7: repository와 migration 테스트를 통과시킨다.**

Run: `rtk proxy uv run alembic upgrade head`

Run: `rtk proxy uv run pytest tests/test_repository.py tests/test_schemas.py -q`

Expected: migration 적용 성공 및 PASS.

- [ ] **Step 8: PostgreSQL repository를 커밋한다.**

이 단계에서는 기존 CLI가 아직 SQLite `store.py`를 사용하므로 삭제하지 않는다. Task 4에서 core와 CLI를 PostgreSQL 경로로 바꾼 뒤 SQLite 구현을 함께 제거한다.

```text
git add alembic.ini alembic signal_archive/schemas.py signal_archive/repository.py tests/test_repository.py tests/test_schemas.py pyproject.toml uv.lock
git commit -m "feat: store archive items in PostgreSQL"
```

## Task 3: `job_run` migration과 실행 이력 repository 추가

**Files:**
- Create: `alembic/versions/20260819_02_job_runs.py`
- Modify: `signal_archive/repository.py`

**Interfaces:**
- Consumes: `ItemRepository` from Task 2
- Produces: `RunStatus = Literal["RUNNING", "SUCCESS", "PARTIAL", "FAILED"]`
- Produces: `JobRunRepository.start_run(job_key: str, triggered_by: str, parent_run_id: int | None) -> int`
- Produces: `JobRunRepository.finish_run(run_id: int, status: RunStatus, counts: RunCounts, error: RunError | None) -> None`

`RunCounts`는 `fetched`, `inserted`, `updated`, `skipped`, `retry_count` 정수 필드를 모두 0 기본값으로 가진 immutable dataclass다. `RunError`는 `error_type`, `error_message` 문자열을 가진 immutable dataclass다. `JobRunRecord`는 테이블의 모든 컬럼과 `children: list[JobRunRecord]`를 가진 dataclass다.

- [ ] **Step 1: 부모·자식 실행 이력 저장 테스트를 작성한다.**

```python
def test_run_repository_records_partial_parent_and_failed_child(run_repository):
    parent_id = run_repository.start_run("fetch-all", "manual", None)
    child_id = run_repository.start_run("producthunt", "manual", parent_id)
    run_repository.finish_run(child_id, "FAILED", RunCounts(), RunError("Timeout", "timed out"))
    run_repository.finish_run(parent_id, "PARTIAL", RunCounts(), None)

    assert run_repository.get_run_with_children(parent_id).status == "PARTIAL"
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `rtk proxy uv run pytest tests/test_repository.py::test_run_repository_records_partial_parent_and_failed_child -q`

Expected: FAIL because `job_run` repository methods are absent.

- [ ] **Step 3: `job_run` migration을 추가한다.**

`job_run`은 `BIGINT IDENTITY` primary key와 nullable `parent_run_id REFERENCES job_run(id)`를 가진다. `job_key`, `triggered_by`, timestamps, status, 여섯 count/error 필드를 만든다. status check constraint는 네 허용 값만 받고, `(parent_run_id, started_at)` 인덱스를 만든다.

- [ ] **Step 4: run repository를 구현한다.**

`start_run()`은 `RUNNING` 행을 만들고 ID를 반환한다. `finish_run()`은 timestamp, 상태, count, 오류 요약을 갱신한다. 오류 메시지는 1,000자로 자른다. 원본 응답과 traceback 전문은 DB에 넣지 않는다.

- [ ] **Step 5: 부모 목록과 상세 조회 테스트를 추가한다.**

```python
def test_list_parent_runs_excludes_child_runs(run_repository):
    parent_id = run_repository.start_run("fetch-all", "manual", None)
    run_repository.start_run("geeknews", "manual", parent_id)
    assert [run.id for run in run_repository.list_parent_runs(20, 0)] == [parent_id]
```

- [ ] **Step 6: run repository 테스트를 통과시킨다.**

Run: `rtk proxy uv run alembic upgrade head`

Run: `rtk proxy uv run pytest tests/test_repository.py -q`

Expected: 부모/자식 실행 이력과 상태 조회 테스트가 PASS.

- [ ] **Step 7: 커밋한다.**

```text
git add alembic signal_archive/repository.py tests/test_repository.py
git commit -m "feat: add collector job run storage"
```

## Task 4: 채널 범위를 네 개로 고정하고 재시도 정책 적용

**Files:**
- Modify: `signal_archive/channels/__init__.py`
- Modify: `signal_archive/channels/feed.py`
- Modify: `signal_archive/channels/hackernews.py`
- Modify: `signal_archive/core.py`
- Create: `signal_archive/collector.py`
- Modify: `signal_archive/cli.py`
- Modify: `tests/test_channels.py`
- Create: `tests/test_collector.py`
- Modify: `tests/test_cli.py`

**Interfaces:**
- Consumes: `ItemRepository.get_existing_external_ids()` from Task 2 and `JobRunRepository` from Task 3
- Produces: `fetch_channel_items(channel_name: str, limit: int, repository: ItemRepository) -> list[NewsItem]`
- Produces: CLI command `signal-archive collect --limit 20`
- Produces: `run_collector(limit: int, triggered_by: Literal["manual", "schedule"] = "manual") -> int`

- [ ] **Step 1: HN show가 등록되지 않는 테스트를 작성한다.**

```python
def test_registered_collection_jobs_are_exactly_four():
    assert collection_jobs() == [
        "geeknews", "producthunt", "indiehackers", "hackernews:best",
    ]
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `rtk proxy uv run pytest tests/test_channels.py::test_registered_collection_jobs_are_exactly_four -q`

Expected: FAIL because the current registry still exposes HN `show`.

- [ ] **Step 3: 채널 registry와 HN 정규화를 수정한다.**

`STORY_ENDPOINTS`는 `best`만 남기고, `NewsItem.feed` 인자와 CLI의 `--type`, `--feed` 옵션을 제거한다. HN은 API payload의 `type`을 `item_type`, HN discussion URL을 `source_item_url`, best 목록 위치를 `rank`에 넣는다.

- [ ] **Step 4: 재시도 경계 테스트를 작성한다.**

```python
def test_rss_timeout_is_retried(monkeypatch):
    response = FakeResponse(content=RSS_XML)
    get = Mock(side_effect=[httpx.TimeoutException("first"), httpx.TimeoutException("second"), response])
    monkeypatch.setattr("signal_archive.channels.feed.httpx.get", get)
    items = fetch_feed(source="geeknews", source_method="official_rss", url="https://example.com/rss", limit=1)
    assert len(items) == 1
    assert get.call_count == 3

def test_rss_parse_error_is_not_retried(monkeypatch):
    get = Mock(return_value=FakeResponse(content=b"not an RSS document"))
    monkeypatch.setattr("signal_archive.channels.feed.httpx.get", get)
    with pytest.raises(ValueError, match="failed to parse"):
        fetch_feed(source="geeknews", source_method="official_rss", url="https://example.com/rss", limit=1)
    assert get.call_count == 1
```

- [ ] **Step 5: Tenacity 정책을 구현한다.**

`httpx.TimeoutException`, `httpx.ConnectError`, HTTP status 429/502/503만 retryable 예외로 변환한다. exponential backoff와 jitter를 사용하고, 429 응답의 `Retry-After`가 양의 초 단위이면 그 대기 시간을 우선한다. 400/401은 즉시 `raise_for_status()`로 실패시키고 feedparser 파싱 오류에는 decorator를 적용하지 않는다.

- [ ] **Step 6: Collector 실패·lock 테스트를 작성한다.**

```python
def test_collector_records_partial_parent_and_failed_child(run_repository, monkeypatch):
    monkeypatch.setattr(collector, "fetch_channel_items", fake_fetch_with_producthunt_timeout)
    assert collector.run_collector(limit=2) == 1
    parent = run_repository.latest_parent_run()
    assert parent.status == "PARTIAL"
    assert {run.job_key: run.status for run in run_repository.child_runs(parent.id)}["producthunt"] == "FAILED"

def test_collector_exits_zero_without_run_when_lock_is_held(repository):
    with repository.hold_collector_lock():
        assert collector.run_collector(limit=1) == 0
    assert repository.parent_run_count() == 0
```

- [ ] **Step 7: core와 Collector를 PostgreSQL repository에 연결한다.**

HN의 2단계 item API 호출 전에 `get_existing_external_ids("hackernews", ids)`를 호출한다. `run_collector()`는 `fetch-all` 부모 행과 네 자식 행을 만들고, 각 성공 채널의 item을 저장한 뒤 자식 행을 확정한다. 자식 결과가 모두 확정되면 부모 상태를 아래처럼 계산한다.

```python
if failed_children == 0:
    status = "SUCCESS"
elif succeeded_children > 0:
    status = "PARTIAL"
else:
    status = "FAILED"
```

PostgreSQL `pg_try_advisory_lock`의 고정 64-bit key를 사용한다. lock을 얻지 못하면 새 run을 만들지 않고 로그 후 0을 반환한다. `PARTIAL`과 `FAILED`는 1을 반환한다. 단일 채널 CLI는 유지하되 `collect`는 `run_collector()`를 호출한다.

- [ ] **Step 8: 채널·CLI·Collector 테스트를 통과시킨다.**

Run: `rtk proxy uv run pytest tests/test_channels.py tests/test_cli.py tests/test_collector.py -q`

Expected: HN best 단독 등록, 재시도 경계, CLI 종료 코드가 PASS.

- [ ] **Step 9: SQLite 경로를 제거하고 커밋한다.**

PostgreSQL 경로로 바뀐 뒤 SQLite 전용 `store.py`, `SIGNAL_ARCHIVE_DB_PATH`, SQLite migration test, `--db` CLI 옵션을 제거한다. 삭제 전 참조를 모두 `rtk grep "store\|SIGNAL_ARCHIVE_DB_PATH\|feed" signal_archive tests`로 확인한다.

```text
git add signal_archive/channels signal_archive/core.py signal_archive/collector.py signal_archive/cli.py tests/test_channels.py tests/test_cli.py tests/test_collector.py
git rm signal_archive/store.py tests/test_store.py
git commit -m "feat: collect four channels in PostgreSQL"
```

## Task 5: 읽기 전용 FastAPI Backend 만들기

**Files:**
- Create: `signal_archive/api.py`
- Create: `tests/test_api.py`
- Modify: `signal_archive/repository.py`
- Modify: `pyproject.toml`

**Interfaces:**
- Consumes: `ItemRepository.list_items()`, `ItemRepository.get_item()`, `JobRunRepository.list_parent_runs()`, `JobRunRepository.get_run_with_children()`
- Produces: `create_app(items: ItemRepository, runs: JobRunRepository) -> FastAPI`
- Produces: `GET /api/health`, `/api/items`, `/api/items/{item_id}`, `/api/job-runs`, `/api/job-runs/{run_id}`

- [ ] **Step 1: 목록 API의 실패 테스트를 작성한다.**

```python
def test_list_items_filters_source_and_returns_pagination(client, item_repository):
    item_repository.upsert_items([geek_item(), product_item()])

    response = client.get("/api/items", params={"source": "geeknews", "limit": 10, "offset": 0})

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["source"] == "geeknews"
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `rtk proxy uv run pytest tests/test_api.py::test_list_items_filters_source_and_returns_pagination -q`

Expected: FAIL because `signal_archive.api` does not exist.

- [ ] **Step 3: 앱 factory와 공통 응답을 구현한다.**

`create_app(items: ItemRepository, runs: JobRunRepository) -> FastAPI`로 의존성을 명시한다. `/api/health`는 `{"status": "ok"}`를 반환한다. 목록 응답은 `items`, `total`, `limit`, `offset` 키를 사용한다. `limit`은 1~100만 허용한다.

- [ ] **Step 4: 상세·실행 이력 endpoint 테스트를 추가한다.**

```python
def test_get_missing_item_returns_404(client):
    assert client.get("/api/items/999").status_code == 404

def test_get_parent_run_returns_children(client, run_repository):
    parent_id = run_repository.start_run("fetch-all", "manual", None)
    run_repository.start_run("geeknews", "manual", parent_id)
    body = client.get(f"/api/job-runs/{parent_id}").json()
    assert len(body["children"]) == 1
```

- [ ] **Step 5: 읽기 전용 endpoint를 구현한다.**

`/api/items/{id}`와 `/api/job-runs/{id}`는 존재하지 않으면 404를 반환한다. `GET /api/job-runs`는 부모 실행만 최신순으로 반환하고, 상세 endpoint는 자식 실행과 오류 요약을 포함한다. POST, PUT, PATCH, DELETE route를 만들지 않는다.

- [ ] **Step 6: API 테스트를 통과시킨다.**

Run: `rtk proxy uv run pytest tests/test_api.py -q`

Expected: PASS.

- [ ] **Step 7: 커밋한다.**

```text
git add signal_archive/api.py signal_archive/repository.py tests/test_api.py pyproject.toml uv.lock
git commit -m "feat: add archive read API"
```

## Task 6: React/Vite Frontend를 최소 기능으로 구현

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/api.ts`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/App.test.tsx`
- Create: `frontend/src/styles.css`

**Interfaces:**
- Consumes: Backend JSON endpoints from Task 5
- Produces: `loadItems(filters: ItemFilters): Promise<ItemListResponse>`
- Produces: `loadItem(id: number): Promise<ItemDetail>`
- Produces: `loadJobRuns(): Promise<JobRun[]>`

```ts
type ItemFilters = { source?: string; startAt?: string; endAt?: string; limit: number; offset: number };
type ItemListResponse = { items: ItemSummary[]; total: number; limit: number; offset: number };
type ItemDetail = ItemSummary & { summary: string | null; sourceItemUrl: string | null; tags: string[] };
type JobRun = { id: number; jobKey: string; status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED"; startedAt: string; finishedAt: string | null };
```

- [ ] **Step 1: Vite React TypeScript 프로젝트와 Vitest를 생성한다.**

의존성은 `react`, `react-dom`, `react-router-dom`, `vite`, `typescript`, `vitest`, `@testing-library/react`만 사용한다. 컴포넌트 라이브러리, 상태 관리 라이브러리, Next.js는 추가하지 않는다.

- [ ] **Step 2: API 상대 경로 smoke test를 먼저 작성한다.**

```tsx
it("requests items with a relative API path", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({items: [], total: 0, limit: 20, offset: 0})));
  await loadItems({limit: 20, offset: 0});
  expect(fetch).toHaveBeenCalledWith("/api/items?limit=20&offset=0");
});
```

- [ ] **Step 3: 실패를 확인한다.**

Run: `rtk proxy npm --prefix frontend run test -- --run`

Expected: FAIL because `src/api.ts` does not exist.

- [ ] **Step 4: API client와 Vite 개발 proxy를 구현한다.**

`api.ts`는 절대 URL·컨테이너 이름·환경별 도메인을 사용하지 않고 `/api`만 사용한다. `vite.config.ts`의 개발 서버 proxy는 `/api`를 `http://backend:8000`으로 전달한다. Backend 주소는 Frontend 코드가 아니라 Vite 개발 설정에만 존재한다.

- [ ] **Step 5: 세 화면을 구현한다.**

`/`는 source·시작일·종료일 필터가 있는 목록, `/items/:id`는 항목 상세, `/runs`는 부모 실행 목록, `/runs/:id`는 자식 실행 상태와 오류 요약을 표시한다. API 실패는 화면에 짧은 오류 문구와 재시도 버튼으로 표시한다.

- [ ] **Step 6: 화면 smoke test를 작성한다.**

```tsx
it("renders a failed channel in run detail", async () => {
  render(<RunDetailPage run={partialRun} />);
  expect(await screen.findByText("producthunt")).toBeVisible();
  expect(screen.getByText("FAILED")).toBeVisible();
});
```

- [ ] **Step 7: Frontend 테스트와 production build를 통과시킨다.**

Run: `rtk proxy npm --prefix frontend run test -- --run`

Run: `rtk proxy npm --prefix frontend run build`

Expected: 테스트와 Vite build 모두 성공.

- [ ] **Step 8: 커밋한다.**

```text
git add frontend
git commit -m "feat: add archive dashboard"
```

## Task 7: 로컬 Docker Compose와 컨테이너 경계 만들기

**Files:**
- Create: `Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`
- Create: `compose.yml`
- Create: `compose.local.yml`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: `POSTGRES_*` from `.env`, backend `create_app()`, collector `run_collector()`
- Produces: Compose services `backend`, `frontend`, `collector`
- Produces: external networks `vps_proxy`, `vps_data`

- [ ] **Step 1: Compose 서비스 경계 검증을 작성한다.**

`compose.yml`을 YAML parser로 읽는 작은 테스트 또는 `docker compose config` 검증 스크립트를 추가한다. 다음을 assert한다.

```text
collector: vps_data만 연결, ports 없음, restart 없음
backend: vps_proxy와 vps_data 연결, ports 없음
frontend: vps_proxy만 연결, ports 없음
```

- [ ] **Step 2: 검증이 실패하는지 확인한다.**

Run: `rtk proxy docker compose -f compose.yml config`

Expected: FAIL because Compose 파일이 없다.

- [ ] **Step 3: Python과 Frontend production 이미지를 작성한다.**

Python image는 `uv sync --frozen`으로 런타임 의존성을 설치하고 `backend`에는 `uvicorn signal_archive.api:app --host 0.0.0.0 --port 8000`을 사용한다. `collector`는 같은 image의 command override로 `signal-archive collect --limit 20`을 사용한다.

Frontend Dockerfile은 Vite build를 수행한 뒤 `nginx:alpine`에 정적 산출물만 복사한다. Frontend 내부 Nginx는 `try_files $uri $uri/ /index.html;`로 SPA 새로고침을 처리한다.

- [ ] **Step 4: base Compose와 local override를 작성한다.**

base Compose는 외부 `vps_proxy`, `vps_data` 네트워크만 참조한다. `compose.local.yml`에서만 `backend` 8000, Vite 5173 host port를 publish하고 Frontend service를 Vite 개발 command로 바꾼다. PostgreSQL service는 어느 Compose에도 추가하지 않는다.

- [ ] **Step 5: `.env`·문서 경계를 정리한다.**

`.gitignore`에 `.env`를 넣고 `.env.example`은 유지한다. README에는 다음 로컬 순서만 추가한다.

```text
1. vps-infra에서 PostgreSQL과 vps_data를 실행
2. vps-info에 .env를 생성
3. Alembic migration 적용
4. compose.local.yml로 backend/frontend 실행
5. collector를 일회 실행
```

Jenkins·Nginx·systemd 배포 명령은 README에 추가하지 않는다.

- [ ] **Step 6: Compose build와 경계 검증을 통과시킨다.**

Run: `rtk proxy docker compose --env-file .env -f compose.yml -f compose.local.yml config`

Run: `rtk proxy docker compose --env-file .env -f compose.yml -f compose.local.yml build`

Expected: config와 두 image build가 성공하고 base Compose에 host port가 없다.

- [ ] **Step 7: 커밋한다.**

```text
git add Dockerfile frontend/Dockerfile frontend/nginx.conf compose.yml compose.local.yml .gitignore README.md
git commit -m "feat: add local service containers"
```

## Task 8: 8장 로컬 통합 검증을 실행하고 결과를 문서화

**Files:**
- Create: `docs/verification/2026-08-19-local-service-validation.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1~7의 Compose 서비스와 API
- Produces: 배포 단계 진행 여부를 판단하는 로컬 검증 결과

- [ ] **Step 1: 별도 로컬 테스트 DB를 준비한다.**

`vps-infra`의 PostgreSQL 안에 개발 DB와 다른 `signal_archive_test` DB를 만들고 `TEST_POSTGRES_*`를 로컬 shell에 설정한다. 테스트가 `signal_archive` 개발 DB를 수정하지 않는지 확인한다.

- [ ] **Step 2: 전체 Python·Frontend 테스트를 실행한다.**

Run: `rtk proxy uv run pytest -q`

Run: `rtk proxy npm --prefix frontend run test -- --run`

Expected: 모든 테스트 PASS.

- [ ] **Step 3: 빈 개발 DB에 migration을 적용한다.**

Run: `rtk proxy uv run alembic upgrade head`

Expected: `items`, `job_run`, Alembic version 테이블 생성.

- [ ] **Step 4: Compose로 Backend·Frontend를 실행한다.**

Run: `rtk proxy docker compose --env-file .env -f compose.yml -f compose.local.yml up -d --build backend frontend`

Expected: backend와 frontend가 healthy 상태이며 PostgreSQL은 `vps-infra`의 기존 컨테이너를 사용한다.

- [ ] **Step 5: Collector one-shot을 실행한다.**

Run: `rtk proxy docker compose --env-file .env -f compose.yml -f compose.local.yml run --rm --no-deps collector`

Expected: 네 채널이 처리되고 container가 종료 후 남지 않는다. 전체 성공은 0, 채널 일부 실패는 1이며 DB에는 부모·자식 `job_run`이 남는다.

- [ ] **Step 6: API와 브라우저 흐름을 확인한다.**

Run: `rtk proxy curl -fsS http://localhost:8000/api/health`

Run: `rtk proxy curl -fsS "http://localhost:8000/api/items?limit=20"`

브라우저에서 `http://localhost:5173`, 항목 상세, `/runs`, run 상세를 확인한다. Vite proxy를 통해 `/api` 요청이 Backend에 도달하는지 개발자 도구 Network 탭에서 확인한다.

- [ ] **Step 7: 중복·부분 실패 수동 확인을 수행한다.**

동일 fixture 또는 안전한 제한값으로 Collector를 두 번 실행한 뒤 `items` 수가 중복 증가하지 않고 `last_seen_at`만 갱신되는지 확인한다. Product Hunt fetcher를 timeout fixture로 대체해 부모가 `PARTIAL`, 해당 자식이 `FAILED`가 되는 자동 테스트 결과를 검증 문서에 기록한다.

- [ ] **Step 8: 결과를 문서화하고 커밋한다.**

검증 문서에는 실행 날짜, 명령, PASS/FAIL, 실제 `job_run` 상태, 발견한 차단 이슈를 기록한다. 이 문서는 Jenkins·Nginx·systemd 배포 계획을 시작할 수 있는 사용자 승인 근거다.

```text
git add docs/verification/2026-08-19-local-service-validation.md README.md
git commit -m "docs: record local service validation"
```

## 계획 자체 검토

- 사양 1~7장은 Tasks 1~7에 각각 대응한다. 채널 범위와 재시도는 Task 4, DB와 실행 이력은 Tasks 2~3, API/UI는 Tasks 5~6, 로컬 검증은 Tasks 7~8이 담당한다.
- 사양 8장의 배포 전 게이트는 Task 8의 검증 문서와 사용자 승인으로 강제한다.
- 사양 9의 Jenkins·Nginx·systemd는 의도적으로 이 계획에서 제외했다. 로컬 검증 결과 뒤에 별도 배포 계획으로 다룬다.
- `DATABASE_URL`, `feed`, HN `show`, 외부 registry, 자동 백업, 배포 단계는 계획의 구현 범위에 포함하지 않는다.
