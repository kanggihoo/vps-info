from __future__ import annotations

from datetime import UTC, datetime

from signal_archive.repository import ItemRepository, RunCounts, RunError
from signal_archive.schemas import ArchiveItem


def rss_item(title: str = "first") -> ArchiveItem:
    return ArchiveItem(
        source="geeknews",
        source_method="official_rss",
        title=title,
        url="https://example.com/a",
    )


def test_upsert_keeps_one_rss_item_without_feed_column(repository: ItemRepository):
    """Changing RSS metadata must update one logical item, not create a duplicate."""
    first = rss_item()
    second = first.model_copy(update={"title": "changed"})

    assert repository.upsert_items([first]).saved == 1
    assert repository.upsert_items([second]).updated == 1
    assert len(repository.list_items(None, None, None, 10, 0)) == 1


def test_list_items_filters_source_and_date(repository: ItemRepository):
    """Date filtering must not leak records from another source."""
    old = rss_item("old").model_copy(
        update={"published_at": datetime(2026, 1, 1, tzinfo=UTC)}
    )
    recent = rss_item("recent").model_copy(
        update={"published_at": datetime(2026, 2, 1, tzinfo=UTC)}
    )
    other = ArchiveItem(
        source="producthunt",
        source_method="official_rss",
        title="other",
        url="https://example.com/other",
        published_at=datetime(2026, 2, 1, tzinfo=UTC),
    )
    repository.upsert_items([old, recent, other])

    rows = repository.list_items(
        "geeknews", datetime(2026, 1, 15, tzinfo=UTC), None, 10, 0
    )

    assert [row.title for row in rows] == ["recent"]


def test_run_repository_records_partial_parent_and_failed_child(run_repository):
    """A failed job must be visible below its partially successful parent."""
    parent_id = run_repository.start_run("batch-run", "manual", None)
    child_id = run_repository.start_run("producthunt", "manual", parent_id)
    run_repository.finish_run(child_id, "FAILED", RunCounts(), RunError(error_type="Timeout", error_message="timed out"))
    run_repository.finish_run(parent_id, "PARTIAL", RunCounts(), None)

    assert run_repository.get_run_with_children(parent_id).status == "PARTIAL"


def test_list_parent_runs_excludes_child_runs(run_repository):
    """The run history overview must not duplicate nested job records."""
    parent_id = run_repository.start_run("batch-run", "manual", None)
    run_repository.start_run("geeknews", "manual", parent_id)

    assert [run.id for run in run_repository.list_parent_runs(20, 0)] == [parent_id]
