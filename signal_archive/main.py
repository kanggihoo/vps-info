"""Backend service의 ASGI 진입점."""

from __future__ import annotations

from signal_archive.api import create_app


app = create_app()
