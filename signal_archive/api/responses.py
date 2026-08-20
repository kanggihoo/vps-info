"""읽기 전용 API의 응답 모델.

두 형태가 동일한 동안은 record 모델을 응답 본문으로 재사용한다. 내부에만
두어야 하는 컬럼이 생기면 그 시점에 이 파일에서 별도 모델로 분리한다.
"""

from __future__ import annotations

from pydantic import BaseModel

from signal_archive.repository import ItemRecord


class HealthResponse(BaseModel):
    status: str = "ok"


class ItemListResponse(BaseModel):
    """items 한 페이지와, 테이블 전체 크기가 아닌 같은 필터의 전체 건수."""

    items: list[ItemRecord]
    total: int
    limit: int
    offset: int


class ErrorResponse(BaseModel):
    detail: str
