# Handoff: Signal Archive 서비스 전환 준비

## 목적

현재 로컬 SQLite 기반 CLI 수집기를 단일 VPS에서 운영 가능한 데이터 수집·조회 서비스로 전환한다. 목표 구조는 다음과 같다.

```text
systemd timer -> one-shot Collector container -> PostgreSQL
                                             ^
Nginx -> Frontend container -> Backend API ---+
```

Collector는 상시 서비스가 아니다. 정해진 주기에 실행되어 수집·정규화·저장을 완료한 뒤 종료한다. 사용자 조회는 Backend API와 Frontend가 담당한다.

## 현재 구현 상태

- Python CLI가 GeekNews, Product Hunt, Indie Hackers RSS와 Hacker News(`best`, `show`)를 수집한다.
- 채널 데이터를 `NewsItem`으로 정규화하고 SQLite `items` 테이블에 저장한다.
- HN은 신규 ID만 비동기로 병렬 수집한다.
- `fetch-all`은 5개 채널 작업을 병렬 수집하고 저장은 일괄 처리한다.
- `inspect`는 DB를 변경하지 않고 원본 RSS/API payload를 출력한다.

구현 상세와 현재 필드 정의는 `docs/implementation.md`를, 이전 HN 작업 이력은 `docs/handoff/2026-07-06-signal-archive-hn-feeds.md`를 참조한다.

## 이번에 확정한 설계 결정

1. 단일 GitHub 저장소에서 `collector/`, `backend/`, `frontend/`, `infra/`를 함께 관리한다.
2. 상시 실행 대상은 `frontend`, `backend`, `postgres`, `nginx`다.
3. Collector는 `docker compose run --rm --no-deps collector`로만 실행한다. systemd timer가 실행 시점을 담당한다.
4. 네트워크 일시 장애만 Tenacity로 재시도한다. 400/401, 파싱 오류, 잘못된 데이터, DB 제약 오류는 즉시 실패 처리한다.
5. 실행 이력은 PostgreSQL `job_run`에 남긴다. 일부 채널만 실패할 수 있으므로 상위 실행 상태에 `PARTIAL`을 둔다.
6. 사용자 기능은 웹/API로 제공한다. CLI는 systemd와 운영자가 쓰는 Collector 실행·점검 인터페이스로 최소 유지한다.
7. Airflow, Celery, RabbitMQ, Kafka, Kubernetes는 현재 규모에서 도입하지 않는다.

## 가장 먼저 해결할 데이터 모델 결정

### RSS 중복 키 문제

현재 SQLite 스키마는 `UNIQUE(source, feed, dedup_key)`지만 RSS 항목의 `feed`가 `NULL`이다. SQLite와 PostgreSQL의 일반 UNIQUE 제약은 `NULL`들을 같은 값으로 취급하지 않으므로 RSS 중복 삽입을 막지 못한다.

PostgreSQL 이관 시 아래처럼 `feed`를 NULL이 아닌 값으로 고정한다.

```sql
feed TEXT NOT NULL DEFAULT '',
UNIQUE (source, feed, dedup_key)
```

RSS는 빈 문자열, HN은 `best`/`show`를 저장한다. 이 규칙은 Collector와 Backend 모두에서 동일해야 한다.

### 콘텐츠와 feed 관계

구현 시작 전에 하나를 선택해야 한다.

- 단순 모델: 동일 HN item이 `best`와 `show`에 속하면 feed별로 `items` 행을 각각 저장한다. 현재 CLI와 가장 가까운 모델이다.
- 정규화 모델(권장): `items`는 `UNIQUE(source, external_id)`로 콘텐츠를 한 번만 저장하고, `item_feed_memberships`에 `item_id`, `feed`, `rank`, `first_seen_at`, `last_seen_at`을 저장한다.

후자는 동일 콘텐츠의 제목·점수·댓글 수를 중복 저장하지 않고 feed별 발견 이력과 순위를 보존한다. 이 결정을 먼저 확정한 뒤 migration을 작성한다.

## 구현 순서

1. **PostgreSQL 스키마와 migration 확정**
   - `items`(또는 `items` + `item_feed_memberships`)를 생성한다.
   - `job_run` 및 필요하면 부모-자식 run 관계를 설계한다.
   - migration 도구(Alembic 또는 Backend 스택의 표준 도구)를 하나만 선택한다.

