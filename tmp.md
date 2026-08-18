
Agent-Reach를 서버에서 지속 수집용으로 운영할 때는 브라우저 로그인 상태 전체가 아니라 채널별 최소 인증 정보만 서버 설정 파일에 이식하는 방식이 정석임.

## Agent-Reach 서버 인증 정보 이식 정리

Agent-Reach 기준으로 Twitter/X와 Reddit은 인증 정보를 저장하고 읽는 위치가 다름. OpenCLI는 로컬 데스크톱의 실제 Chrome 세션을 재사용하는 구조이므로 AWS, Hostinger VPS 같은 GUI 없는 서버에 브라우저 세션을 그대로 복사해서 쓰는 방식과 맞지 않음.

> [!important] 핵심 원칙
> 서버로 옮길 대상은 브라우저 프로필 전체가 아니라 필요한 쿠키/토큰만임.
>
> - Twitter/X: `auth_token`, `ct0`
> - Reddit: `reddit_session`
> - OpenCLI: 서버용이 아니라 데스크톱 Chrome 세션 재사용용임

### 채널별 인증 저장 위치

| 채널 | 서버 저장 위치 | 핵심 인증 정보 | 운영 방식 |
|---|---|---|---|
| Twitter/X | `~/.agent-reach/config.yaml` 또는 환경변수 | `twitter_auth_token`, `twitter_ct0` / `TWITTER_AUTH_TOKEN`, `TWITTER_CT0` | `twitter-cli` 또는 Agent-Reach Twitter 채널에서 사용 |
| Reddit | `~/.config/rdt-cli/credential.json` | `reddit_session` | `rdt-cli` 기반 인증 파일 사용 |
| OpenCLI | 로컬 데스크톱 Chrome 세션 | 브라우저 세션 | GUI 없는 서버 운영에 부적합 |

### 관련 코드와 문서 기준

- Twitter/X 관련 코드
  - `agent_reach/config.py`
  - `agent_reach/cli.py`
  - `agent_reach/channels/twitter.py`
  - `repos/Agent-Reach/docs/install.md`
- Reddit 관련 코드와 문서
  - `agent_reach/channels/reddit.py`
  - `agent_reach/skill/references/social.md`
  - `agent_reach/cookie_extract.py`
  - `repos/Agent-Reach/agent_reach/guides/setup-reddit.md`
- OpenCLI 관련 코드
  - `repos/Agent-Reach/agent_reach/backends/opencli.py`
  - `repos/Agent-Reach/agent_reach/backends/__init__.py`

## 전체 운영 흐름

지속 수집 목적이면 자동화는 로컬 PC가 아니라 계속 켜져 있는 서버에서 실행하는 편이 자연스러움. 다만 서버에서 직접 브라우저 로그인 세션을 만드는 대신, 로컬에서 로그인한 뒤 필요한 인증 정보만 추출해 서버로 옮기는 구조가 적합함.

### 기본 절차

1. 로컬 브라우저에서 Twitter/X 또는 Reddit 로그인
2. 필요한 쿠키/토큰 추출
3. 서버의 채널별 설정 파일 또는 환경변수에 저장
4. 파일과 디렉터리 권한 제한
5. 서버에서 `cron`, `systemd`, worker 등으로 주기 실행
6. 세션 만료 시 로컬에서 다시 쿠키/토큰을 추출해 갱신

### VPS 기본 준비

Hostinger VPS 같은 서버에 접속한 뒤 Agent-Reach와 `rdt-cli` 설정 디렉터리를 먼저 만들고 권한을 제한함.

```bash
ssh user@YOUR_VPS 'mkdir -p ~/.agent-reach ~/.config/rdt-cli && chmod 700 ~/.agent-reach ~/.config/rdt-cli'
```

## Twitter/X 인증 이식

Twitter/X는 `twitter_auth_token`과 `twitter_ct0` 또는 환경변수 `TWITTER_AUTH_TOKEN`, `TWITTER_CT0`를 사용함.

### 설정 파일 방식

로컬에서 로그인한 브라우저의 쿠키를 뽑은 뒤 Agent-Reach 설정에 저장함.

```bash
agent-reach configure twitter-cookies "auth_token=...; ct0=..."
```

또는 로컬에서 브라우저 추출 명령을 사용해 `~/.agent-reach/config.yaml`을 생성한 뒤 서버로 복사 가능함.

```bash
agent-reach configure --from-browser chrome
```

설정 파일 구조 예시는 다음과 같음.

```yaml title:config.yaml
twitter_auth_token: "REDACTED"
twitter_ct0: "REDACTED"
```

