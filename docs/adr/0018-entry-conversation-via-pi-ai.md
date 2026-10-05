# ADR-0018: Entry 대화는 pi-ai로 Claude·OpenAI·OpenRouter를 HTTP로 직접 부른다

- 상태: 수용
- 결정일: 2026-10-05
- 관련: ADR-0015

## 배경

ADR-0015는 구독으로 인증하려고 Claude Agent SDK와 Codex SDK를 썼다. 두 SDK는 CLI 바이너리(약 700MB)를 호출마다 자식 프로세스로 띄우는 셸 에이전트다.
그래서 도구를 끄는 설정(ADR-0015 결정 5), Codex 인증 파일 복사(`codex-engine.ts`), 세션 파일을 tmpfs에 두는 설정이 필요했다. 두 SDK 모두 이전 답을 메시지로 넣는 입력이 없어서 대화 기록도 SDK 세션에 맡겼다.

오픈소스 pi의 `ai` 패키지(`@earendil-works/pi-ai`, MIT)를 확인했다(2026-10-05, 1.0.2. 분석: `~/Desktop/oss-analysis/reports/pi/ai/`).

- 여러 회사의 모델을 같은 `Context`(시스템 프롬프트 + 메시지 배열)로 HTTP 호출한다. 바이너리도 자식 프로세스도 없고, 도구는 넘긴 것만 쓴다.
- provider마다 인증을 갖고 있다. Anthropic(Claude Pro/Max)과 OpenAI("Sign in with ChatGPT")는 구독 로그인과 토큰 자동 갱신을 지원하고, pi-ai CLI(`pi-ai login <provider>`)가 결과를 `auth.json`에 저장한다. 저장 위치는 `CredentialStore` 인터페이스로 앱이 정한다.
- Claude 구독 토큰(`sk-ant-oat…`)으로 부르면 pi-ai는 Claude Code로 위장한다. `user-agent: claude-cli/…` 헤더를 붙이고 시스템 프롬프트 맨 앞에 "You are Claude Code, Anthropic's official CLI for Claude."를 넣는다(`api/anthropic-messages.ts`의 "Stealth mode" 주석).
- 이 저장소에 필요한 것은 provider 세 개뿐이다. 그런데 소스를 복사하면 `types.ts`가 모든 API의 옵션 타입을 import하기 때문에 71개 파일, 약 1.8만 줄이 따라온다. npm 패키지는 `providers/<id>` 경로별 export가 있어 쓰는 provider만 불러온다.

## 결정

1. **호출**: `apps/llm`은 `@earendil-works/pi-ai`를 npm 의존성으로 쓴다. 소스는 복사하지 않는다. `anthropic`·`openai`·`openrouter` provider만 등록하고, `models.completeSimple(model, context)`로 부른다. 도구는 넘기지 않는다.
2. **엔진**: 엔진 값은 pi-ai provider id(`anthropic`·`openai`·`openrouter`)를 그대로 쓴다. 모델 목록은 pi-ai에 내장된 카탈로그(`models.getModels(provider)`)에서 최신 세대만 남긴다: Claude는 5.5 이상, OpenAI는 GPT-6 이상, OpenRouter는 DeepSeek만. 기본 모델(Claude Sonnet 5.5, GPT-6 Luna)을 목록 맨 앞에 둔다(`llm-models.ts`). ADR-0015 결정 9의 Codex 고정 목록과 Claude `supportedModels()` 조회는 없앤다.
3. **인증**
   - Claude와 OpenAI는 구독 로그인을 쓴다. 로그인은 pi-ai CLI(`pi-ai login anthropic`, `pi-ai login openai`)로 한 번씩 하고, 결과 `auth.json` 하나를 named volume(`llm_auth`)에 둔다. `FileCredentialStore`가 이 파일을 pi-ai `CredentialStore`로 읽고, pi-ai가 토큰을 갱신하면 되돌려 쓴다.
   - Claude는 pi-ai의 Claude Code 위장 경로를 탄다는 것을 알고 쓴다.
   - ADR-0015의 `claude setup-token` 토큰(`CLAUDE_CODE_OAUTH_TOKEN`)은 쓰지 않는다. 두 구독의 인증을 같은 파일, 같은 절차로 관리하려는 것이다.
   - OpenRouter는 API 키(`OPENROUTER_API_KEY`)를 쓴다.