2. **Collector 이관**
   - 기존 `signal_archive/channels`, `core.py`의 수집·정규화 로직을 재사용한다.
   - SQLite `store.py`를 PostgreSQL repository로 대체한다.
   - HTTP timeout, 429, 502/503에 Tenacity backoff+jitter를 적용한다.
   - `job_run`에 시작·채널 결과·종료·오류 요약을 기록한다.
   - 실패한 Collector 프로세스는 non-zero exit code로 종료한다.

3. **컨테이너 및 스케줄러 구성**
   - production `compose.yaml`에 `postgres`, `collector`, `backend`, `frontend`, `nginx`를 정의한다.
   - Collector는 PostgreSQL에만 연결하고 외부 포트를 노출하지 않는다.
   - `infra/systemd/collector.service`에서 project directory를 명시해 compose run을 호출한다.
   - `collector.timer`에 `OnCalendar`, `Persistent=true`, 적절한 `TimeoutStartSec`를 둔다.
   - 수동 실행과 timer 실행이 겹치지 않도록 PostgreSQL advisory lock 또는 동등한 lock을 둔다.

4. **Backend와 Frontend 추가**
   - Backend는 목록, 상세, 필터(source/feed/tag/date), `job_run` 조회 API부터 제공한다.
   - Frontend는 조회 화면과 관리자 수집 이력 화면부터 만든다.
   - PostgreSQL은 외부에 공개하지 않고 Nginx만 80/443을 공개한다.

5. **배포 자동화**
   - Jenkins는 test → image build/push → VPS pull → compose 배포를 담당한다.
   - mutable `latest` 대신 Git SHA 또는 배포 버전 image tag를 사용한다.
   - Collector image도 compose가 참조하는 같은 version tag를 사용해야 다음 timer 실행부터 새 코드가 적용된다.

## job_run 권장 필드

```text
id
parent_run_id              # fetch-all 상위 실행과 채널 실행을 연결할 때 사용
job_key                    # geeknews, hackernews:best 등
triggered_by               # schedule / manual / deploy
started_at
finished_at
status                     # SUCCESS / PARTIAL / FAILED
fetched_count
inserted_count
updated_count
skipped_count
retry_count
error_type
error_message
```

오류 본문이나 raw payload 전체를 `error_message`에 저장하지 않는다. 길이를 제한한 요약을 저장하고 상세 로그는 container stdout/stderr와 journald에서 확인한다.

## 운영 원칙

- `429`는 가능하면 `Retry-After`를 존중한다.
- UPSERT는 중간 실패 후 전체 작업을 다시 실행해도 안전해야 한다.
- Collector와 Backend에는 서로 다른 DB 계정을 사용한다. Collector는 수집 관련 쓰기 권한, Backend는 읽기 중심 최소 권한을 부여한다.
- secrets는 Git에 두지 않는다. `.env` 권한과 Jenkins credentials를 사용한다.
- PostgreSQL 백업과 복구 절차를 배포 전에 검증한다.

## 완료 기준

- 동일 RSS item을 여러 번 수집해도 한 개의 logical item만 남는다.
- 동일 HN item의 feed 소속과 순위 정책이 선택한 데이터 모델대로 보존된다.
- 채널 하나의 timeout은 재시도되며, 다른 채널 수집을 막지 않는다.
- 일부 채널 실패는 `PARTIAL`, 전체 저장 실패는 `FAILED`로 `job_run`에 기록된다.
- systemd timer가 Collector를 실행하고, 종료 뒤 container가 남지 않는다.
- Backend가 PostgreSQL 데이터를 조회하고 Frontend가 이를 표시한다.

## 다음 세션 권장 스킬

- `superpowers:brainstorming`: 콘텐츠/feed 관계와 API 범위 확정 전.
- `superpowers:writing-plans`: 스키마 이관과 인프라 작업을 실제 구현 단계로 쪼갤 때.
- `superpowers:test-driven-development`: Collector 또는 Backend 기능 구현 전.
- `superpowers:using-git-worktrees`: 기존 작업 트리에 영향을 주지 않고 서비스 전환 작업을 시작할 때.
