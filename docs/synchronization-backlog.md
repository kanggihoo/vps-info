# Synchronization Backlog

최신 기준은 [CONTEXT.md](../CONTEXT.md), [ADR](./adr/)과 `docs/superpowers/specs/2026-08-19-signal-archive-service-transition-design.md`다. 아래 항목은 코드 또는 기존 문서를 일괄 정리할 때 함께 처리한다.

## 알려진 코드·문서 불일치

- `docs/implementation.md`의 "구조" 절은 갱신했지만, 나머지 본문은 아직 SQLite·`store.py`·`channels/`·dataclass `NewsItem` 기준으로 서술되어 있다. PostgreSQL·`repository/`·`sources/`·Pydantic `ArchiveItem` 기준으로 일괄 수정해야 한다.
- `docs/superpowers/plans/`와 `docs/handoff/`의 과거 문서도 `channels/`·`store.py` 경로를 참조한다. 과거 기록이므로 갱신 대신 현행 기준 문서를 우선한다.
- `tests/test_config.py::test_database_settings_requires_all_postgres_variables`는 로컬에 `.env`가 있으면 실패한다. `DatabaseSettings`가 `.env`를 읽어 삭제한 환경변수를 채우기 때문이다. 테스트에서 `_env_file=None`을 강제하도록 고쳐야 한다.

## 배포 승인 후 작업

- `vps-info`에 Jenkinsfile과 systemd one-shot service/timer를 추가한다.
- 운영 비밀값을 Jenkins와 systemd가 함께 읽을 영속 위치와 권한을 확정한다.
- `../vps-infra`에 Signal Archive 전용 PostgreSQL database/role 생성 절차를 반영한다.
- `../vps-infra`에 `archive.kkh-hub.tech` DNS·ACME·TLS·Nginx 라우팅과 Basic Auth 구성을 반영한다.
- 배포 전 `vps-infra`의 현재 OKF 문서와 실제 Compose 구성을 다시 대조하고, 인프라 변경은 해당 저장소의 지침에 따라 함께 문서화한다.
