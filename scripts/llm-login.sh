#!/bin/bash
# Entry 대화 엔진의 구독 로그인을 llm_auth 볼륨의 auth.json에 저장한다(ADR-0018). 엔진마다 한 번, refresh가 실패하면 다시 실행한다.
# 사용: bash scripts/llm-login.sh anthropic|openai
# 로컬: COMPOSE_FILE=compose.yml:compose.local.yml bash scripts/llm-login.sh anthropic
# pi-ai CLI는 현재 디렉터리에 auth.json을 쓰므로 볼륨 마운트 지점(/llm-auth)에서 실행한다.
set -euo pipefail

case "${1:-}" in
  anthropic | openai) ;;
  *) echo "사용: bash scripts/llm-login.sh anthropic|openai" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/.."
exec docker compose run --rm -w /llm-auth llm /app/node_modules/.bin/pi-ai login "$1"
