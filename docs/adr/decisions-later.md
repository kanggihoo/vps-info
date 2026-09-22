# 나중에 결정할 것들

아직 결정하지 않았거나, 결정은 코드에 살아 있으나 기록이 없는 항목이다.
전부 **아키텍처 재구조화 시점**에 다시 논의한다. 결정이 나면 ADR로 옮기고 여기서 지운다.

기록일: 2026-09-22

---

## 1. feed 개념을 존치할지 결정한다

`feed`(한 Source 안의 하위 분류)는 과거에 존재했으나 현재 코드에서 사라졌다. 흔적만 남아 있다.

- `alembic/versions/20260819_01_initial.py`: `feed` 컬럼 없음. 유일 제약은 `UNIQUE(source, dedup_key)`
- `signal_archive/sources/hackernews.py`: `STORY_ENDPOINTS = {"best": ...}` — `show` 없음
- `signal_archive/sources/__init__.py`: `collection_jobs()`가 `"hackernews:best"`를 반환
- `signal_archive/core.py`: `fetch_job_items()`가 job key의 `:best` suffix를 버리고 항상 `DEFAULT_FEED` 사용
- `CONTEXT.md`의 **Job** 정의는 여전히 "Source 내 특정 피드"라고 서술

결정할 것: HN `show` 등 feed를 다시 도입하는가. 도입하지 않는다면 job key의 `:` suffix와
CONTEXT.md의 "피드" 문구를 제거한다.

## 2. Collector의 DB 오류 조기 중단이 의도인지 확정한다

`signal_archive/collector.py`의 `collect_once()`는 `psycopg.Error`가 발생하면 남은 Job을
실행하지 않고 `break`하며, 앞선 Job이 성공했더라도 Batch Run 상태를 `FAILED`로 확정한다.

이 동작은 두 문서와 어긋난다.

- `CONTEXT.md`의 **Partial Batch**: "하나 이상의 Job Run이 성공하고 하나 이상이 실패한 Batch Run"
- 삭제된 one-shot collector ADR: "각 Job의 실패는 다른 Job과 격리한다"

DB가 죽었으면 나머지 Job도 어차피 실패하므로 합리적인 동작으로 보이지만, 확정된 바 없다.
결정할 것: 의도라면 문서를 코드에 맞추고, 버그라면 코드를 고친다.

## 3. 프론트엔드의 로컬/배포 아티팩트를 통일한다

ADR-0001 위반 ①②. 로컬은 Vite dev server(`compose.local.yml`의 `target: development`),
배포는 nginx 정적 서빙(`frontend/Dockerfile` 최종 스테이지)으로 서로 다른 아티팩트다.
`frontend/nginx.conf`에 `/api` location이 없어 프로덕션 이미지가 자체 완결되지 않는다.

검토했던 선택지:

- `frontend/nginx.conf`에 `/api` → `backend:8000` proxy_pass 추가. 프로덕션 이미지가
  자체 완결되고 HMR은 유지된다. `frontend/src/api.ts`가 이미 상대경로라 코드 수정은 0줄
- 로컬도 프로덕션 nginx 이미지를 실행. 완전한 동일성, HMR 포기
- 현행 유지

## 4. 로컬 단독 실행용 PostgreSQL을 둘지 결정한다

ADR-0001 위반 ③. `compose.yml`의 `vps_proxy`·`vps_data`가 `external: true`이고 PostgreSQL
서비스가 없어, `vps-infra`를 먼저 띄우지 않으면 `git clone` 직후 아무것도 실행되지 않는다.

ADR-0004(인프라 소유권 분리)와의 긴장 지점이다. ADR-0004가 지키려는 것은 **운영** PostgreSQL의
소유권이므로, 로컬 개발용 일회성 컨테이너는 그 경계를 침범하지 않는다는 해석이 가능하다.

검토했던 선택지: `compose.local.yml`에 postgres 서비스와 로컬 네트워크 추가 / 현행 유지 /
별도 `compose.dev.yml` 신설.

## 5. 마이그레이션 실행 경로를 Docker 안으로 옮긴다

ADR-0001 위반 ④. `README.md` 3단계가 호스트에서 `uv run alembic upgrade head`를 실행해
호스트에 uv와 Python 3.12를 요구한다. `Dockerfile`은 이미 `alembic.ini`와 `alembic/`을
COPY하므로 컨테이너 실행이 가능하다.

검토했던 선택지:

- `compose.yml`에 일회성 `migrate` 서비스 추가. collector처럼 `run --rm`으로 실행
- backend 컨테이너 시작 시 자동 실행 — backend를 여러 개 띄우면 마이그레이션이 경쟁하고,
  실패해도 API가 뜬 것처럼 보인다
- 현행 유지

## 6. Archive Item 식별 범위 ADR을 다시 쓴다

기존 ADR(구 0001)은 내용을 이해할 수 없어 삭제했다. **결정 자체는 유효하며 코드에 살아 있다.**

- `alembic/versions/20260819_01_initial.py`: `UniqueConstraint("source", "dedup_key")`
- `signal_archive/repository/items.py`의 `make_dedup_key()`: `external_id`가 있으면
  `external:{external_id}`, 없으면 정규화 URL의 sha256으로 `url:{hash}`

기록해야 할 내용: 같은 URL이라도 Source가 다르면 별도 row로 저장하는 이유(Source마다 외부 ID,
점수, 댓글 수, 순위, 발견 시점이 다름), 그리고 진짜 원문 콘텐츠 단위 통합이 필요해질 때의
확장 경로(Content와 Source별 관찰 모델 분리).

## 7. one-shot Collector 실행 방식 ADR을 다시 쓴다

기존 ADR(구 0002)은 내용을 이해할 수 없어 삭제했다. **결정 자체는 유효하며 코드에 살아 있다.**

- `signal_archive/collector.py`의 `run_collector()`: `pg_try_advisory_lock`으로 중복 실행 차단
- `signal_archive/cli.py`: `collect` 명령이 한 번 수행 후 종료. 스케줄링은 외부 실행기 담당
- `compose.yml`의 `collector` 서비스: `run --rm`으로 일회성 실행
- `alembic/versions/20260819_02_job_runs.py`: `job_run` 테이블의 `RUNNING`/`SUCCESS`/`PARTIAL`/`FAILED`

기록해야 할 내용: 상주 스케줄러 대신 one-shot을 고른 이유, advisory lock과 `UNIQUE` 제약이
각각 막는 것의 차이(전자는 동시 실행, 후자는 중복 row), `PARTIAL` 상태의 의미.
2번 항목(DB 오류 조기 중단)이 먼저 확정돼야 이 ADR을 정확히 쓸 수 있다.
