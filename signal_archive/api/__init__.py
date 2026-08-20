"""Archive dashboard용 읽기 전용 HTTP API."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import psycopg
from fastapi import APIRouter, FastAPI

from signal_archive.api.errors import register_error_handlers
from signal_archive.api.routes import health, items, job_runs
from signal_archive.config import DatabaseSettings
from signal_archive.db import make_pool


def create_app(connection: psycopg.Connection | None = None) -> FastAPI:
    """API 앱을 생성한다.

    Args:
        connection: 모든 요청이 재사용할 커넥션. 테스트용이며, 생략하면 앱이
            자신의 lifespan 동안 사용할 커넥션 pool을 연다.

    Returns:
        구성이 끝난 FastAPI 애플리케이션.
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if connection is not None:
            app.state.connection = connection
            yield
            return
        pool = make_pool(DatabaseSettings())
        pool.open()
        app.state.pool = pool
        try:
            yield
        finally:
            pool.close()

    app = FastAPI(lifespan=lifespan)
    app.state.connection = connection
    register_error_handlers(app)

    api = APIRouter(prefix="/api")
    api.include_router(health.router)
    api.include_router(items.router)
    api.include_router(job_runs.router)
    app.include_router(api)
    return app
