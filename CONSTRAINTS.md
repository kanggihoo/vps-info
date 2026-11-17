# Constraints

검토일: 2026-11-17. 소유자: @kanggihoo. 범위: Trendboda npm workspaces.

이 파일이 품질 기준의 원본이다. `package.json`의 `check:*`는 아래 명령을 묶는 실행 수단이다.
이번에는 기존 타입·lint·테스트에 변경 코드 Coverage, Gitleaks, Floor guard만 추가한다.

## Floor (항상 적용)

- Suppressions: 새 `@ts-ignore`, `@ts-nocheck`, `oxlint-disable`, `eslint-disable`, coverage·security 검사 무시 주석을 추가하지 않는다. 원인을 수정한다.
- Implementation: 미구현 stub과 오류를 숨기는 빈 catch를 남기지 않는다.
- Tests: 테스트 skip·삭제·assertion 제거는 이유를 명시하고 사용자 검토를 받는다. 정당한 fixture·assertion 교체도 guard가 잡으면 diff를 직접 검토한다.
- Secrets: API 키·토큰·비밀번호를 소스에 넣지 않는다. 검사 결과는 비밀값을 가려서 보고한다.
- Quality bar: 실패하는 기능을 통과시키려고 이 문서·검사 설정·스크립트·예외 목록을 약화하지 않는다.
- A flaky test leaves the main suite at once: fix it or delete it. A rerun is not a fix.

검사: `node scripts/floor-guard.mjs --base origin/main`

기준과 HEAD의 merge base부터 현재 작업 트리까지 검사하며 staged·unstaged·untracked 파일을 포함한다.
종료 코드 0은 탐지 없음, 1은 검토할 변경 탐지, 2는 검사 실행 실패다. 1과 2 모두 자동 통과시키지 않는다.
정규식 기반이므로 assertion 교체 같은 정당한 수정도 탐지될 수 있다. 원문·secret 값을 출력하지 않고 규칙과 파일만 보고한다.
`.constraintsignore`에는 검사 패턴 자체와 의도적 위반 예제를 담은 guard·guard 테스트만 기록한다.
다른 경로 추가는 품질 기준 변경으로 취급한다. Gitleaks가 secret 검사를 별도로 담당한다.

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at | 이유 |
|---|---|---|---|---|
| Types | TypeScript 오류 = 0 | `npm run typecheck` | 코드 변경 후 묶음 검사, 작업 종료, CI | shared API 타입과 서버·화면 계약 유지 |
| Lint | Oxlint 경고·오류 = 0 | `npm run lint` | 코드 변경 후 묶음 검사, 작업 종료, CI | 기존 correctness·type-aware·React·접근성 규칙 유지 |
| Tests | 실패 = 0 | `npm test` | 관련 테스트 변경 시, 작업 종료, CI | 기존 동작 유지 |
| DB tests | 실패 = 0 | `npm run test:db` | DB·migration·DB API·scheduler·Feed 선언 변경 시, 로컬 Docker | 별도 `_test` DB에서 실제 PostgreSQL 제약·API·수집 동작 확인 |
| Changed-line coverage | 실행 가능한 변경 라인 Coverage ≥ 80% | `npm run test:coverage` 후 `node scripts/wf-artifacts/diff-coverage.mjs coverage/lcov.info --base origin/main --min 80` | 작업 종료, CI | 신규·변경 로직의 대부분을 실제 테스트로 실행 |
| Secrets | Gitleaks 미해결 탐지 = 0 | `npm run check:secrets` | 작업 종료, CI | 현재 소스와 Git 이력의 credential 유출 탐지 |
| Floor guard | 미검토 위반 = 0, 실행 실패 = 0 | `node scripts/floor-guard.mjs --base origin/main` | 작업 종료, CI | 검증 삭제·우회와 기준 완화 검토 |

### Coverage 범위와 baseline

