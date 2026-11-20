# ADR-0020: 이미지는 GitHub Actions에서 빌드해 GHCR에 올리고, VPS는 SSH로 받은 SHA를 pull해 배포한다

- 상태: 수용
- 결정일: 2026-11-20
- 관련: ADR-0001(결정 3을 대체), vps-infra ADR 0018·0019

## 배경

지금까지 `main` push는 VPS 안의 Jenkins(`vps-info` multibranch job)가 받아 Test → `.env` 복호화 → `docker compose up --build --wait` → ERD 순으로 배포했다.
ADR-0001 결정 3("이미지는 그 이미지가 실행될 대상 위에서 빌드한다")에 따라 이미지도 VPS에서 빌드했다.

- Jenkins는 VPS 메모리를 가장 많이 쓰는 프로세스다(vps-infra ADR 0006 실측: 2.0GB 중 1.0GB). Docker socket으로 도는 BuildKit 빌드는 Jenkins `mem_limit` 밖이라, 배포 중에는 그보다 더 쓴다.
- PR 검증은 이미 GitHub Actions로 옮겼다(vps-infra ADR 0018). CD만 Jenkins에 남아 실패 로그가 두 곳에 나뉘었다.
- VPS에는 이 저장소의 checkout이 없고 Jenkins workspace(named volume) 안에만 있어서, 운영에서 compose 명령을 직접 실행하기 어려웠다.

## 결정

1. **빌드 위치**: `main` 커밋의 이미지는 GitHub Actions(`.github/workflows/ci.yml`의 `image` job)가 `docker buildx bake -f compose.yml`로 빌드해
   `ghcr.io/kanggihoo/vps-info:<커밋 SHA>-<서비스>`로 push한다. 패키지는 하나이고 public이다. ADR-0001 결정 3을 대체한다.
2. **배포 경로**: `deploy` job이 SSH로 `kkh@VPS`에 `<sha> [erd]`만 보낸다. VPS `authorized_keys`의 이 key는
   `command="/home/kkh/app/vps-info/scripts/deploy.sh",restrict`로 묶여 그 스크립트 말고는 실행할 수 없다.
3. **배포 내용**: `scripts/deploy.sh`가 `~/app/vps-info` checkout을 그 SHA로 맞추고(main 이력만 허용), 커밋된 SOPS 파일로 `.env`를 만들고(sops 공식 이미지, key는 `~/.config/sops/age/keys.txt`),
   `IMAGE_TAG=<sha>`로 `docker compose pull` → `up -d --no-build --wait`를 실행한다. 마이그레이션이 바뀌었거나 `erd`를 받으면 `scripts/erd.sh`로 ERD를 만든다.
4. **직렬화**: `deploy.sh`는 `/tmp/vps-deploy.lock`을 `flock`으로 잡는다. 다른 프로젝트의 배포 스크립트도 같은 lock을 쓴다.
5. **검사**: `main`에서도 `check:task`가 먼저 돌고, 통과해야 `image`와 `deploy`로 넘어간다. 수동 재배포는 `workflow_dispatch`(main 선택, `erd` 옵션)로 한다.
6. **Jenkins 제거**: `Jenkinsfile`을 삭제한다. Jenkins 전용이던 vitest JUnit 출력 설정도 지운다.

## 검토한 대안들

### VPS에서 계속 빌드하고 Actions는 SSH로 `up --build`만 실행

- 장점: GHCR이 필요 없고 ADR-0001 결정 3을 유지한다.
- 단점: 배포마다 VPS 2 코어가 빌드에 묶이고 BuildKit 메모리가 그대로 VPS에 실린다. Jenkins를 뺀 이득의 절반이 사라진다.
- 기각 사유: 메모리 절감이 이번 이전의 목적이다.

### VPS에 self-hosted runner를 둔다

- 장점: SSH key가 필요 없고 VPS 내부 네트워크에 바로 붙는다.
- 단점: runner 프로세스가 상주한다. 이 레포는 public이라 PR이 workflow를 고쳐 `runs-on: self-hosted`를 지정하면 docker socket 권한으로 코드가 돈다.
- 기각 사유: public 레포에서 호스트 권한을 가진 runner는 위험하다.

### 패키지를 private으로 두고 VPS가 GHCR에 로그인한다

- 장점: 이미지가 공개되지 않는다.
- 단점: VPS에 `read:packages` 권한의 classic PAT를 둬야 한다.
- 기각 사유: 소스가 이미 public이고 비밀값은 런타임 `.env`로만 들어가 이미지에 없다. 지킬 것이 없는데 secret만 늘어난다.

## 이유

ADR-0001이 결정 3을 택한 이유는 macOS(arm64)에서 amd64 이미지를 만들면 QEMU 에뮬레이션으로 느리다는 것이었다.
GitHub-hosted runner는 VPS와 같은 amd64라 이 비용이 없다. 배포는 이미지 pull과 재시작만 남아 VPS 부하가 작고,
PR·main 검사·빌드·배포 로그가 모두 Actions 한 곳에 모인다. 롤백은 이전 main SHA로 `deploy.sh`를 다시 실행하면 된다.

## 결과

- VPS에 `~/app/vps-info` checkout이 생긴다. 운영 compose 명령(`scripts/llm-login.sh` 등)을 그 디렉터리에서 실행한다.
- 운영 `.env`에 `IMAGE_TAG`가 들어가므로, 손으로 `docker compose`를 실행해도 배포된 이미지를 가리킨다.
- 로컬과 배포가 같은 Dockerfile·compose를 쓴다는 ADR-0001의 나머지 결정은 그대로다. 로컬은 `local-*` 태그로 계속 빌드한다.
- GitHub에 `VPS_DEPLOY_KEY` secret이 생긴다. 이 key로 할 수 있는 일은 main 이력의 커밋을 배포하는 것뿐이다.
- 이미지가 GHCR에 쌓인다. VPS는 현재 태그 말고는 지우지만 GHCR 쪽은 정리하지 않는다.
- VPS host key가 바뀌면 `ci.yml`의 `VPS_HOST_KEY`를 고칠 때까지 배포가 실패한다.
- hosted runner에는 빌드 캐시가 없어 매번 처음부터 빌드한다. 느려지면 buildx `type=gha` 캐시를 붙인다.