서버 복사 예시는 다음과 같음.

```bash
scp ~/.agent-reach/config.yaml user@YOUR_VPS:~/.agent-reach/config.yaml
ssh user@YOUR_VPS 'chmod 600 ~/.agent-reach/config.yaml'
```

EC2 사용자 기준 예시는 다음과 같음.

```bash
scp ~/.agent-reach/config.yaml ec2-user@SERVER:~/.agent-reach/config.yaml
ssh ec2-user@SERVER 'chmod 600 ~/.agent-reach/config.yaml'
```

### 환경변수 방식

`Config.get()`이 환경변수도 읽으므로 서버 프로세스 실행 전에 다음 값을 주입 가능함.

```bash
export TWITTER_AUTH_TOKEN='...'
export TWITTER_CT0='...'
```

장기 운영에서는 shell profile에 직접 두는 것보다 별도 env 파일을 만들고 `chmod 600`으로 제한한 뒤 `systemd` 같은 서비스에서 읽게 하는 편이 안전함.

### Twitter 수집 명령 예시

현재 코드상 Twitter 채널은 홈 타임라인, 특정 유저 최신글, 유저 정보, 개별 트윗 조회를 지원함.

```bash
twitter feed -n 20
twitter user-posts @username -n 20
twitter user @username
twitter tweet URL_OR_ID
```

검증 명령 예시는 다음과 같음.

```bash
ssh user@YOUR_VPS 'agent-reach doctor'
ssh user@YOUR_VPS 'twitter status'
```

최소 체크리스트는 다음과 같음.

```bash
scp ~/.agent-reach/config.yaml user@YOUR_VPS:~/.agent-reach/config.yaml
ssh user@YOUR_VPS 'chmod 600 ~/.agent-reach/config.yaml && twitter status'
```

## Reddit 인증 이식

Reddit은 Twitter처럼 단순 토큰 2개 중심이 아니라 `rdt-cli`용 credential 파일을 사용함.

### credential 파일 위치

Agent-Reach의 Reddit 채널은 다음 파일을 읽음.

```text
~/.config/rdt-cli/credential.json
```

파일 형태는 다음과 같음.

```json title:credential.json
{
  "cookies": {
    "reddit_session": "<value>"
  },
  "source": "manual",
  "username": "<your_username>",
  "modhash": null,
  "saved_at": 0,
  "last_verified_at": null
}
```

수동 생성 예시는 다음과 같음.

```bash
mkdir -p ~/.config/rdt-cli
cat > ~/.config/rdt-cli/credential.json <<'JSON'
{
  "cookies": {
    "reddit_session": "YOUR_REDDIT_SESSION_VALUE"
  },
  "source": "manual",
  "username": "YOUR_USERNAME",
  "modhash": null,
  "saved_at": 0,
  "last_verified_at": null
}
JSON
chmod 600 ~/.config/rdt-cli/credential.json
```

### 서버 복사 방식

로컬 PC에서 Reddit에 로그인하고 `reddit_session` 쿠키 값을 확보한 뒤 `credential.json`을 서버로 복사함.

```bash
ssh user@YOUR_VPS 'mkdir -p ~/.config/rdt-cli && chmod 700 ~/.config/rdt-cli'
scp ~/.config/rdt-cli/credential.json user@YOUR_VPS:~/.config/rdt-cli/credential.json
ssh user@YOUR_VPS 'chmod 600 ~/.config/rdt-cli/credential.json'
```

EC2 사용자 기준 예시는 다음과 같음.

```bash
scp ~/.config/rdt-cli/credential.json ec2-user@SERVER:~/.config/rdt-cli/credential.json
ssh ec2-user@SERVER 'chmod 600 ~/.config/rdt-cli/credential.json'
```

검증 명령은 다음과 같음.

```bash
ssh user@YOUR_VPS 'rdt status --json'
```

정상이라면 `authenticated: true`가 나와야 함.

최소 체크리스트는 다음과 같음.

```bash
scp ~/.config/rdt-cli/credential.json user@YOUR_VPS:~/.config/rdt-cli/credential.json
ssh user@YOUR_VPS 'chmod 600 ~/.config/rdt-cli/credential.json && rdt status --json'
```

> [!info] `rdt login`의 의미
> 서버에 브라우저가 있는 경우에는 `rdt login`으로 브라우저에서 쿠키를 자동 추출할 수 있음.
>
> AWS나 일반 VPS처럼 GUI 없는 서버에서는 자동 추출이 어렵기 때문에 로컬에서 로그인하고 쿠키를 수동으로 확보해 `credential.json`에 넣는 방식이 현실적임.

