from __future__ import annotations

from fastapi.testclient import TestClient

from signal_archive.api import create_app
from signal_archive.repository import ItemRepository, JobRunRepository
from signal_archive.schemas import ArchiveItem


def geek_item() -> ArchiveItem:
    return ArchiveItem(
        source="geeknews", source_method="official_rss", title="Geek", url="https://example.com/geek"
    )


def product_item() -> ArchiveItem:
    return ArchiveItem(
        source="producthunt", source_method="official_rss", title="Product", url="https://example.com/product"
    )


def test_list_items_filters_source_and_returns_pagination(repository: ItemRepository, run_repository: JobRunRepository):
    """The API must return the filtered total, not the unfiltered table size."""
    repository.upsert_items([geek_item(), product_item()])
    with TestClient(create_app(repository, run_repository)) as client:
        response = client.get("/api/items", params={"source": "geeknews", "limit": 10, "offset": 0})

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["source"] == "geeknews"


def test_get_missing_item_returns_404(repository: ItemRepository, run_repository: JobRunRepository):
    """A non-existent item must not be represented as an empty success response."""
    with TestClient(create_app(repository, run_repository)) as client:
        assert client.get("/api/items/999").status_code == 404


def test_get_parent_run_returns_children(repository: ItemRepository, run_repository: JobRunRepository):
    """Run detail must include per-job statuses required by the UI."""
    parent_id = run_repository.start_run("batch-run", "manual", None)
    run_repository.start_run("geeknews", "manual", parent_id)

    with TestClient(create_app(repository, run_repository)) as client:
        body = client.get(f"/api/job-runs/{parent_id}").json()

    assert len(body["children"]) == 1
