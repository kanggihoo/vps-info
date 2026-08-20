"""PostgreSQL 연결 경계."""

from __future__ import annotations

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from signal_archive.config import DatabaseSettings


def connect(settings: DatabaseSettings) -> psycopg.Connection:
    """Collector처럼 단일 스레드 one-shot 작업이 사용할 커넥션 하나를 연다."""
    return psycopg.connect(**settings.connection_kwargs(), row_factory=dict_row)


def make_pool(settings: DatabaseSettings, *, max_size: int = 10) -> ConnectionPool:
    """동시 요청 경로가 사용할 커넥션 pool을 열지 않은 상태로 생성한다.

    psycopg 커넥션은 thread-safe하지 않으므로, API는 커넥션 하나를 스레드 간에
    공유하는 대신 요청마다 하나씩 대여해야 한다.

    Args:
        settings: PostgreSQL 접속 설정.
        max_size: pool이 유지할 최대 커넥션 수.

    Returns:
        아직 열리지 않은 pool. 접속하려면 `open()`을 호출한다.
    """
    return ConnectionPool(
        connection_class=psycopg.Connection,
        kwargs={**settings.connection_kwargs(), "row_factory": dict_row},
        min_size=1,
        max_size=max_size,
        open=False,
    )
