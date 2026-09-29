# TypeScript Conventions

백엔드(Fastify), 수집기, 프론트엔드(React)를 모두 TypeScript로 작성한다.

## 저장소 구조

npm workspaces 모노레포다(ADR-0008). 루트 package.json은 워크스페이스를 묶고 명령을 넘겨주기만 하고, 코드는 두지 않는다.

| 워크스페이스 | 이름 | 내용 |
|---|---|---|
| `apps/backend` | `@trendboda/backend` | 서버(`src/server`)와 수집기(`src/collector`), DB 스키마·마이그레이션 |
| `apps/web` | `@trendboda/web` | React 화면, DESIGN.md, 토큰 생성·컴포넌트 추가 스크립트 |
| `packages/api-types` | `@trendboda/api-types` | 서버와 화면이 함께 쓰는 API 응답 타입(타입만) |

- 의존성은 쓰는 워크스페이스의 package.json에 넣는다(`npm i <패키지> -w @trendboda/web`). 루트에는 넣지 않는다.
- 워크스페이스끼리는 패키지 이름으로 import한다(`@trendboda/api-types`). `../../`로 다른 워크스페이스 파일을 가리키지 않는다.
- 공통 컴파일 옵션은 `tsconfig.base.json`에 두고, 모듈 해석과 대상 환경은 워크스페이스의 tsconfig가 정한다.

## 실행과 타입

- TypeScript의 strict mode를 유지하고 JavaScript 파일을 추가하지 않는다.
- 서버와 수집기는 빌드하지 않고 Node의 타입 제거 기능으로 `.ts`를 직접 실행한다(`node src/collector/main.ts`).
  `tsc`는 타입 검사(`npm run typecheck`)에만 쓴다.
- 그래서 상대 경로 import에는 `.ts` 확장자를 붙이고, 타입 제거만으로 지워지지 않는 문법
  (`enum`, `namespace`, 생성자 매개변수 프로퍼티)은 쓰지 않는다. `apps/backend/tsconfig.json`의 `erasableSyntaxOnly`가 이를 검사한다.

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
- Handler는 `apps/backend/src/collector/handlers/index.ts`에 import 한 줄로 등록하고, 파라미터 타입을 선언한다 (ADR-0006).
- HTML은 `cheerio`로 파싱하고, 파싱 함수(`parse…Page`)를 export해서 HTML 조각으로 테스트한다. `summary`는 `toSummaryText`로 만든다.
- 수집할 때마다 바뀌는 수치(점수, 댓글 수, 스타 수)는 `extra`가 아니라 `metrics`에 넣는다. Handler는 정보원이 준 순서를 바꾸지 않는다. Ranked Feed에서는 그 순서가 Rank다 (ADR-0009).
- RSSHub 라우트 코드를 복사하지 않는다. 엔드포인트와 파라미터만 참고한다 (AGPL-3.0, ADR-0006).

## 프론트엔드

- 브라우저의 HTTP 호출과 응답 타입은 프론트엔드의 API 모듈 한 곳에 둔다. 요청 경로는 상대 `/api`를 쓴다.
- 화면 코드는 `apps/web/tsconfig.json`(bundler 해석)으로, 그 워크스페이스의 설정 파일과 `scripts/`는 `tsconfig.node.json`으로 검사한다. 루트 `npm run typecheck`가 모든 워크스페이스를 돌린다 (ADR-0007).
- `apps/web/src` 안의 모듈은 `@/` 별칭으로 확장자 없이 import한다(`@/components/ui/button`). 같은 디렉터리의 상대 import는 지금처럼 확장자를 붙인다.
- 스타일은 [apps/web/DESIGN.md](../../apps/web/DESIGN.md)를 따른다. 색·글자·모서리는 토큰 유틸리티(`bg-brand`, `text-entry-title`, `rounded-lg`)로만 쓰고, Tailwind 기본 팔레트(`bg-zinc-100`)와 임의 색 값(`bg-[#123456]`)은 쓰지 않는다.
- 토큰을 바꿀 때는 `apps/web/DESIGN.md`의 YAML을 고치고 `npm run design:tokens`를 돌린다. `apps/web/src/styles/`의 생성 파일은 손으로 고치지 않는다.
- 클래스 이름을 합칠 때는 `import { cn } from "cn"`을 쓴다.
- 아이콘은 `lucide-react`만 쓴다. 이모지와 유니코드 기호를 아이콘 대신 쓰지 않는다.

### shadcn/ui

- 공통 컴포넌트는 공식 CLI로 받아 `apps/web/src/components/ui/`에 두고, 받은 파일은 고치지 않는다. 이름·주석 규칙도 적용하지 않는다. 화면 전용 컴포넌트는 `apps/web/src/`에 둔다.
- 2026-09부터 레지스트리 파일은 `@/lib/utils`가 아니라 shadcn의 `cn` 패키지를 `import { cn } from "cn"`으로 부른다.
  이 저장소는 Vite·TypeScript 별칭으로 `"cn"`을 `src/lib/class-names.ts`에 연결한다. 그 파일이 DESIGN.md 글자 단계(`text-body-sm` 등)를 등록한 `cn`을 만든다 (ADR-0007).
  `class-names.ts` 안에서는 `"cn"`을 import하지 않는다(자기 자신이 된다). 설정 API는 `cn/config`에서 가져온다.
- `init`을 다시 실행하면 `src/index.css`에 기본 팔레트·Inter 폰트·`--radius` 블록이 덧붙어 DESIGN.md 토큰을 덮어쓴다. 그 블록은 지우고 `@import "shadcn/tailwind.css"`만 남긴다.

명령은 `apps/web`에서 실행한다.

```sh
npx shadcn@latest add dialog            # 컴포넌트 추가
npx shadcn@latest add dialog --dry-run  # 바뀔 파일만 미리 보기
npx shadcn@latest add button -o         # 이미 있는 컴포넌트를 레지스트리 최신으로 덮어쓰기
npx shadcn@latest view dialog           # 설치 전에 내용 보기
npx shadcn@latest docs dialog           # 컴포넌트 사용법
npx shadcn@latest info                  # components.json·별칭 등 프로젝트 설정 확인
```

## 테스트

- 테스트는 Vitest로 작성하고, 테스트 대상 파일 옆에 `<파일명>.test.ts`로 둔다. Vitest 설정은 워크스페이스마다 있고, 루트 `npm test`가 모두 돌린다.
