from __future__ import annotations

from unittest import mock

from signal_archive.core import fetch_job_items


def _hn_payload(item_id: int) -> dict:
    return {"id": item_id, "title": f"story {item_id}", "type": "story"}


def test_fetch_job_items_refetches_hn_details_every_run():
    """HN details must always be re-requested so score/rank/last_seen_at stay fresh."""
    with (
        mock.patch("signal_archive.core.hackernews._fetch_ids", return_value=[1, 2, 3]) as fetch_ids,
        mock.patch(
            "signal_archive.core.hackernews.fetch_payloads",
            return_value=([_hn_payload(1), _hn_payload(2)], 0),
        ) as fetch_payloads,
    ):
        fetch_ids.statistics = {"attempt_number": 1}
        result = fetch_job_items("hackernews:best", limit=2)

    fetch_payloads.assert_called_once_with([1, 2])
    assert [item.external_id for item in result.items] == ["1", "2"]


def test_fetch_job_items_aggregates_hn_retry_counts():
    """Job Run retry telemetry must include both the ID-list and detail-fetch retries."""
    with (
        mock.patch("signal_archive.core.hackernews._fetch_ids", return_value=[1]) as fetch_ids,
        mock.patch(
            "signal_archive.core.hackernews.fetch_payloads",
            return_value=([_hn_payload(1)], 2),
        ),
    ):
        fetch_ids.statistics = {"attempt_number": 3}
        result = fetch_job_items("hackernews:best", limit=1)

    assert result.retry_count == 2 + 2
