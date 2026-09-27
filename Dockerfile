# 서버와 수집기가 함께 쓰는 Dockerfile. target만 나눈다(ADR-0004).
# TypeScript는 빌드하지 않고 Node가 직접 실행한다(docs/conventions/typescript.md).

FROM node:22-slim AS base
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY drizzle ./drizzle
COPY src ./src

# 개발 의존성(React, Vite, Vitest 등)까지 설치한 단계. 화면 빌드와 테스트가 쓴다.
FROM node:22-slim AS development-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM development-dependencies AS web-build
COPY vite.config.ts ./
COPY src/api-types.ts ./src/api-types.ts
COPY web ./web
RUN npx vite build

# DB 통합 테스트용. compose.local.yml의 test 서비스가 쓴다.
FROM development-dependencies AS test
COPY . .
CMD ["npx", "vitest", "run"]

# 수집기 이미지에는 화면 빌드 결과를 넣지 않는다. 화면만 바뀐 배포에서 수집기가 재시작되지 않게 하기 위해서다.
FROM base AS collector
CMD ["node", "src/collector/main.ts"]

FROM base AS app
COPY --from=web-build /app/web/dist ./web/dist
CMD ["node", "src/server/main.ts"]
