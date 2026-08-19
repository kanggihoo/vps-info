# Signal Archive 서비스 전환 설계

## 1. 목적과 범위

Signal Archive를 로컬 SQLite 기반 CLI 수집기에서 단일 VPS에서 운영하는 웹 조회 서비스로 전환한다. 기존 수집·정규화 로직은 최대한 재사용하고, 수집은 정기 실행되는 Collector가 담당하며 조회는 Backend API와 Frontend가 담당한다.

이번 전환에서 수집하는 채널은 다음 네 개다.

- GeekNews RSS
- Product Hunt RSS
- Indie Hackers RSS
- Hacker News `best`

Hacker News `show`, GitHub Trending, X/Twitter, Reddit, 본문 스크래핑, 전문 검색, 수동 수집 버튼, 외부 이미지 registry, 자동 백업·알림은 이번 범위에서 제외한다.

기존 SQLite 데이터는 PostgreSQL로 이관하지 않는다. PostgreSQL은 빈 상태로 시작하며, 전환 이후 수집한 데이터만 저장한다.

## 2. 확정된 운영 경계

```text
인터넷
  -> archive.kkh-hub.tech
  -> vps-infra Nginx + Basic Auth
  -> Frontend 또는 Backend

vps-info
  - Collector / Backend / Frontend 코드와 Docker Compose
  - Alembic migration
  - systemd Collector timer 정의

vps-infra
  - PostgreSQL 컨테이너, 데이터 볼륨, DB 생성
  - Nginx 서브도메인 및 Basic Auth 설정
  - Jenkins 실행 환경
```

`vps-info`의 앱 Compose는 `vps-infra`가 만든 외부 Docker 네트워크를 사용한다.

- `vps_proxy`: Frontend와 Backend를 Nginx가 찾기 위한 네트워크
- `vps_data`: Backend와 Collector가 PostgreSQL에 연결하기 위한 네트워크

Collector는 `vps_data`에만 연결한다. Frontend는 `vps_proxy`에만 연결한다. Backend는 두 네트워크에 연결한다. PostgreSQL은 호스트 포트를 공개하지 않는다.

## 3. 환경변수와 배포 전제

앱 소스 저장소를 VPS에 사람이 미리 clone할 필요는 없다. Docker는 Git 저장소를 실행하는 것이 아니라 build된 image를 실행하며, source checkout은 Jenkins가 webhook 실행 시 자신의 workspace에서 수행한다.

로컬에서는 `vps-info/.env`를 사용한다. 실제 `.env`는 Git에 넣지 않고 `.env.example`만 저장한다. 운영 비밀값을 Jenkins Credentials에서 어떤 영속 경로 또는 systemd 환경 파일로 전달할지는 8장의 로컬 통합 검증이 끝난 뒤 배포 단계에서 확정한다. systemd timer는 Jenkins 실행과 별개로 나중에 실행되므로, 일회성 Jenkins 환경변수에만 의존할 수는 없다.

PostgreSQL 접속 정보는 URL 하나가 아니라 아래의 개별 변수로 관리한다. `pydantic-settings`의 `BaseSettings` 모델이 이 값을 읽고, 누락된 값·빈 문자열·숫자가 아닌 port를 앱 시작 전에 검증한다.

```text
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=signal_archive
POSTGRES_USER=signal_archive
POSTGRES_PASSWORD=...
```

Collector, Backend, Alembic은 이 다섯 값을 읽어 내부에서 접속 정보를 조합한다. 초기에는 `signal_archive` DB와 `signal_archive` 계정 하나를 모든 앱 구성요소가 공유한다. 권한 분리는 외부 공개나 보안 요구가 생길 때 추가한다.

Frontend는 API 도메인 환경변수를 사용하지 않는다.

## 4. 데이터베이스와 migration

PostgreSQL 인스턴스·볼륨·DB 생성은 `vps-infra`가 관리한다. 앱 스키마는 `vps-info`의 Alembic migration이 관리한다.

Alembic은 Python 프로젝트 의존성으로 포함한다. 개발자는 migration 파일을 저장소에 추가하고, 배포 과정은 앱 기동 전에 누적 migration을 적용한다. 운영 DB에 수동 SQL을 적용하지 않는다.

### 4.1 `items`

