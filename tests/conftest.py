from __future__ import annotations

import os

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
def repository(db_settings: DatabaseSettings) -> ItemRepository:
    command.upgrade(Config("alembic.ini"), "head")
    with connect(db_settings) as connection:
        connection.execute("TRUNCATE items, job_run RESTART IDENTITY CASCADE")
        connection.commit()
        yield ItemRepository(connection)


@pytest.fixture
def run_repository(db_settings: DatabaseSettings) -> JobRunRepository:
    command.upgrade(Config("alembic.ini"), "head")
    with connect(db_settings) as connection:
        connection.execute("TRUNCATE items, job_run RESTART IDENTITY CASCADE")
        connection.commit()
        yield JobRunRepository(connection)
