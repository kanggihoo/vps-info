"""Advisory lock behavior guarding concurrent collector runs."""

from __future__ import annotations

import pytest

from signal_archive.collector import run_collector
from signal_archive.config import DatabaseSettings
from signal_archive.db import connect
from signal_archive.repository import JobRunRepository


LOCK_KEY = "signal_archive:collector"


def _try_lock(connection) -> bool:
    return connection.execute(
        "SELECT pg_try_advisory_lock(hashtext(%s)) AS acquired", (LOCK_KEY,)
    ).fetchone()["acquired"]


def _unlock(connection) -> None:
    connection.execute("SELECT pg_advisory_unlock(hashtext(%s))", (LOCK_KEY,))


def test_run_collector_skips_when_lock_already_held(db_settings: DatabaseSettings):
    """A concurrent run must not start a second collection while one is in progress."""
    with connect(db_settings) as holder:
        assert _try_lock(holder)

        exit_code = run_collector(limit=1)

        _unlock(holder)

    assert exit_code == 0


def test_run_collector_releases_lock_after_success(
    db_settings: DatabaseSettings, run_repository: JobRunRepository, monkeypatch: pytest.MonkeyPatch
):
    """The lock must be free again once a run finishes normally."""
    monkeypatch.setattr("signal_archive.collector.collection_jobs", lambda: [])

    exit_code = run_collector(limit=1)

    assert exit_code == 0
    with connect(db_settings) as checker:
        assert _try_lock(checker)
        _unlock(checker)


def test_run_collector_releases_lock_when_collect_once_raises(
    db_settings: DatabaseSettings, monkeypatch: pytest.MonkeyPatch
):
    """A crash mid-run must not leave the lock stuck for the next scheduled run."""

    def boom(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr("signal_archive.collector.collect_once", boom)

    with pytest.raises(RuntimeError, match="boom"):
        run_collector(limit=1)

    with connect(db_settings) as checker:
        assert _try_lock(checker)
        _unlock(checker)