`items`는 콘텐츠 자체를 한 번만 저장한다. 네 채널은 원본 형식은 다르지만 모두 제목·URL·작성자·발행 시각 같은 뉴스/링크 메타데이터를 Pydantic v2 `NewsItem` 모델로 정규화·검증한 뒤 저장한다. `source`와 `title`은 공백 제거 후 비어 있으면 거부하고, `url`은 HTTP/HTTPS URL만 허용하며, 정수·datetime·tags·raw JSON의 타입도 모델에서 검증한다. 채널별로 없는 값은 `NULL`이며, 원본별 보조 정보는 `raw_json`에 보존한다. 따라서 채널별 테이블을 만들 필요가 없다.

HN은 `best`만 수집하므로 `feed` 컬럼이나 feed membership 테이블은 만들지 않는다. HN `show`처럼 동일 콘텐츠가 서로 다른 목록에 동시에 속하는 요구가 생길 때만 membership 모델을 추가한다.

주요 컬럼은 다음과 같다.

```text
id
source
source_method
external_id
title
summary
url
source_item_url
dedup_key
author
published_at
score
comments_count
rank
item_type
tags_json
raw_json
first_seen_at
last_seen_at
```

`source`와 `dedup_key`에 복합 UNIQUE 제약을 둔다.

```text
UNIQUE(source, dedup_key)
```

`dedup_key`는 외부 ID가 있으면 `external:<external_id>`, 없으면 정규화한 URL hash를 사용한다. UPSERT는 동일 항목을 새 행으로 추가하지 않고 `last_seen_at`과 바뀔 수 있는 메타데이터를 갱신한다. 이 규칙은 RSS의 `NULL feed` 때문에 생기던 기존 SQLite 중복 문제를 제거한다.

`rank`는 Hacker News `best` 목록에서 관찰한 순위이며 RSS에는 `NULL`이다. `summary`, `source_item_url`, `item_type`은 원천에서 값이 없으면 `NULL`이다. 태그와 작은 원본 payload는 JSON으로 저장한다.

목록 조회를 위해 `source + published_at`, `last_seen_at` 인덱스를 둔다. 검색 전용 인덱스는 이번 범위에 넣지 않는다.

### 4.2 `job_run`

`job_run`은 수집 실행 이력 테이블이다. 한 번의 `fetch-all`은 부모 행 하나와 채널별 자식 행 네 개를 만든다.

```text
id
parent_run_id
job_key
triggered_by
started_at
finished_at
status
fetched_count
inserted_count
updated_count
skipped_count
retry_count
error_type
error_message
```

- 부모 `job_key`: `fetch-all`
- 자식 `job_key`: `geeknews`, `producthunt`, `indiehackers`, `hackernews:best`
- `triggered_by`: 초기에는 `schedule` 또는 `manual`

상태는 네 개로 제한한다.

- `RUNNING`: 실행 중
- `SUCCESS`: 대상 작업이 정상 완료
- `PARTIAL`: 부모 작업에서 일부 채널만 실패하고 하나 이상 성공
- `FAILED`: 전체 수집 실패 또는 전체 DB 저장 실패

자식 행은 `RUNNING`, `SUCCESS`, `FAILED`만 사용한다. 오류 본문이나 raw payload 전체는 저장하지 않고, 길이가 제한된 오류 유형·요약만 `error_type`, `error_message`에 기록한다. 상세 로그는 컨테이너 stdout/stderr와 journald에서 확인한다.

## 5. Collector

Collector는 상시 서비스가 아니다. systemd timer가 매시간 한 번 시작하고, 수집·저장 후 종료되는 one-shot 컨테이너다.

```text
systemd timer
  -> docker compose run --rm --no-deps collector
  -> fetch-all
  -> PostgreSQL 저장 및 job_run 확정
  -> 종료
```

기존 채널 fetcher, `NewsItem` 정규화, HN 신규 ID 사전 필터, 채널 병렬 수집 흐름을 재사용한다. 수집 대상은 네 채널이다.

- GeekNews
- Product Hunt
- Indie Hackers
- Hacker News `best`

각 채널은 독립적으로 수집한다. 한 채널의 네트워크 실패는 다른 채널의 수집을 막지 않는다. 성공한 채널의 항목은 저장하고, 부모 실행은 `PARTIAL`로 기록한다. 어떤 채널이 실패했는지는 자식 `job_run`의 상태·오류 요약으로 확인한다.

