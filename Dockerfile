FROM ghcr.io/astral-sh/uv:0.9-python3.12-bookworm-slim AS base

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH=/app/.venv/bin:$PATH
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY alembic.ini ./
COPY alembic ./alembic
COPY signal_archive ./signal_archive
RUN uv sync --frozen --no-dev

CMD ["uvicorn", "signal_archive.api:app", "--host", "0.0.0.0", "--port", "8000"]
