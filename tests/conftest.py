from __future__ import annotations

import os
from typing import Iterator

import psycopg
import pytest
from alembic import command
from alembic.config import Config

from signal_archive.config import DatabaseSettings
from signal_archive.db import connect
from signal_archive.repository import ItemRepository, JobRunRepository


@pytest.fixture
def db_settings(monkeypatch: pytest.MonkeyPatch) -> DatabaseSettings:
    names = ("HOST", "PORT", "DB", "USER", "PASSWORD")
    values = {name: os.getenv(f"TEST_POSTGRES_{name}") for name in names}
    if not all(values.values()):
        pytest.skip("TEST_POSTGRES_HOST, PORT, DB, USER, PASSWORD are required")
    for name, value in values.items():
        monkeypatch.setenv(f"POSTGRES_{name}", value or "")
    return DatabaseSettings()


@pytest.fixture
def connection(db_settings: DatabaseSettings) -> Iterator[psycopg.Connection]:
    command.upgrade(Config("alembic.ini"), "head")
    with connect(db_settings) as conn:
        conn.execute("TRUNCATE items, job_run RESTART IDENTITY CASCADE")
        conn.commit()
        yield conn


@pytest.fixture
def repository(connection: psycopg.Connection) -> ItemRepository:
    return ItemRepository(connection)


@pytest.fixture
def run_repository(connection: psycopg.Connection) -> JobRunRepository:
    return JobRunRepository(connection)