네트워크 일시 오류만 Tenacity로 재시도한다. timeout, 연결 오류, 429, 502, 503은 backoff와 jitter를 적용하며 429는 가능하면 `Retry-After`를 따른다. 400/401, RSS 파싱 오류, 잘못된 데이터, DB 제약 오류는 즉시 실패 처리한다.

Collector 종료 규칙은 다음과 같다.

- 모든 채널 성공: 종료 코드 0, 부모 `SUCCESS`
- 일부 채널 실패: non-zero 종료, 부모 `PARTIAL`
- 전체 실패 또는 DB 저장 실패: non-zero 종료, 부모 `FAILED`

동시에 timer와 수동 실행이 겹치지 않도록 PostgreSQL advisory lock을 사용한다. lock을 얻지 못한 실행은 새 수집을 시작하지 않고 로그를 남긴 뒤 정상 종료한다.

## 6. Backend API

Backend는 기존 Python 코드와 같은 저장소에 추가하는 FastAPI 기반 ASGI 서비스로 한다. 공개 API는 만들지 않으며, Nginx와 Basic Auth 뒤의 웹 화면만 사용한다. 요청 query와 응답 본문은 Pydantic 모델로 선언해 필터 범위와 응답 타입을 검증·문서화한다.

초기 API 범위는 다음으로 제한한다.

```text
GET /api/health
GET /api/items
GET /api/items/{id}
GET /api/job-runs
GET /api/job-runs/{id}
```

`GET /api/items`는 `source`, 시작·종료 날짜 필터와 페이지네이션을 제공한다. `GET /api/job-runs/{id}`는 부모 실행이면 채널별 자식 실행 결과도 함께 반환한다. 수집을 시작하거나 데이터를 수정하는 HTTP API는 만들지 않는다.

## 7. Frontend와 Nginx 라우팅

Frontend는 React + Vite SPA로 만든다. Next.js, SSR, 별도 API 서브도메인은 사용하지 않는다.

Frontend 코드는 API의 도메인이나 컨테이너 이름을 알지 않는다. 항상 상대 경로인 `/api/...`를 호출한다.

```text
브라우저
  -> https://archive.kkh-hub.tech/
  -> vps-infra Nginx
     - /api/  -> Backend 컨테이너
     - 그 외 -> Frontend 컨테이너
```

`/api/`는 추가 공개 서비스나 서브도메인이 아니라, 하나의 `archive.kkh-hub.tech` 안에서 정적 자원 요청과 API 요청을 구분하는 내부 라우팅 규칙이다. Nginx는 내부 Docker 주소로 Backend에 HTTP 요청을 전달하며 이 주소는 브라우저에 노출하지 않는다.

Vite는 로컬 개발에서만 개발 서버로 사용한다. 운영에서는 Vite 빌드 결과물을 Frontend 컨테이너가 정적으로 제공한다. React Router의 일반적인 화면 이동은 브라우저 안에서 처리하며, 직접 URL 접속과 새로고침을 위해 Frontend 컨테이너는 SPA fallback으로 `index.html`을 제공한다.

초기 화면은 다음으로 제한한다.

- 항목 목록과 source·날짜 필터
- 항목 상세
- 최근 수집 실행 이력
- 실행 이력 상세의 채널별 성공/실패·오류 요약

전문 검색, 수동 실행, 사용자 계정, 태그 필터는 제외한다.

`archive.kkh-hub.tech` 전체에는 `vps-infra`의 기존 `notes`와 같은 Nginx Basic Auth 방식을 적용한다. 인증 파일은 Git이 아닌 VPS의 `/opt/nginx-auth/archive.htpasswd`에 둔다.

## 8. 로컬 개발과 테스트 (배포 전 게이트)

로컬에서도 운영 구조와 같은 PostgreSQL 컨테이너를 사용한다. 먼저 `vps-infra`에서 PostgreSQL과 `vps_data` 네트워크를 띄우고, `vps-info` 앱 Compose가 그 네트워크에 연결한다. 테스트 데이터는 로컬 PostgreSQL 볼륨을 지워 초기화할 수 있다.

일반 개발과 테스트에서 VPS Nginx를 항상 띄울 필요는 없다.

- Collector·저장소·Backend: 직접 또는 Compose로 테스트
- Frontend 개발: Vite 개발 서버가 `/api` 요청을 로컬 Backend로 전달
- Nginx: 새 서브도메인 최초 연결 또는 Nginx 설정 변경 시에만 VPS에서 확인

