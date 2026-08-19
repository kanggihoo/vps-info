# Local service validation

Date: 2026-08-20 (Asia/Seoul)

## Result

Local service validation passed. Deployment work remains out of scope and requires separate user approval.

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Python and PostgreSQL integration tests | PASS | Test-only `signal_archive_test` DB: `uv run pytest -q` → 26 passed |
| Frontend tests | PASS | `npm --prefix frontend run test -- --run`: 2 passed |
| Frontend production build | PASS | `npm --prefix frontend run build` |
| Compose boundary test | PASS | `tests/test_compose.py` passed; base services expose no host ports |
| Compose image build | PASS | `docker compose -f compose.yml -f compose.local.yml build` |
| Development migration | PASS | `alembic_version`, `items`, and `job_run` created in `signal_archive` |
| Backend/Frontend health | PASS | `/api/health` returned `{"status":"ok"}`; both Compose services became healthy |
| Collector one-shot | PASS | The disposable Collector container exited; parent `job_run` was `SUCCESS` with four successful children |
| Browser flow | PASS | Playwright checked `/`, item detail, `/runs`, and run detail through Vite's relative `/api` proxy |

## Data and failure handling

- Three live Collector runs completed successfully. PostgreSQL's unique constraint had no duplicate `(source, dedup_key)` records.
- The latest manual inspection found 60 records whose `last_seen_at` advanced beyond `first_seen_at`, demonstrating UPSERT updates.
- Hacker News `best` returned new IDs between runs, so its item count legitimately increased; it did not create duplicate deduplication keys.
- `tests/test_collector.py` covers a Product Hunt timeout: the child is `FAILED` and its parent is `PARTIAL`.

## Local-only prerequisites used

`vps-infra` PostgreSQL was started with external networks `vps_data` and `vps_proxy`. `signal_archive` and separate `signal_archive_test` databases were created. Secrets were passed from the existing local `vps-infra/.env` shell environment and were not copied into this repository; developers must create the ignored `vps-info/.env` from `.env.example` before using the documented `--env-file .env` commands.
