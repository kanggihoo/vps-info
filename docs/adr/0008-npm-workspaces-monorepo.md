# ADR-0008: 저장소를 npm workspaces 모노레포(apps/backend, apps/web, packages/api-types)로 나눈다

- 상태: 수용
- 결정일: 2026-09-28
- 관련: ADR-0001, ADR-0004, ADR-0007

## 배경

서버·수집기와 화면이 package.json 하나를 함께 썼다. 운영 이미지에 화면 패키지가 들어가지 않게 하려고 React·Tailwind·lucide까지
전부 `devDependencies`에 넣어, dev/prod 구분을 "실행 이미지에 넣을지"로 대신 쓰고 있었다. 루트 스크립트에는 `dev:web`·`design:*`·`ui:add`와
`db:generate`·`test:db`가 섞였고, ADR-0007에서 이미 `web/tsconfig.json`을 따로 두었다. 화면에 package.json이 없어 shadcn CLI가 화면을 프로젝트로 인식하지도 못했다.

server와 collector는 DB 스키마(`src/db`), Feed 선언(`src/feed-definitions.ts`), 의존성, Docker `base` 단계를 모두 함께 쓴다.
두 앱 사이에 실제로 공유하는 것은 API 응답 타입(`src/api-types.ts`) 하나였다.

## 결정

1. **구조**: 루트는 워크스페이스를 묶고 명령을 넘기기만 한다. 코드는 `apps/backend`(server + collector), `apps/web`(화면), `packages/api-types`(API 응답 타입)에 둔다.
2. **경계**: server와 collector는 한 워크스페이스로 둔다. 진입점만 둘이다(`src/server/main.ts`, `src/collector/main.ts`).
3. **공유**: 화면과 서버는 `@trendboda/api-types`를 패키지 이름으로 import한다. 이 패키지는 타입만 export하고 빌드하지 않는다(`exports`가 `.ts`를 가리킨다).
4. **의존성**: 각 워크스페이스가 쓰는 것만 자기 package.json에 둔다. 화면의 React·lucide 등은 화면의 `dependencies`다. lockfile은 루트 하나다.
5. **타입 설정**: 공통 옵션은 `tsconfig.base.json`, 모듈 해석은 워크스페이스별(backend·api-types는 nodenext, web은 bundler + Node용 `tsconfig.node.json`).
6. **Docker**: 모든 워크스페이스의 package.json을 복사한 뒤 단계마다 필요한 워크스페이스만 설치한다(`npm ci --omit=dev -w @trendboda/backend`, `npm ci -w @trendboda/web`). 서버·수집기 컨테이너의 작업 디렉터리는 `/app/apps/backend`다.
7. **경로 해석**: 마이그레이션 폴더와 화면 빌드 결과는 실행 위치(cwd)가 아니라 파일 위치(`import.meta.dirname`) 기준으로 찾는다.

### 경로 대응

| 이전 | 이후 |
|---|---|
| `src/` | `apps/backend/src/` |
| `src/api-types.ts` | `packages/api-types/src/index.ts` |
| `drizzle/`, `drizzle.config.ts` | `apps/backend/drizzle/`, `apps/backend/drizzle.config.ts` |
| `web/`, `vite.config.ts`, `scripts/` | `apps/web/`, `apps/web/vite.config.ts`, `apps/web/scripts/` |
| `tsconfig.json`, `vitest.config.ts` | `tsconfig.base.json` + 워크스페이스별 `tsconfig.json`·`vitest.config.ts` |

## 검토한 대안들

### 루트를 백엔드로 두고 `web`만 워크스페이스로 추가

- 장점: 옮기는 파일이 적다.
- 단점: 루트가 백엔드 패키지이면서 워크스페이스 루트여서, 루트의 `npm install`·스크립트·tsconfig가 백엔드 것인지 저장소 전체 것인지 헷갈린다. web과 백엔드가 대등하지 않다.
- 기각 사유: 구조를 한 번 바꾸는 김에 역할이 분명한 형태로 간다.

### server와 collector도 각각 워크스페이스로 분리

- 장점: 수집기와 API의 의존성이 완전히 갈린다.
- 단점: 공유하는 DB 스키마·Feed 선언·DB 클라이언트를 `packages/db`, `packages/feeds`로 더 쪼개야 한다.
- 기각 사유: 둘은 같은 이미지 바탕과 코드를 쓰고, 지금 규모에서는 쪼갤 이득이 없다.

## 이유

화면과 백엔드는 실행 환경(브라우저·Node), 빌드 여부(Vite 번들·타입 제거 실행), 도구(Tailwind·shadcn·Drizzle)가 모두 다르다.
워크스페이스로 나누면 각자의 의존성·스크립트·tsconfig가 제자리에 놓이고, 공유 계약은 `api-types` 한 곳으로 드러난다.
대신 Dockerfile과 문서의 경로가 모두 바뀌고, 워크스페이스 명령(`-w`)을 알아야 한다.

## 결과

- 의존성을 추가할 때 워크스페이스를 지정한다(`npm i <패키지> -w @trendboda/web`).
- `npm ci`가 lockfile과 워크스페이스 목록을 맞춰 보므로 Docker의 모든 단계가 모든 워크스페이스의 package.json을 복사한다. 그래서 화면의 의존성만 바뀌어도 서버·수집기 이미지의 설치 단계 캐시가 깨진다. 화면 소스만 바뀐 배포에서는 여전히 수집기 이미지가 그대로다(ADR-0004).
- 서버는 화면 빌드 결과를 `apps/web/dist`에서 찾는다. 두 워크스페이스의 상대 위치에 기대는 유일한 곳이다.
- 컨테이너 안 명령의 경로는 `/app/apps/backend` 기준이라 그대로다(`node src/collector/main.ts --once hn-best`).
