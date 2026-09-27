# Signal Archive

여러 정보원(RSS, 공식 API, HTML 스크래핑)에서 링크와 메타데이터를 주기적으로 수집하고,
Feed별로 시간순으로 읽는 개인용 리더입니다. 용어는 [CONTEXT.md](./CONTEXT.md)를 따릅니다.

> 수집기, API, 화면이 동작합니다.

## 구조

| 구성요소 | 역할 |
| --- | --- |
| `app` 컨테이너 | Fastify API와 React 빌드 결과를 함께 서빙합니다 |
| `collector` 컨테이너 | 상주하며 `next_run_at`이 된 Feed를 순차로 수집합니다 (ADR-0004) |
| `migrate` 컨테이너 | Drizzle 마이그레이션을 적용하고 종료합니다. `app`과 `collector`는 이 작업이 성공한 뒤에 뜹니다 |
| PostgreSQL | 운영은 `vps-infra`가 소유합니다. 로컬은 `compose.local.yml`의 전용 컨테이너를 씁니다 |

접근 제어는 상위 nginx의 Basic Auth가 맡고, 앱에는 사용자 개념이 없습니다.

## 로컬 실행

필요한 것: Docker, Node 22.18 이상(타입 검사·테스트·마이그레이션 생성용)

```bash
cp .env.example .env            # POSTGRES_PASSWORD를 채운다. 8000 포트가 겹치면 APP_PORT를 바꾼다
docker compose -f compose.yml -f compose.local.yml up --build
```

- 화면: `http://localhost:8000` (app 컨테이너가 빌드된 화면을 서빙)
- 상태 확인: `curl localhost:8000/api/health`
- Feed 하나를 지금 수집: `docker compose -f compose.yml -f compose.local.yml run --rm collector node src/collector/main.ts --once hn-best`
- `src/`를 고치면 app과 collector가 자동으로 재시작한다

## 개발 명령

```bash
npm install
npm run dev:web        # 화면 개발 서버(HMR). /api는 app 컨테이너로 프록시한다
npm run typecheck      # 타입 검사
npm test               # 단위 테스트(DB 불필요)
npm run test:db        # DB 통합 테스트까지 전부(컨테이너에서 로컬 postgres의 별도 테스트 DB 사용)
npm run db:generate    # src/db/schema.ts를 바꾼 뒤 마이그레이션 SQL 생성
```

## 결정 기록

- 새 Feed 추가: [docs/guides/adding-a-feed.md](./docs/guides/adding-a-feed.md)
- 구조도: [docs/diagrams/](./docs/diagrams/) (아키텍처, 수집 수명주기, Fetch Attempt 시퀀스)
- 아키텍처 결정: [docs/adr/](./docs/adr/)
- 미결 항목: [docs/adr/decisions-later.md](./docs/adr/decisions-later.md)
- 코드 규칙: [docs/conventions/typescript.md](./docs/conventions/typescript.md)
