# 서버와 수집기가 함께 쓰는 Dockerfile. target만 나눈다(ADR-0007).
# TypeScript는 빌드하지 않고 Node가 직접 실행한다(docs/conventions/typescript.md).

FROM node:22-slim AS base
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY drizzle ./drizzle
COPY src ./src

# 화면 빌드. React와 Vite는 빌드에만 필요하므로 이 단계에서만 개발 의존성을 설치한다.
FROM node:22-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.ts ./
COPY src/api-types.ts ./src/api-types.ts
COPY web ./web
RUN npx vite build

# 수집기 이미지에는 화면 빌드 결과를 넣지 않는다. 화면만 바뀐 배포에서 수집기가 재시작되지 않게 하기 위해서다.
FROM base AS collector
CMD ["node", "src/collector/main.ts"]

FROM base AS app
COPY --from=web-build /app/web/dist ./web/dist
CMD ["node", "src/server/main.ts"]
