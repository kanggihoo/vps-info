# Synchronization Backlog

최신 기준은 [CONTEXT.md](../CONTEXT.md), [ADR](./adr/)과 `docs/superpowers/specs/2026-08-19-signal-archive-service-transition-design.md`다. 아래 항목은 코드 또는 기존 문서를 일괄 정리할 때 함께 처리한다.

## 배포 승인 후 작업

- `vps-info`에 Jenkinsfile과 systemd one-shot service/timer를 추가한다.
- 운영 비밀값을 Jenkins와 systemd가 함께 읽을 영속 위치와 권한을 확정한다.
- `../vps-infra`에 Signal Archive 전용 PostgreSQL database/role 생성 절차를 반영한다.
- `../vps-infra`에 `archive.kkh-hub.tech` DNS·ACME·TLS·Nginx 라우팅과 Basic Auth 구성을 반영한다.
- 배포 전 `vps-infra`의 현재 OKF 문서와 실제 Compose 구성을 다시 대조하고, 인프라 변경은 해당 저장소의 지침에 따라 함께 문서화한다.