### Reddit 수집 방식

현재 Agent-Reach 기준 Reddit은 Twitter처럼 사람 팔로우 피드가 중심이 아니라 다음 명령 중심임.

- `subreddit`
- `hot`
- `popular`
- `read`
- `search`

따라서 자동 수집은 관심 subreddit 목록을 정해두고 `subreddit <name>`을 주기적으로 실행하는 방식이 자연스러움.

## OpenCLI 제약

OpenCLI는 내 Chrome 로그인 세션을 재사용하는 브리지형 백엔드임. 구조상 원격 서버에서 headless로 로그인 세션을 복사해 쓰는 방식과 맞지 않음.

### 핵심 특징

- 실제 Chrome 사용
- browser bridge extension과 local daemon 구조
- 로그인 세션 재사용
- desktop-only
- headless 아님
- 하나의 브라우저 세션으로 여러 채널을 커버하는 구조

> [!warning] 서버에서 OpenCLI를 억지로 쓰면 안 되는 이유
> OpenCLI는 AWS나 Hostinger VPS 같은 GUI 없는 서버용이 아님.
>
> 서버 자동화에서는 OpenCLI를 서버로 옮기는 대신 Twitter는 토큰/설정 파일, Reddit은 `rdt-cli` credential 파일로 운영하는 편이 맞음.

## 하지 않는 것이 좋은 방식

다음 방식은 Agent-Reach가 의도한 운영 방식도 아니고 깨지기 쉬움.

- Chrome 프로필 전체를 AWS 또는 VPS로 복사
- 브라우저 DB 파일을 그대로 이식
- OpenCLI를 서버에서 headless로 억지 실행
- 쿠키/토큰을 채팅창에 붙여넣기
- 인증 파일을 Git 저장소에 커밋
- 서버에 여러 계정의 인증 정보를 섞어두기

## 보안 기준

쿠키는 사실상 비밀번호급 인증 정보임. 유출되면 계정 전체가 노출될 수 있으므로 파일 권한, 저장 위치, 계정 범위를 제한해야 함.

### 권장 권한

- 디렉터리: `700`
- 파일: `600`

### 반드시 지킬 것

- 전체 Chrome 프로필 복사 금지
- 쿠키/토큰 채팅창 공유 금지
- Git 커밋 금지
- 인증 파일 권한 제한
- 서버에 계정 정보 혼합 금지

## 계정 선택 기준

자동화 수집용이면 전용 계정 또는 부계정 사용이 대체로 더 안전함. 특히 Twitter 쪽 문서에서도 main account 대신 dedicated/secondary account 사용을 권장함.

### 전용 계정이 적합한 경우

- VPS에서 계속 자동 수집함
- 공개 계정 또는 공개 subreddit 모니터링이 목적임
- 여러 서버 또는 작업자와 운영 환경이 공유될 수 있음
- 쿠키 유출 시 피해 범위를 줄이고 싶음
- Twitter에서 비브라우저성 호출로 계정 제한 또는 밴 가능성을 줄이고 싶음

### 본계정이 필요한 경우

- 내 개인 홈피드가 꼭 필요함
- 내 구독 상태, 팔로우 상태, 저장글, 활동 이력이 결과에 직접 중요함
- Reddit 또는 Twitter의 본인 계정 기반 데이터가 수집 목적에 필수임

### 채널별 추천

| 채널 | 추천 계정 | 이유 |
|---|---|---|
| Twitter/X | 전용 계정 권장 | 필요한 사람을 follow 해두고 `TWITTER_AUTH_TOKEN`, `TWITTER_CT0`만 서버로 이식 가능함 |
| Reddit | 전용 계정 권장 | 특정 subreddit 수집이면 해당 계정으로 subscribe 후 `rdt-cli` 세션만 서버로 이식 가능함 |
| 개인 피드 기반 수집 | 본계정 가능 | 개인 팔로우, 구독, 저장글 상태가 결과에 필요할 수 있음 |

## 실무 운영 패턴

장기 운영에서는 다음 흐름이 적합함.

1. 전용 계정 생성
2. 로컬 브라우저에서 로그인
3. Twitter/X는 `auth_token`, `ct0` 추출
4. Reddit은 `reddit_session` 추출
5. VPS에 설정 파일 또는 credential 파일 전송
6. `chmod 600`으로 파일 권한 제한
7. `rdt status --json`, `twitter status`, `agent-reach doctor` 등으로 검증
8. `cron` 또는 `systemd`로 주기 수집 실행
9. 쿠키 만료 시 로컬에서 다시 추출해 서버 파일 갱신

