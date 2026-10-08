# Logging Conventions

운영 로그는 vps-infra의 Grafana Alloy가 컨테이너 stdout을 읽어 Loki로 모으고, Grafana에서 검색한다
(vps-infra ADR 0016). 이 문서는 그 경로에서 로그가 제대로 읽히도록 앱이 지킬 형식을 정한다.

## 형식

- 로그는 stdout(경고·오류는 stderr도 된다)에 **한 줄에 JSON 하나**로 쓴다. 여러 줄로 나뉘면 Loki에서 줄마다 따로 잡힌다.
- `level`은 **이름 문자열**로 쓴다: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.
  숫자(`"level":30`)는 Loki·Grafana가 레벨로 알아보지 못해 모두 unknown으로 보인다.
- 메시지는 `msg`, 시각은 `time`(epoch 밀리초)에 둔다. pino 기본값과 같다.
- 서비스 이름, 컨테이너 이름은 로그에 넣지 않는다. 수집할 때 인프라가 `container`, `compose_service` 라벨로 붙인다.

## 서버

- 서버(Fastify)는 내장 pino 로거를 쓰고 `SERVER_LOGGER_OPTIONS`(`apps/backend/src/server/server-logger.ts`)로
  레벨을 이름으로 바꾼다. 로거를 새로 만들 때도 이 설정을 쓴다.

## 남기지 않는 것

- API 키, 토큰, 비밀번호, 쿠키, `Authorization` 헤더 값은 로그에 쓰지 않는다. 로그는 Loki에 7일 남고 Grafana에서 검색된다.
- 외부 응답 본문 전체를 그대로 쓰지 않는다. 필요한 필드만 쓴다.

## 아직 하지 않는 것

- 트레이스 연동(OpenTelemetry SDK, 로그에 `trace_id` 넣기)은 하지 않는다. nginx가 요청에 `traceparent` 헤더를 붙여 보내지만
  앱은 무시한다. 연동할 때는 vps-infra ADR 0017(외부 요청의 trace는 nginx가 시작한다)을 따른다.
- `collector`, `llm`, `migrate`는 아직 `console.log` 텍스트를 쓴다. Grafana에서 레벨이 unknown으로 보인다.
  이 코드를 고칠 때 이 규칙으로 옮긴다.
