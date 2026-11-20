#!/usr/bin/env bash
# 운영 VPS 배포. GitHub Actions가 GHCR에 이미지를 올린 뒤 SSH로 부른다(vps-infra ADR 0019).
#
#   SSH  authorized_keys: command="/home/kkh/app/vps-info/scripts/deploy.sh",restrict ssh-ed25519 ... vps-info-deploy
#        Actions는 `ssh kkh@<VPS> "<sha> [erd]"`를 보내고, 그 문자열은 SSH_ORIGINAL_COMMAND로 들어온다.
#   수동 ~/app/vps-info/scripts/deploy.sh <sha> [erd]     # 롤백은 이전 main 커밋 SHA를 넘긴다
#
# <sha>  배포할 main 커밋(40자). 이 커밋을 checkout하고 같은 SHA 태그의 이미지를 pull한다.
# erd    마이그레이션 변경이 없어도 ERD를 다시 만든다(처음 채우거나 실패 뒤 다시 만들 때).
#
# 전체를 { }로 감싼 이유: 아래 git checkout이 실행 중인 이 파일을 바꿔도 bash는 이미 다 읽은 내용으로 끝까지 실행한다.
{
set -euo pipefail

# SSH로 온 문자열은 외부 입력이다. 셸로 해석하지 않고 형식만 허용한다.
read -r sha mode extra <<<"${SSH_ORIGINAL_COMMAND-$*}" || true
if ! [[ "${sha:-}" =~ ^[0-9a-f]{40}$ ]] || ! [[ -z "${mode:-}" || "$mode" == erd ]] || [[ -n "${extra:-}" ]]; then
    echo "usage: deploy.sh <40자 commit sha> [erd]" >&2
    exit 2
fi

cd "$(dirname "$0")/.."

# vps-infra 배포와 같은 lock을 잡아 VPS에서 배포가 한 번에 하나만 돈다(재시작·pull 경합 방지).
exec 9>/tmp/vps-deploy.lock
flock -w 900 9 || { echo "[deploy] 다른 배포가 15분 넘게 끝나지 않는다" >&2; exit 1; }

# main 이력의 커밋만 배포한다. 배포 key가 새도 main에 없는 코드는 올릴 수 없다.
previous="$(git rev-parse HEAD)"
git fetch --quiet origin main
if ! git merge-base --is-ancestor "$sha" origin/main; then
    echo "[deploy] $sha 는 origin/main 이력에 없다" >&2
    exit 1
fi
# reset --hard가 아니라 checkout이다. 운영 checkout에 손으로 고친 tracked 파일이 있으면 덮어쓰지 않고 멈춘다.
git checkout --quiet --detach "$sha"
echo "[deploy] $(git log -1 --format='%h %s')"

# 운영 .env는 커밋된 SOPS 파일에서 매번 다시 만든다. VPS에서 .env를 직접 고치면 다음 배포에서 덮어써진다.
# sops는 호스트에 설치하지 않고 공식 이미지로 실행한다. key는 ~/.config/sops/age/keys.txt(vps-infra와 공용)다.
umask 077
tmp="$(mktemp .env.XXXXXX)"
trap 'rm -f "$tmp"' EXIT
docker run --rm --network none \
    -v "$HOME/.config/sops/age/keys.txt:/age/keys.txt:ro" -e SOPS_AGE_KEY_FILE=/age/keys.txt \
    -v "$PWD/secrets:/secrets:ro" \
    ghcr.io/getsops/sops:v3.13.3-alpine decrypt /secrets/env.prod.sops.env > "$tmp"
# compose가 .env에서 IMAGE_TAG를 읽으므로, 배포 뒤 손으로 docker compose를 실행해도 같은 이미지를 가리킨다.
printf 'IMAGE_TAG=%s\n' "$sha" >> "$tmp"
mv "$tmp" .env

# migrate가 성공한 뒤 app과 collector가 뜨고, --wait가 healthcheck까지 기다린다.
docker compose pull --quiet
docker compose up -d --no-build --wait --wait-timeout 180
docker compose ps -a

# 지금 쓰는 태그 말고는 지운다. 롤백은 GHCR에서 다시 pull한다. 실행 중인 이미지는 docker가 지우지 않는다.
docker images ghcr.io/kanggihoo/vps-info --format '{{.Repository}}:{{.Tag}}' \
    | grep -v ":$sha-" | xargs -r docker rmi >/dev/null 2>&1 || true

# ponytail: ERD 판정 기준은 직전 checkout이다. 앞선 배포가 checkout 뒤에 실패했다면 그 변경을 놓칠 수 있어 `erd`로 다시 만든다.
if [[ "${mode:-}" == erd ]] || ! git diff --quiet "$previous" "$sha" -- apps/backend/drizzle; then
    # ERD는 부가 기능이라 실패해도 배포는 성공으로 둔다. ::warning::은 Actions 화면에 경고로 보인다.
    ./scripts/erd.sh || echo "::warning title=ERD::ERD를 만들지 못했다(배포는 성공). deploy.sh <sha> erd 로 다시 만든다."
fi
echo "[deploy] done $sha"
exit 0
}