- backend·web·llm의 Vitest V8 Coverage를 lcov로 수집한다. `coverage.include`로 테스트가 import하지 않은 application source도 포함한다.
- 테스트 자체, backend 테스트 지원 코드, CLI로 받은 shadcn/ui, 생성된 디자인 토큰은 제품 Coverage 대상에서 제외한다.
- `packages/api-types`는 타입 전용이다. 타입 검사가 담당하며 실행 Coverage를 만들지 않는다.
- Node로 직접 실행하는 저장소 관리용 `scripts/*.mjs`와 vendored wf 도구는 제품 Coverage 대상이 아니다. guard는 별도 `npm run test:guards`로 계약을 검사한다.
- `scripts/merge-coverage.mjs`는 workspace별 SF 경로만 repo 기준으로 정리한다. 검사 판정은 wf 원본 `scripts/wf-artifacts/diff-coverage.mjs`가 한다.
- unit suite의 lcov를 한 번 만들고 재사용한다. DB 코드의 실제 실행 Coverage가 필요하면 backend를 `RUN_DB_TESTS=1`로 같은 Coverage 명령으로 실행한다.
- 일반 작업의 기준은 `origin/main`이다. wf에서는 spec 승인 commit을 `--base`로 넘긴다. 없는 ref나 lcov를 성공으로 취급하지 않는다.
- 2026-11-17에 origin/main(42dcbfa)을 갱신한 뒤 측정한 변경 Coverage는 28.7%(31/108)다. 현재 로컬과 원격 main은 서로 다른 추가 commit이 있고, 로컬의 이전 두 commit도 비교에 포함된다. 이전 작업의 assertion 교체도 Floor에서 8건 탐지된다. 이를 새 기준에 맞췄다고 보고하거나 임의로 예외 처리하지 않는다. 도입 전 변경의 검토와 baseline 반영을 마친 다음 새 작업부터 위 기준을 적용한다.

## 실행 시점과 비용

- 로컬에서는 Node >=22.18, npm, Git, Gitleaks 8.30.1이 필요하다. macOS에서 scanner가 없으면 `brew install gitleaks`로 설치한다. Docker test 이미지에는 Git·Gitleaks를 포함한다.
- `npm run check:fast`: 타입·lint. 매 글자 수정마다 돌리지 않고 관련 변경을 묶어 실행한다.
- `npm run test:guards`: floor guard의 임시 Git 저장소 기반 회귀 검사.
- `npm run check:task`: fast → secret → floor → guard 회귀 검사 → 테스트+Coverage → 변경 Coverage.
- `npm run check:full`: task 검사 후 DB 통합 테스트. Docker가 실행 중이어야 한다.
- 로컬 작업 종료 검사 예산은 90초를 목표로 한다. Docker 최초 pull·build와 CI는 이 예산에서 제외한다. 시간 초과를 검사 생략·성공으로 바꾸지 않는다.
- Jenkins Test stage에서 `check:task`를 실행한다. 현재 CI에는 DB 서비스가 없으므로 DB 통합 테스트는 별도로 실행한다.

## Measured, not yet enforced

2026-11-17 단위 테스트 기준. 전체 Coverage는 과거 코드의 현황이며 이번에 전체 80%를 강제하지 않는다.

| Metric | Today | Direction | 측정 |
|---|---|---|---|
| backend line coverage | 43.15% (353/818) | 테스트 보강으로 올린다 | `npm run test:coverage -w @trendboda/backend` |
| web line coverage | 13.06% (128/980) | 사용자 흐름 테스트를 추가하며 올린다 | `npm run test:coverage -w @trendboda/web` |
| llm line coverage | 67.96% (70/103) | 테스트 보강으로 올린다 | `npm run test:coverage -w @trendboda/llm` |
| dependency vulnerabilities | critical 0, high 9, moderate 19, low 1 | high·critical 우선 분류·해소 후 차단 기준을 별도 승인한다 | `npm audit` |

Dependency 검사는 현재 현황 측정이다. 새 dependency를 추가·갱신하면 audit 결과도 검토한다. `audit fix --force`로 임의의 major upgrade를 하지 않는다.
성능, 전체 브라우저 접근성, mutation score, architecture 경계 수치는 이번에 도입하지 않는다.

## Exceptions

등록된 제품 코드 예외는 없다. 예외가 필요하면 규칙·정확한 경로·이유·소유자·만료일을 기록하고 사용자 승인을 받는다.
예외 유효기간은 최대 90일이다. 이전 도입 작업을 위한 변경도 기능 수정과 섞어 기준을 낮추지 않는다.
기준 변경은 기능 수정과 별도의 commit으로 남긴다. wf-implement 중 변경은 사용자가 판단할 deviation이다.