> [!abstract] 운영 결론
> 계속 수집할 거면 서버 자동화가 맞음.
>
> 다만 서버로 옮길 대상은 브라우저 로그인 상태 전체가 아니라 Twitter/X의 토큰, Reddit의 `credential.json` 같은 최소 인증 정보임.

## 최종 요약

Agent-Reach 서버 운영에서는 Twitter/X와 Reddit의 인증 저장 방식이 다르므로 채널별 파일과 환경변수를 구분해야 함. Twitter/X는 `~/.agent-reach/config.yaml` 또는 `TWITTER_AUTH_TOKEN`, `TWITTER_CT0`를 사용하고, Reddit은 `~/.config/rdt-cli/credential.json`의 `reddit_session`을 사용함. OpenCLI는 desktop-only, real Chrome, no headless 구조라 GUI 없는 VPS나 AWS 서버용이 아님. 지속 수집은 서버에서 `cron`이나 `systemd`로 돌리되, 로컬에서 로그인해 필요한 최소 쿠키/토큰만 서버에 옮기고 권한을 `600`/`700`으로 제한하는 방식이 가장 현실적임.

--- 

## 검토 내용 
대체로 방향 맞음. 하지만 **그대로 믿으면 안 되는 부분 있음.**

**맞는 부분**
- 서버 지속 수집이면 Chrome 프로필 통째 복사보다 최소 쿠키/토큰 이식이 맞음.
- Twitter/X 핵심 쿠키: `auth_token`, `ct0` 맞음.
- Reddit 핵심 쿠키: `reddit_session` 맞음.
- Reddit `rdt-cli` credential 경로 맞음:
  ```text
  ~/.config/rdt-cli/credential.json
  ```
- OpenCLI는 실제 Chrome + 확장 + 로컬 daemon 구조. GUI 없는 VPS용으로 부적합하다는 말 맞음.
- 파일 권한 `700` / `600` 권장 맞음.
- 쿠키를 채팅창/Git에 넣지 말라는 보안 경고 맞음.

**틀리거나 애매한 부분**
1. `~/.agent-reach/config.yaml`만 서버에 복사하면 Twitter CLI가 바로 쓴다는 뉘앙스는 위험함.

Agent-Reach 코드는 여기에 저장함:
```yaml
twitter_auth_token: ...
twitter_ct0: ...
```

하지만 실제 `twitter` 명령은 보통 환경변수 필요:
```bash
TWITTER_AUTH_TOKEN
TWITTER_CT0
```

`agent-reach configure twitter-cookies ...`는 config에 저장하고, 테스트할 때만 subprocess env에 넣음. 이후 `twitter feed` 실행 때 config.yaml을 자동 주입한다고 보기 어려움.

서버 운영이면 더 확실한 방식:
```bash
export TWITTER_AUTH_TOKEN='...'
export TWITTER_CT0='...'
twitter status
```

또는 systemd env file.

2. `agent-reach configure --from-browser chrome`은 서버용 아님.

로컬 브라우저에서 쿠키 추출용. SSH/VPS/headless에서는 거의 안 맞음. 문서 내 말처럼 서버에는 추출 결과만 옮기는 게 맞음.

3. Reddit 명령 설명이 OpenCLI와 rdt-cli를 섞음.

OpenCLI:
```bash
opencli reddit search ...
opencli reddit read ...
opencli reddit subreddit ...
opencli reddit hot ...
opencli reddit popular ...
```

rdt-cli:
```bash
rdt search ...
rdt read ...
rdt sub python --limit 20
rdt popular --limit 10
rdt all --limit 10
```

`rdt`는 `subreddit`이 아니라 `sub`.

4. Reddit 설치 예시는 pipx 기준이라, 네 기준이면 uv로 바꿔야 함.

문서 기준:
```bash
pipx install 'git+https://github.com/public-clis/rdt-cli.git@...'
```

uv 선호면 시도 형태:
```bash
uv tool install 'git+https://github.com/public-clis/rdt-cli.git@5e4fb3720d5c174e976cd425ccc3b879d52cac66'
```

**정정된 결론**
서버 운영 원칙은 맞음. 단, Twitter는 `~/.agent-reach/config.yaml`보다 **환경변수 주입을 기준**으로 잡는 게 안전함. Reddit은 `~/.config/rdt-cli/credential.json` 기준 맞음. OpenCLI는 로컬 데스크톱용으로 보는 게 맞음.