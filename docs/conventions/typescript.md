# TypeScript Conventions

- TypeScript의 strict mode를 유지하고 JavaScript 파일을 추가하지 않는다.
- HTTP 호출과 응답 타입은 `frontend/src/api.ts` 경계에 둔다.
- 브라우저의 API 요청은 상대 `/api` 경로를 사용한다.
- 테스트는 Vitest와 Testing Library로 작성한다.
- 변경 후 `npm --prefix frontend run test -- --run`과 `npm --prefix frontend run build`로 검증한다.
