from __future__ import annotations

from signal_archive.collector import collect_once
from signal_archive.repository import RunCounts, UpsertResult
from signal_archive.schemas import ArchiveItem, FetchResult


class FakeItems:
    def upsert_items(self, items):
        return UpsertResult(saved=len(items))


class FakeRuns:
    def __init__(self):
        self.started = []
        self.finished = []

    def start_run(self, job_key, triggered_by, parent_run_id):
        run_id = len(self.started) + 1
        self.started.append((run_id, job_key, parent_run_id))
        return run_id

    def finish_run(self, run_id, status, counts, error):
        self.finished.append((run_id, status, counts, error))


def item() -> ArchiveItem:
    return ArchiveItem(
        source="geeknews", source_method="official_rss", title="one", url="https://example.com/one"
    )


def test_collector_marks_parent_partial_when_one_job_fails():
    """A job failure must preserve successful job data and its child history."""
    runs = FakeRuns()

    def fetch(job, *, limit):
        if job == "producthunt":
            raise TimeoutError("timed out")
        return FetchResult(items=[item()])

    exit_code = collect_once(
        FakeItems(), runs, limit=1, jobs=["geeknews", "producthunt"], fetch=fetch
    )

    assert exit_code == 1
    assert [status for _, status, _, _ in runs.finished] == ["SUCCESS", "FAILED", "PARTIAL"]


def test_collector_records_retry_and_skip_counts_from_fetch_result():
    """Job Run telemetry must surface the retries and skips the fetch actually made."""
    runs = FakeRuns()

    def fetch(job, *, limit):
        return FetchResult(items=[item()], skipped=2, retry_count=3)

    collect_once(FakeItems(), runs, limit=1, jobs=["geeknews"], fetch=fetch)

    child_counts = runs.finished[0][2]
    parent_counts = runs.finished[1][2]
    assert (child_counts.skipped, child_counts.retry_count) == (2, 3)
    assert (parent_counts.skipped, parent_counts.retry_count) == (2, 3)


def test_collector_marks_parent_failed_when_every_job_fails():
    """A fully failed collection cannot be reported as partial success."""
    runs = FakeRuns()

    exit_code = collect_once(
        FakeItems(),
        runs,
        limit=1,
        jobs=["geeknews"],
        fetch=lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("bad feed")),
    )

    assert exit_code == 1
    assert [status for _, status, _, _ in runs.finished] == ["FAILED", "FAILED"]
