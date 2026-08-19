"""PostgreSQL connection boundary."""

from __future__ import annotations

import psycopg
from psycopg.rows import dict_row

from signal_archive.config import DatabaseSettings


def connect(settings: DatabaseSettings) -> psycopg.Connection:
    return psycopg.connect(**settings.connection_kwargs(), row_factory=dict_row)
