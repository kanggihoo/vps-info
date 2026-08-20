"""Archive item 조회 endpoint."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query

from signal_archive.api.deps import Items
from signal_archive.api.errors import NotFoundError
from signal_archive.api.responses import ItemListResponse
from signal_archive.repository import ItemRecord


router = APIRouter(prefix="/items", tags=["items"])


@router.get("", response_model=ItemListResponse)
def list_items(
    items: Items,
    source: str | None = None,
    start_at: Annotated[datetime | None, Query(alias="startAt")] = None,
    end_at: Annotated[datetime | None, Query(alias="endAt")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ItemListResponse:
    return ItemListResponse(
        items=items.list_items(source, start_at, end_at, limit, offset),
        total=items.count_items(source, start_at, end_at),
        limit=limit,
        offset=offset,
    )


@router.get("/{item_id}", response_model=ItemRecord)
def get_item(item_id: int, items: Items) -> ItemRecord:
    item = items.get_item(item_id)
    if item is None:
        raise NotFoundError("item not found")
    return item
