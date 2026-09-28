# 서버·수집기·화면이 함께 쓰는 Dockerfile. target만 나눈다(ADR-0004, ADR-0008).
# TypeScript는 빌드하지 않고 Node가 직접 실행한다(docs/conventions/typescript.md).
#
# npm workspaces라서 설치는 저장소 루트의 lockfile 하나로 하되, 단계마다 필요한 워크스페이스만 설치한다.
# `npm ci`가 lockfile과 워크스페이스 목록을 맞춰 보므로 package.json은 모든 워크스페이스 것을 복사한다.

FROM node:22-slim AS workspace-manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/
COPY packages/api-types/package.json packages/api-types/

# 서버·수집기 실행 이미지의 바탕. 백엔드의 운영 의존성만 설치한다.
FROM workspace-manifests AS base
ENV NODE_ENV=production
RUN npm ci --omit=dev -w @signal-archive/backend
COPY packages/api-types ./packages/api-types
COPY apps/backend/drizzle ./apps/backend/drizzle
COPY apps/backend/src ./apps/backend/src
WORKDIR /app/apps/backend

# 화면 빌드. 화면 워크스페이스의 의존성만 설치한다.
FROM workspace-manifests AS web-build
RUN npm ci -w @signal-archive/web
# Vite가 tsconfig.json을 읽고, 그 파일이 루트의 공통 설정을 extends한다.
COPY tsconfig.base.json ./
COPY packages/api-types ./packages/api-types
COPY apps/web ./apps/web
RUN npm run build -w @signal-archive/web

# 테스트용. 모든 워크스페이스의 개발 의존성까지 설치한다. compose.local.yml의 test 서비스가 쓴다.
FROM workspace-manifests AS test
RUN npm ci
COPY . .
CMD ["npm", "test"]

# 수집기 이미지에는 화면 빌드 결과를 넣지 않는다. 화면만 바뀐 배포에서 수집기가 재시작되지 않게 하기 위해서다.
FROM base AS collector
CMD ["node", "src/collector/main.ts"]

FROM base AS app
COPY --from=web-build /app/apps/web/dist /app/apps/web/dist
CMD ["node", "src/server/main.ts"]
