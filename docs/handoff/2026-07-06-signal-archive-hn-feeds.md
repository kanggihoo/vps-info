# Handoff: signal_archive HN feed 개선 + 다음 단계

## 현재 상태

`signal_archive` 패키지의 Hacker News 채널 개선과 `inspect` 명령어 추가가 완료된 상태. 로컬 검증 완료. **아직 커밋 안 함** — 이 handoff와 함께 커밋 예정.

## 이번 세션에서 완료한 작업

### 1. `inspect` CLI 명령어 추가
- 각 채널의 원본 payload(feedparser entry / HN API JSON)를 DB 저장 없이 JSON 출력
- `signal_archive/channels/feed.py`: `fetch_feed_raw` 추가
- `signal_archive/channels/hackernews.py`: `fetch_raw` 추가
- `signal_archive/core.py`: `inspect_channel`, `inspect_all` 추가

### 2. HN 채널: topstories → best + show 2개 feed
- `top`/`new`/`ask`/`job` 제거, `best` + `show`만 유지 (이유는 `docs/implementation.md` "Hacker News feed 선택 이유" 섹션 참조)
- `STORY_ENDPOINTS` 딕셔너리로 feed 추상화

### 3. HN 비동기 2단계 fetch
- `httpx.AsyncClient` + `asyncio.Semaphore(20)`로 item payload 동시 fetch
- 동기 순차 대비 수배 빠름

### 4. 사전 중복 필터 (Pre-filter)
- `store.get_existing_ids(source, feed, ids)`: `IN` clause로 DB 존재 id만 조회
- 차집합은 파이썬에서 계산 → HN 랭킹 순서 보존
- HN 2단계 N+1 호출을 신규 id로만 한정 → 비용 O(M log N)

### 5. `fetch_all` 병렬화 (옵션 3)
- `ThreadPoolExecutor`로 RSS 3개 + HN best/show 2개 = 5개 작업 병렬 fetch
- 모든 NewsItem을 모아 `upsert_items` 1회 호출 (단일 write 트랜잭션)
- WAL 불필요 (읽기 1단계 / 쓰기 2단계 분리되어 충돌 없음)

### 6. DB 스키마: `feed` 컬럼 + UNIQUE 변경
- `feed TEXT` 추가 (RSS는 NULL, HN은 best/show)
- `UNIQUE(source, dedup_key)` → `UNIQUE(source, feed, dedup_key)` — 같은 HN item도 feed별 별개 row
- `idx_items_source_feed_external_id` 인덱스 추가

### 7. CLI 인터페이스
- `--type best|show`: fetch/inspect (HN 전용)
- `--feed best|show`: list 필터
- `FetchReport.feed` 추가 → 출력 라벨이 `hackernews/best` 형태

## 핵심 파일 변경

| 파일 | 변경 요약 |
|---|---|
| `signal_archive/schemas.py` | `NewsItem.feed` 필드 추가 |
| `signal_archive/store.py` | feed 컬럼, UNIQUE 변경, `get_existing_ids`, list feed 필터 |
| `signal_archive/channels/hackernews.py` | 전면 재작성: best/show, async, fetch_raw, pre-filter 지원 |
| `signal_archive/channels/feed.py` | `fetch_feed_raw` 추가 |
| `signal_archive/channels/__init__.py` | HN feeds/default_feed 메타데이터 |
| `signal_archive/core.py` | `fetch_channel_items`(fetch-only) 분리, `fetch_all` 병렬+일괄write |
| `signal_archive/cli.py` | `--type`/`--feed` 인자, `_print_report` feed 라벨 |
| `docs/implementation.md` | HN feed 선택 이유, 2단계 구조, 사전 필터, 병렬 fetch-all 흐름 문서화 |

## ⚠️ 주의: 기존 DB 마이그레이션

기존 DB(`data/signal-archive.sqlite3`)는 구 UNIQUE(`source, dedup_key`)로 생성되어 있음. `init_db`의 CREATE TABLE IF NOT EXISTS가 기존 테이블을 건너뛰므로 **자동 마이그레이션 안 됨.**

