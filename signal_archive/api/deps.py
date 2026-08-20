"""읽기 전용 API의 요청 단위 dependency."""

from __future__ import annotations

from typing import Annotated, Iterator

import psycopg
from fastapi import Depends, Request

from signal_archive.repository import ItemRepository, JobRunRepository


def get_connection(request: Request) -> Iterator[psycopg.Connection]:
    """현재 요청이 사용할 커넥션 하나를 pool에서 대여한다.

    psycopg 커넥션은 thread-safe하지 않고 FastAPI는 sync route를 threadpool에서
    실행하므로, 요청마다 각자의 커넥션을 받아야 한다.

    Yields:
        요청이 끝나면 pool로 반환되는 커넥션.
    """
    override: psycopg.Connection | None = getattr(request.app.state, "connection", None)
    if override is not None:
        yield override
        return
    with request.app.state.pool.connection() as connection:
        yield connection


Connection = Annotated[psycopg.Connection, Depends(get_connection)]


def get_items(connection: Connection) -> ItemRepository:
    return ItemRepository(connection)


def get_runs(connection: Connection) -> JobRunRepository:
    return JobRunRepository(connection)


Items = Annotated[ItemRepository, Depends(get_items)]
Runs = Annotated[JobRunRepository, Depends(get_runs)]
