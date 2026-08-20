# Synchronization Backlog

최신 기준은 [CONTEXT.md](../CONTEXT.md), [ADR](./adr/)과 `docs/superpowers/specs/2026-08-19-signal-archive-service-transition-design.md`다. 아래 항목은 코드 또는 기존 문서를 일괄 정리할 때 함께 처리한다.

## 용어와 구조

- `NewsItem`을 도메인 용어 `Archive Item`과 일치시키는 명칭 변경 범위를 검토한다.
- `CHANNELS`, `fetch_channel_items` 등 Source와 Job을 `Channel`로 표현하는 명칭을 `Source`·`Job` 용어에 맞게 정리한다.
- 부모 실행의 `fetch-all` 표현을 `Batch Run` 용어와 맞추되 저장된 `job_key` 호환성을 함께 검토한다.
- Source 범위 식별 규칙과 달리 “콘텐츠 자체를 한 번만 저장한다”고 표현한 최신 전환 스펙 문구를 바로잡는다.

## 구현과 최신 스펙의 차이

- Hacker News 사전 ID 필터가 기존 항목의 상세 요청을 생략하므로 점수, 댓글 수, 순위와 `last_seen_at`을 갱신하지 못한다. 요청량 절감과 재관찰 갱신 중 원하는 정책을 확정하고 구현한다.
- Hacker News 상세 항목 요청에는 RSS와 같은 429/502/503 및 `Retry-After` 재시도 정책이 없다. ID 목록과 상세 요청에 일관된 재시도 정책을 적용한다.
- `retry_count`와 `skipped_count`가 실행 이력에서 항상 0으로 남는다. 실제 재시도와 잘못된 항목 건수를 집계해 Job Run에 기록한다.
- PostgreSQL advisory lock의 획득 실패, 정상 해제와 예외 시 해제를 직접 검증하는 테스트를 추가한다.
- Frontend 항목 목록에 최신 스펙이 요구하는 시작·종료 날짜 필터를 추가한다.
- 최신 스펙은 채널 병렬 수집 흐름의 재사용을 언급하지만 현재 Job은 순차 실행된다. 운영 부하와 부분 실패 처리 방식을 기준으로 병렬 실행 필요성을 다시 결정한다.

## 오래된 문서

- `docs/implementation.md`는 제거된 SQLite 저장소, HN `show`, 이전 CLI 명령과 병렬 `fetch-all` 구조를 설명한다. PostgreSQL 기반 Collector·Backend·Frontend 구조로 다시 작성하거나 역사 문서로 명확히 표시한다.
- 이전 SQLite 설계와 계획 문서는 역사적 자료임을 표시해 최신 운영 기준으로 오인하지 않게 한다.

## 배포 승인 후 작업

- `vps-info`에 Jenkinsfile과 systemd one-shot service/timer를 추가한다.
- 운영 비밀값을 Jenkins와 systemd가 함께 읽을 영속 위치와 권한을 확정한다.
- `../vps-infra`에 Signal Archive 전용 PostgreSQL database/role 생성 절차를 반영한다.
- `../vps-infra`에 `archive.kkh-hub.tech` DNS·ACME·TLS·Nginx 라우팅과 Basic Auth 구성을 반영한다.
- 배포 전 `vps-infra`의 현재 OKF 문서와 실제 Compose 구성을 다시 대조하고, 인프라 변경은 해당 저장소의 지침에 따라 함께 문서화한다.
