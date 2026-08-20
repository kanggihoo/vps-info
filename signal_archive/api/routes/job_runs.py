"""Job 실행 이력 조회 endpoint."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from signal_archive.api.deps import Runs
from signal_archive.api.errors import NotFoundError
from signal_archive.repository import JobRunRecord


router = APIRouter(prefix="/job-runs", tags=["job-runs"])


@router.get("", response_model=list[JobRunRecord])
def list_job_runs(
    runs: Runs,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[JobRunRecord]:
    return runs.list_parent_runs(limit, offset)


@router.get("/{run_id}", response_model=JobRunRecord)
def get_job_run(run_id: int, runs: Runs) -> JobRunRecord:
    run = runs.get_run_with_children(run_id)
    if run is None:
        raise NotFoundError("job run not found")
    return run
