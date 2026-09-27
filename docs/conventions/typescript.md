# TypeScript Conventions

백엔드(Fastify), 수집기, 프론트엔드(React)를 모두 TypeScript로 작성한다.

## 실행과 타입

- TypeScript의 strict mode를 유지하고 JavaScript 파일을 추가하지 않는다.
- 서버와 수집기는 빌드하지 않고 Node의 타입 제거 기능으로 `.ts`를 직접 실행한다(`node src/collector/main.ts`).
  `tsc`는 타입 검사(`npm run typecheck`)에만 쓴다.
- 그래서 상대 경로 import에는 `.ts` 확장자를 붙이고, 타입 제거만으로 지워지지 않는 문법
  (`enum`, `namespace`, 생성자 매개변수 프로퍼티)은 쓰지 않는다. `tsconfig.json`의 `erasableSyntaxOnly`가 이를 검사한다.

## 이름

- 파일과 디렉터리 이름은 kebab-case로 짓고, 열어 보지 않아도 무엇이 들었는지 알 수 있게 한다
  (`dedup-key.ts`, `fetch-attempt.ts`). `utils.ts`, `helpers.ts`, `common.ts` 같은 이름은 쓰지 않는다.
- 변수와 함수 이름은 줄여 쓰지 않는다(`def`, `cfg`, `res` 대신 `definition`, `config`, `response`).
  함수는 하는 일을 동사로 시작한다(`runFetchAttempt`, `makeDedupKey`).
- 도메인 개념은 `CONTEXT.md`의 용어를 그대로 쓴다(Feed, Entry, Handler, Dedup Key, Fetch Attempt).

## 주석

- export하는 함수·타입·상수에는 TSDoc(`/** … */`)을 단다. 무엇을 하는지와 왜 그렇게 하는지를 쓰고,
  이름만으로 알 수 없는 매개변수와 반환값은 `@param`·`@returns`로 설명한다.
- 파일 맨 위에는 그 파일의 역할을 한두 줄로 적은 TSDoc 블록을 둔다.
- 관련 ADR이 있으면 주석에 번호를 적는다(`ADR-0005`).

## DB

- DB 접근은 Drizzle로 한다. 스키마 변경은 Drizzle 마이그레이션 파일로만 한다.
- 조회할 컬럼을 명시한다. `SELECT *`에 해당하는 전체 컬럼 조회를 쓰지 않는다 (ADR-0003).
- Entry의 `raw`는 API 응답 타입에 포함하지 않는다 (ADR-0003).
- 중복 방어는 DB 제약과 `ON CONFLICT DO NOTHING`에 맡기고, 저장 전에 조회로 확인하지 않는다 (ADR-0002).

## Handler

- Handler는 코어가 주입한 HTTP 클라이언트만 쓴다. 재시도·타임아웃·저장을 Handler 안에서 구현하지 않는다 (ADR-0006).
- Handler는 `src/collector/handlers/index.ts`에 import 한 줄로 등록하고, 파라미터 타입을 선언한다 (ADR-0006).
- HTML은 `cheerio`로 파싱하고, 파싱 함수(`parse…Page`)를 export해서 HTML 조각으로 테스트한다. `summary`는 `toSummaryText`로 만든다.
- RSSHub 라우트 코드를 복사하지 않는다. 엔드포인트와 파라미터만 참고한다 (AGPL-3.0, ADR-0006).

## 프론트엔드

- 브라우저의 HTTP 호출과 응답 타입은 프론트엔드의 API 모듈 한 곳에 둔다. 요청 경로는 상대 `/api`를 쓴다.

## 테스트

- 테스트는 Vitest로 작성하고, 테스트 대상 파일 옆에 `<파일명>.test.ts`로 둔다.
