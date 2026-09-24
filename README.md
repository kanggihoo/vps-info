# Signal Archive

여러 정보원(RSS, 공식 API, HTML 스크래핑)에서 링크와 메타데이터를 주기적으로 수집하고,
Feed별로 시간순으로 읽는 개인용 리더입니다. 용어는 [CONTEXT.md](./CONTEXT.md)를 따릅니다.

> 재구현 중입니다. 저장소의 Python 코드(`signal_archive/`, `alembic/`)는 이전 구현이며,
> 아래 구조로 TypeScript 재구현이 끝나면 교체됩니다.

## 구조

| 구성요소 | 역할 |
| --- | --- |
| `app` 컨테이너 | Fastify API와 React 빌드 결과를 함께 서빙합니다 |
| `collector` 컨테이너 | 상주하며 `next_run_at`이 된 Feed를 순차로 수집합니다 (ADR-0007) |
| `migrate` 컨테이너 | Drizzle 마이그레이션을 적용하고 종료합니다. `app`과 `collector`는 이 작업이 성공한 뒤에 뜹니다 |
| PostgreSQL | 운영은 `vps-infra`가 소유합니다. 로컬은 `compose.local.yml`의 전용 컨테이너를 씁니다 |

접근 제어는 상위 nginx의 Basic Auth가 맡고, 앱에는 사용자 개념이 없습니다.

## 결정 기록

- 아키텍처 결정: [docs/adr/](./docs/adr/)
- 미결 항목: [docs/adr/decisions-later.md](./docs/adr/decisions-later.md)
- 코드 규칙: [docs/conventions/typescript.md](./docs/conventions/typescript.md)