Frontend는 언제나 `/api/...`를 호출하므로, 로컬과 운영 사이에 API endpoint 코드를 바꾸지 않는다. 로컬에서는 Vite 개발 서버가, 운영에서는 VPS Nginx가 `/api`를 Backend로 전달한다.

테스트는 라이브 외부 채널에 의존하지 않는다.

- 채널 원본 fixture 기반 정규화 테스트
- PostgreSQL UPSERT와 중복 제거 테스트
- Alembic migration 적용 테스트
- `job_run` 성공·부분 실패·전체 실패 상태 테스트
- Backend 목록/상세/실행 이력 API 테스트
- Frontend의 목록·상세·실행 이력 화면 smoke test

운영 DB를 자동 테스트에 사용하지 않는다. 테스트에는 별도 테스트 DB 또는 일회성 PostgreSQL 컨테이너를 사용한다.

이 장의 검증 결과가 확인되고 사용자가 승인하기 전에는 9장의 Jenkins, Nginx, TLS, systemd 배포 작업을 시작하지 않는다.

## 9. Jenkins 배포 (8장 검증·사용자 승인 후)

현재 `vps-infra/jenkins`의 VPS 내 Docker 소켓 기반 배포 방식을 재사용한다. 단일 VPS이므로 이번 범위에서는 외부 image registry push/pull 단계를 추가하지 않는다. 이 장은 8장의 로컬 통합 검증과 사용자 승인 후에만 수행하는 후속 단계다.

`vps-info` 저장소에는 전용 Jenkinsfile을 둔다. Jenkins는 GitHub webhook으로 실행되며 다음 순서를 따른다.

```text
checkout
-> 테스트
-> 이미지 build
-> Alembic migration 적용
-> Backend/Frontend Compose 반영
-> systemd timer 반영
-> Nginx 경유 확인
```

Jenkins는 자신의 workspace에서 `vps-info`를 checkout하고 image를 build한다. 이후 Compose와 systemd가 참조할 배포 정의와 영속 환경 파일의 위치는 8장의 검증이 끝난 뒤, Jenkins 권한과 systemd 실행 방식을 함께 확인해 정한다. Jenkins가 빌드 중 사용하는 실제 비밀값은 Credentials에서 받고 Git에 기록하지 않는다.

최초 공개 시에는 `vps-infra`에서 다음 인프라 작업이 필요하다.

- DNS A 레코드 `archive` 추가
- HTTP challenge 설정에 도메인 추가
- 기존 TLS 인증서에 도메인 확장
- `archive.kkh-hub.tech` Nginx 설정과 Basic Auth 파일 추가

## 10. 이번 범위에서 제외하는 운영 항목

PostgreSQL 볼륨은 컨테이너 재생성에 대비한 영속 저장소지만, VPS 장애를 막는 백업은 아니다. Signal Archive 데이터는 원천에서 다시 수집할 수 있으므로 자동 백업과 외부 저장소 전송은 이번 전환을 막는 조건으로 두지 않는다. 데이터 보존 요구가 생기면 `pg_dump`를 VPS 외부 저장소로 전송하는 별도 작업으로 설계한다.

다음도 이번 범위에서 제외한다.

- 모니터링·알림 연동
- 공개 API와 API 키
- SSO/OIDC
- Collector 수동 실행 화면
- 추가 채널과 feed membership 모델
- PostgreSQL 계정의 Collector/Backend/migration 권한 분리

## 11. 완료 기준

- 네 채널을 매시간 수집하며, Collector 컨테이너는 실행 후 남지 않는다.
- 동일 항목을 여러 번 수집해도 `items`에 하나의 논리 항목만 유지된다.
- 일부 채널 실패 시 성공 채널 저장은 유지되고 부모 `job_run`은 `PARTIAL`이 된다.
- 실행 이력에서 실패 채널과 오류 요약을 확인할 수 있다.
- Backend와 Frontend는 PostgreSQL 데이터를 표시한다.
- `archive.kkh-hub.tech` 하나만 외부에 공개되며 Basic Auth로 보호된다.
- PostgreSQL과 앱 컨테이너는 호스트 포트를 새로 공개하지 않는다.
- 로컬과 운영에서 Frontend API 호출 코드를 변경하지 않는다.
