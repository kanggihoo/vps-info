"""도메인 예외와 이를 응답으로 변환하는 전역 exception handler."""

from __future__ import annotations

import logging

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


logger = logging.getLogger(__name__)


class ApiError(Exception):
    """메시지를 클라이언트에 그대로 반환해도 안전한 예외."""

    status_code = 500

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class NotFoundError(ApiError):
    status_code = 404


class InvalidRequestError(ApiError):
    status_code = 400


def register_error_handlers(app: FastAPI) -> None:
    """각 endpoint가 저장소 실패를 직접 변환하지 않도록 handler를 등록한다."""

    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(ValueError)
    async def handle_value_error(request: Request, exc: ValueError) -> JSONResponse:
        # 알 수 없는 Source 이름처럼 거부된 입력은 500이 아니라 클라이언트 오류다.
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(psycopg.Error)
    async def handle_database_error(request: Request, exc: psycopg.Error) -> JSONResponse:
        # SQL이나 접속 정보는 절대 노출하지 않고, 실제 원인은 로그에 남긴다.
        logger.exception("database error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=503, content={"detail": "database unavailable"})
