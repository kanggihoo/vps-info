# Signal Archive

GeekNews, Product Hunt, Indie Hackers, Hacker News `best`를 수집해 PostgreSQL에 저장하고 조회하는 로컬 서비스입니다.

## 로컬 실행

1. `vps-infra`에서 PostgreSQL과 `vps_data` 네트워크를 실행합니다.
2. `.env.example`을 복사해 `vps-info/.env`를 만들고 `POSTGRES_*` 값을 채웁니다.
3. `uv run alembic upgrade head`로 migration을 적용합니다.
4. `docker compose --env-file .env -f compose.yml -f compose.local.yml up -d --build backend frontend`로 Backend와 Frontend를 실행합니다.
5. `docker compose --env-file .env -f compose.yml -f compose.local.yml run --rm --no-deps collector`로 한 번 수집합니다.

Collector는 수집 후 종료하며, 일부 채널 실패는 `PARTIAL` 실행 이력으로 저장됩니다.

## 테스트

```bash
uv run pytest -q
npm --prefix frontend run test -- --run
```
