"""Job 실행 이력의 PostgreSQL 영속화."""

from __future__ import annotations

from datetime import UTC, datetime

import psycopg

from signal_archive.repository.records import JobRunRecord, RunCounts, RunError, RunStatus


_MAX_ERROR_MESSAGE = 1000


class JobRunRepository:
    """호출자가 소유한 커넥션에서 Job 실행 이력을 기록하고 조회한다."""

    def __init__(self, connection: psycopg.Connection):
        self.connection = connection

    def start_run(self, job_key: str, triggered_by: str, parent_run_id: int | None) -> int:
        """RUNNING 상태 run을 만들고 즉시 commit해, 비정상 종료에도 기록을 남긴다.

        Args:
            job_key: Job 식별자. parent run인 경우 `batch-run`.
            triggered_by: 실행을 시작한 주체. 예: `manual`, `timer`.
            parent_run_id: 상위 run의 id. parent run 자신이면 None.

        Returns:
            새로 만든 run의 id.
        """
        row = self.connection.execute(
            """INSERT INTO job_run (parent_run_id, job_key, triggered_by, started_at, status)
               VALUES (%s, %s, %s, %s, 'RUNNING') RETURNING id""",
            (parent_run_id, job_key, triggered_by, datetime.now(UTC)),
        ).fetchone()
        self.connection.commit()
        return row["id"]

    def finish_run(
        self, run_id: int, status: RunStatus, counts: RunCounts, error: RunError | None
    ) -> None:
        """최종 status와 집계를 기록해 run을 종료하고, 긴 오류 메시지는 자른다."""
        self.connection.execute(
            """UPDATE job_run SET finished_at = %s, status = %s,
                   fetched_count = %s, inserted_count = %s, updated_count = %s,
                   skipped_count = %s, retry_count = %s, error_type = %s, error_message = %s
               WHERE id = %s""",
            (
                datetime.now(UTC),
                status,
                counts.fetched,
                counts.inserted,
                counts.updated,
                counts.skipped,
                counts.retry_count,
                error.error_type if error else None,
                error.error_message[:_MAX_ERROR_MESSAGE] if error else None,
                run_id,
            ),
        )
        self.connection.commit()

    def list_parent_runs(self, limit: int, offset: int) -> list[JobRunRecord]:
        rows = self.connection.execute(
            """SELECT * FROM job_run WHERE parent_run_id IS NULL
               ORDER BY started_at DESC, id DESC LIMIT %s OFFSET %s""",
            (limit, offset),
        ).fetchall()
        return [JobRunRecord.model_validate(row) for row in rows]

    def get_run_with_children(self, run_id: int) -> JobRunRecord | None:
        row = self.connection.execute(
            "SELECT * FROM job_run WHERE id = %s", (run_id,)
        ).fetchone()
        if row is None:
            return None
        children = self.connection.execute(
            "SELECT * FROM job_run WHERE parent_run_id = %s ORDER BY started_at, id", (run_id,)
        ).fetchall()
        return JobRunRecord.model_validate({**row, "children": children})
