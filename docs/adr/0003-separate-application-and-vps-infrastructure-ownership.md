# 애플리케이션과 VPS 인프라의 소유권을 분리한다

`vps-info`는 Collector, Backend, Frontend, 애플리케이션 Compose와 Alembic 스키마를 소유하고, 공용 인프라의 세부 구성은 형제 저장소 `../vps-infra`를 기준으로 삼는다. `vps-infra`는 PostgreSQL 인스턴스와 볼륨, Nginx, TLS, Basic Auth, Jenkins 환경과 `vps_proxy`·`vps_data` Docker 네트워크를 소유하며, `vps-info`는 필요한 외부 네트워크만 참조하고 운영 호스트 포트를 직접 공개하지 않는다.
