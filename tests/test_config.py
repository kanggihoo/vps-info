import pytest
from pydantic import ValidationError

from signal_archive.config import DatabaseSettings


def test_database_settings_requires_all_postgres_variables(monkeypatch):
    """Removing a required connection secret must stop startup before DB I/O."""
    monkeypatch.setenv("POSTGRES_HOST", "postgres")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    monkeypatch.setenv("POSTGRES_DB", "signal_archive")
    monkeypatch.setenv("POSTGRES_USER", "signal_archive")
    monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)

    with pytest.raises(ValidationError, match="POSTGRES_PASSWORD"):
        DatabaseSettings()


def test_database_settings_strips_values_and_builds_connection_kwargs(monkeypatch):
    """Whitespace-only credentials would otherwise produce a misleading DB error."""
    monkeypatch.setenv("POSTGRES_HOST", " postgres ")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    monkeypatch.setenv("POSTGRES_DB", " signal_archive ")
    monkeypatch.setenv("POSTGRES_USER", " signal_archive ")
    monkeypatch.setenv("POSTGRES_PASSWORD", " secret ")

    assert DatabaseSettings().connection_kwargs() == {
        "host": "postgres",
        "port": 5432,
        "dbname": "signal_archive",
        "user": "signal_archive",
        "password": "secret",
    }
