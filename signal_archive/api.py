"""Read-only HTTP API for the archive dashboard."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated, AsyncIterator

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from signal_archive.config import DatabaseSettings
from signal_archive.db import connect
from signal_archive.repository import ItemRecord, ItemRepository, JobRunRecord, JobRunRepository


class HealthResponse(BaseModel):
    status: str = "ok"


class ItemListResponse(BaseModel):
    items: list[ItemRecord]
    total: int
    limit: int
    offset: int


def create_app(
    items: ItemRepository | None = None, runs: JobRunRepository | None = None
) -> FastAPI:
    if (items is None) != (runs is None):
        raise ValueError("items and runs must be configured together")

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if items is not None:
            yield
            return
        with connect(DatabaseSettings()) as connection:
            app.state.items = ItemRepository(connection)
            app.state.runs = JobRunRepository(connection)
            yield

    app = FastAPI(lifespan=lifespan)

    def item_repository() -> ItemRepository:
        return items or app.state.items

    def run_repository() -> JobRunRepository:
        return runs or app.state.runs

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    @app.get("/api/items", response_model=ItemListResponse)
    def list_items(
        source: str | None = None,
        start_at: Annotated[datetime | None, Query(alias="startAt")] = None,
        end_at: Annotated[datetime | None, Query(alias="endAt")] = None,
        limit: Annotated[int, Query(ge=1, le=100)] = 20,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> ItemListResponse:
        repository = item_repository()
        return ItemListResponse(
            items=repository.list_items(source, start_at, end_at, limit, offset),
            total=repository.count_items(source, start_at, end_at),
            limit=limit,
            offset=offset,
        )

    @app.get("/api/items/{item_id}", response_model=ItemRecord)
    def get_item(item_id: int) -> ItemRecord:
        item = item_repository().get_item(item_id)
        if item is None:
            raise HTTPException(status_code=404, detail="item not found")
        return item

    @app.get("/api/job-runs", response_model=list[JobRunRecord])
    def list_job_runs(
        limit: Annotated[int, Query(ge=1, le=100)] = 20,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> list[JobRunRecord]:
        return run_repository().list_parent_runs(limit, offset)

    @app.get("/api/job-runs/{run_id}", response_model=JobRunRecord)
    def get_job_run(run_id: int) -> JobRunRecord:
        run = run_repository().get_run_with_children(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="job run not found")
        return run

    return app


app = create_app()
