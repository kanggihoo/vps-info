"""Shared transient-HTTP-error retry policy for Source fetchers."""

from __future__ import annotations

import httpx
from tenacity import wait_exponential_jitter


RETRYABLE_STATUS_CODES = {429, 502, 503}


class RetryableHttpStatus(Exception):
    def __init__(self, response: httpx.Response):
        self.response = response


def retry_wait(state) -> float:
    exc = state.outcome.exception() if state.outcome else None
    if isinstance(exc, RetryableHttpStatus):
        try:
            delay = float(exc.response.headers.get("Retry-After", ""))
            if delay > 0:
                return delay
        except (TypeError, ValueError):
            pass
    return wait_exponential_jitter(initial=1, max=30)(state)


def raise_for_retryable_status(response: httpx.Response) -> None:
    """Raise RetryableHttpStatus on transient status codes, else the usual HTTP error."""
    if getattr(response, "status_code", 200) in RETRYABLE_STATUS_CODES:
        raise RetryableHttpStatus(response)
    response.raise_for_status()


class RetryCounter:
    """Tallies retry attempts across the concurrent fetches of a single Job."""

    def __init__(self) -> None:
        self.count = 0

    def on_retry(self, retry_state) -> None:
        self.count += 1
