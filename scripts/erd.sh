#!/usr/bin/env bash
# 배포된 DB의 스키마로 Liam ERD를 만들어 nginx가 서빙하는 볼륨(vps_erd_site)의 /vps-info/를 교체한다(docs/guides/erd.md).
# 운영 VPS의 저장소 루트에서 실행한다. scripts/deploy.sh가 마이그레이션이 바뀐 배포 뒤에 부르고, 수동으로 다시 만들 때도 쓴다.
#
# 입력을 schema.ts가 아니라 pg_dump로 받는 이유: COMMENT(테이블·컬럼 설명)가 ERD에 나온다.
# 파일은 bind mount 대신 docker cp로 주고받는다. 컨테이너가 root로 쓴 파일이 checkout에 남지 않게 하기 위해서다.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

build="vps-info-erd-build-$$"
pub="vps-info-erd-pub-$$"
trap 'docker rm -f "$build" "$pub" >/dev/null 2>&1 || true; rm -rf schema.sql erd-dist' EXIT

# drizzle 스키마는 마이그레이션 기록 테이블이라 ERD에서 뺀다.
docker exec vps-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --schema-only --no-owner --no-privileges --exclude-schema=drizzle > schema.sql

docker create --name "$build" -w /tmp node:22-slim \
    npx -y @liam-hq/cli@0.7.24 erd build --format postgres --input schema.sql --output-dir dist >/dev/null
docker cp schema.sql "$build:/tmp/schema.sql"
docker start -a "$build"
docker cp "$build:/tmp/dist" erd-dist

# 숨김 폴더에 먼저 복사한 뒤 바꿔치기해서 복사 도중의 파일을 nginx가 내보내지 않게 한다.
docker create --name "$pub" -v vps_erd_site:/erd alpine:3.24 \
    sh -c 'chmod -R a+rX /erd/.vps-info.new && rm -rf /erd/vps-info && mv /erd/.vps-info.new /erd/vps-info' >/dev/null
docker cp erd-dist "$pub:/erd/.vps-info.new"
docker start -a "$pub"
