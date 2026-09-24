# TypeScript Conventions

백엔드(Fastify), 수집기, 프론트엔드(React)를 모두 TypeScript로 작성한다.

- TypeScript의 strict mode를 유지하고 JavaScript 파일을 추가하지 않는다.
- DB 접근은 Drizzle로 한다. 스키마 변경은 Drizzle 마이그레이션 파일로만 한다.
- 조회할 컬럼을 명시한다. `SELECT *`에 해당하는 전체 컬럼 조회를 쓰지 않는다 (ADR-0006).
- Entry의 `raw`는 API 응답 타입에 포함하지 않는다 (ADR-0006).
- 중복 방어는 DB 제약과 `ON CONFLICT DO NOTHING`에 맡기고, 저장 전에 조회로 확인하지 않는다 (ADR-0005).
- Handler는 코어가 주입한 HTTP 클라이언트만 쓴다. 재시도·타임아웃·저장을 Handler 안에서 구현하지 않는다 (ADR-0009).
- Handler는 `handlers/index.ts`에 import 한 줄로 등록하고, 파라미터 타입을 선언한다 (ADR-0009).
- RSSHub 라우트 코드를 복사하지 않는다. 엔드포인트와 파라미터만 참고한다 (AGPL-3.0, ADR-0009).
- 브라우저의 HTTP 호출과 응답 타입은 프론트엔드의 API 모듈 한 곳에 둔다. 요청 경로는 상대 `/api`를 쓴다.
- 테스트는 Vitest로 작성한다.