4. **대화 기록**: `llm` 서비스가 세션 id → 엔진·모델·메시지 배열을 메모리에 둔다. 화면·`app` API는 바꾸지 않는다(첫 턴에 Entry, 이후 세션 id와 질문). 성공한 턴만 기록에 넣고, 100개를 넘으면 가장 오래 쓰지 않은 대화부터 지운다.
5. **배치는 유지한다**: ADR-0015 결정 4·6의 `llm` 컨테이너(DB 네트워크 없음, 읽기 전용 루트, `cap_drop`, 비루트)를 그대로 쓴다. 쓰기 가능한 곳은 인증 볼륨과 작은 tmpfs뿐이다.
6. **이어받는 결정**: ADR-0015의 용도(결정 1), 호출 시점(결정 2), 출력 경계(결정 7), DB에 남기지 않기(결정 8의 마지막 항목), 스트리밍 없음(결정 10)은 그대로다.

## 검토한 대안들

### pi-ai 소스를 복사해 들여온다

- 장점: 필요한 만큼 고쳐 쓸 수 있다. 쓰지 않는 provider SDK(aws, google)를 설치하지 않는다.
- 단점: `types.ts`를 손으로 잘라 내야 하고, 1.8만 줄을 따라 고쳐야 한다. 모델 카탈로그도 직접 갱신해야 한다.
- 기각 사유: 경로별 export로 쓰는 provider만 불러올 수 있다. 남는 SDK는 `llm` 이미지에만 들어가고, CLI 바이너리보다 훨씬 작다.

### Claude도 API 키로 부른다

- 장점: 위장하지 않으므로 약관 문제가 없다. Anthropic이 위장 요청을 막아도 영향이 없다.
- 단점: 구독과 별도로 토큰 비용이 든다.
- 기각 사유: 사용자는 혼자이고 구독이 이미 있다. 위험을 알고 구독 토큰을 고른다. 막히면 키를 넣으면 된다(`ANTHROPIC_API_KEY`, 코드 변경 없음).

### Claude Agent SDK와 Codex SDK를 그대로 둔다

- 장점: 실제 Claude Code·Codex 바이너리를 쓰므로 위장이 아니다.
- 단점: 셸 에이전트를 가두는 설정이 계속 필요하다. 호출마다 프로세스(200~400MB)를 띄운다. OpenRouter를 붙일 자리가 없다.
- 기각 사유: 필요한 일은 텍스트를 넣고 텍스트를 받는 것뿐이다. HTTP 호출로 충분하다.

## 이유

셸 에이전트를 텍스트 호출로 바꾸면 ADR-0015에서 가장 손이 많이 가던 부분(도구 끄기 확인, Codex 샌드박스, 인증 파일 복사)이 사라진다.
pi-ai는 provider·인증·카탈로그를 한 인터페이스로 묶어 주므로, 엔진 셋을 붙이는 코드는 provider를 등록하는 몇 줄이다.
소스를 복사하지 않아 pi의 변경은 버전을 올리는 것으로 따라간다.

## 결과

- `llm` 이미지에서 Claude·Codex 바이너리가 빠진다. 호출마다 프로세스를 띄우지 않으므로 메모리 상한을 512MB로 줄인다.
- 도구를 넘기지 않으므로 모델이 셸·파일에 닿을 길이 없다. 원문의 프롬프트 인젝션은 답 내용에만 영향을 주고, 화면이 답을 그리는 규칙(ADR-0015 결정 7)이 남는다.
- Claude 호출은 Claude Code로 위장한다. Anthropic이 막거나 약관을 근거로 계정을 제재할 수 있다. 막히면 Claude 엔진만 실패하고, `ANTHROPIC_API_KEY`로 옮길 수 있다.
- 모든 Claude 호출의 시스템 프롬프트 앞에 Claude Code 문장이 붙는다. Entry 대화 지시문은 그 뒤에 들어간다.
- OpenAI 인증 파일은 `llm` 프로세스 하나만 쓴다. `FileCredentialStore`는 프로세스 안에서만 쓰기를 줄 세운다. `llm`을 둘 이상 띄우면 갱신이 꼬인다.
- 대화 도중 `llm`이 재시작되면 대화가 끊기는 것은 ADR-0015와 같다.
- 모델 목록은 pi-ai 버전의 카탈로그를 따른다. 새 모델을 쓰려면 pi-ai를 올린다. 버전 필터가 id 모양(`claude-<이름>-<major>-<minor>`, `gpt-<major>.<minor>`)에 기대므로, 이름 규칙이 바뀐 모델은 목록에서 빠질 수 있다.
- 스트리밍(decisions-later 4)은 pi-ai가 `stream()`으로 이벤트를 주므로 엔진과 상관없이 붙일 수 있다.
- 서버의 옛 `codex_auth` 볼륨과 sops의 `CLAUDE_CODE_OAUTH_TOKEN`은 쓰지 않는다. 배포 뒤 지운다.
- Claude 로그인 토큰은 짧게 살고 refresh 토큰으로 갱신된다. refresh가 실패하면 그 엔진만 실패하고, 다시 로그인해야 한다.