해결: 기존 DB 삭제 후 재생성 필요 (MVP 로컬 단계라 데이터 버려도 됨):
```bash
rm data/signal-archive.sqlite3
uv run signal-archive init-db
```

이미 `/tmp/test-fa.sqlite3`로 검증은 완료됨.

## 다음 세션에서 해야 할 작업

### 우선순위 1: 스키마 필드 추가 (이미 합의됨)

사용자와 논의 완료된 4개 필드 추가. `docs/implementation.md` 167-229줄 "최종 DB 스키마 업데이트 제안"과 일치.

```python
# signal_archive/schemas.py NewsItem에 추가
summary: str | None = None           # RSS summary/content, HN text
source_item_url: str | None = None   # HN 토론 URL
rank: int | None = None              # feed 내 순위
item_type: str | None = None         # HN story/job/poll
```

**변경 범위:**
- `schemas.py`: 필드 4개 추가
- `store.py`: 스키마 + upsert + list에 반영 (ALTER TABLE ADD COLUMN으로 마이그레이션)
- `channels/feed.py`: `_summary()` 헬퍼 추가 — RSS `summary` 우선, 없으면 `content[0].value`
- `channels/hackernews.py`:
  - `rank`: payloads 리스트 인덱스로 할당 (현재 fetch 루프에 `enumerate` 추가)
  - `source_item_url`: `_hn_url(item_id)` 항상 저장, `url`은 외부 링크만
  - `item_type`: `payload.get("type")`
  - `summary`: `payload.get("text")` (Ask/Show HN 본문)

### 우선순위 2: RSS summary 본문 정제

RSS `summary`/`content`는 HTML. 저장은 그대로, 표시 레이어에서 정제:
- HTML 태그 제거 (beautifulsoup4 또는 정규식)
- 본문 미리보기 길이 제한 (예: 200자)

이건 대시보드/표시 레이어 작업 시 검토.

### 우선순위 3: cron 자동화 + 운영

`docs/implementation.md` "다음 단계 후보" 참조:
- feed별 다른 폴링 주기 (best 1-2시간, show 30분)
- cloud scheduling + CI/CD
- 대시보드 app 분리

### 우선순위 4: X/Twitter, Reddit 채널

`tmp.md`에 Agent-Reach 인증 이식 정리 있음. 별도 설계 필요:
- Twitter: `auth_token`, `ct0`
- Reddit: `reddit_session`
- 코드: `agent_reach/channels/twitter.py`, `repos/Agent-Reach/docs/install.md`

## 스키마 설계 결정 (이미 합의됨)

**단일 `items` 테이블 유지.** 테이블 분리 논의했지만 기각:
- 프로젝트 목적 = "공통 형태로 정규화"
- 대시보드 통합 뷰가 핵심 (UNION 회피)
- SQLite는 NULL 저장 비용 1바이트로 미미
- 공통 컬럼 중복 방지

자세한 논거는 이번 대화 기록 참조.

## 참조 문서

- `docs/implementation.md` — 구현 메모, 스키마 제안, 채널별 수집 방식 (한국어)
- `tmp.md` — Agent-Reach 서버 인증 이식 정리 (Twitter/Reddit)

## 검증 명령어

```bash
# DB 재생성 (기존 구 스키마 DB 날리기)
rm -f data/signal-archive.sqlite3
uv run signal-archive init-db

# fetch-all 병렬 + 일괄 write
uv run signal-archive fetch-all --limit 5

# HN feed별 조회
uv run signal-archive list --channel hackernews --feed best --limit 10
uv run signal-archive list --channel hackernews --feed show --limit 10

# 원본 payload 확인
uv run signal-archive inspect --channel hackernews --type best --limit 2
```

## 다음 세션 추천 스킬

- `superpowers:brainstorming` — 스키마 필드 추가 설계 시 (작지만 패턴 유지)
- `caveman` — 응답 스타일 (이미 활성화됨, 유지)
