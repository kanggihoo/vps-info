"""뉴스 수집 오케스트레이션 및 채널별 파이프라인 제어 모듈."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Any

from signal_archive.channels import CHANNELS, get_channel
from signal_archive.channels import hackernews
from signal_archive.channels.feed import fetch_feed
from signal_archive.schemas import NewsItem
from signal_archive.store import UpsertResult, get_existing_ids, upsert_items


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FetchReport:
    """채널 수집 실행 결과를 담는 데이터 클래스.

    Attributes:
        channel: 수집 대상 채널명.
        fetched: 네트워크로부터 수집된 아이템 수.
        result: DB 저장 및 갱신 결과(UpsertResult).
        error: 수집 실패 시 오류 메시지 (성공 시 None).
        feed: 세부 피드 이름 (선택 사항).
    """

    channel: str
    fetched: int
    result: UpsertResult = UpsertResult()
    error: str | None = None
    feed: str | None = None

    @property
    def ok(self) -> bool:
        """수집 성공 여부를 반환합니다."""
        return self.error is None


def _fetch_hackernews_items(
    channel: dict[str, Any],
    *,
    limit: int,
    feed: str,
    db_path: str | Path | None,
) -> list[NewsItem]:
    """Hacker News 아이템을 DB 중복 필터링 후 비동기로 가져옵니다.

    Args:
        channel: 채널 메타데이터 딕셔너리.
        limit: 가져올 최대 아이템 수.
        feed: HN 피드 종류 ('best', 'show').
        db_path: 중복 확인용 DB 경로.

    Returns:
        수집 및 정규화된 NewsItem 목록.
    """
    ids = hackernews._fetch_ids(feed)
    existing = get_existing_ids(
        db_path, source=channel["name"], feed=feed, ids=[str(i) for i in ids]
    )
    new_ids = [i for i in ids if str(i) not in existing][:limit]
    if not new_ids:
        return []
    payloads = hackernews.fetch_payloads(new_ids)
    return hackernews.fetch(limit, feed=feed, payloads=payloads)


def fetch_channel_items(
    channel_name: str,
    *,
    limit: int,
    feed: str | None = None,
    db_path: str | Path | None = None,
) -> list[NewsItem]:
    """단일 채널의 아이템을 DB 저장 없이 네트워크에서 수집합니다.

    Args:
        channel_name: 채널 식별자 이름.
        limit: 수집할 아이템 수.
        feed: 세부 피드 이름 (선택 사항).
        db_path: 중복 확인용 DB 경로 (선택 사항).

    Returns:
        수집된 NewsItem 객체 목록.
    """
    channel = get_channel(channel_name)
    if channel["fetch"] is fetch_feed:
        return channel["fetch"](
            source=channel["name"],
            source_method=channel["method"],
            url=channel["target"],
            limit=limit,
        )
    resolved_feed = feed or channel.get("default_feed") or hackernews.DEFAULT_FEED
    return _fetch_hackernews_items(
        channel, limit=limit, feed=resolved_feed, db_path=db_path
    )


def fetch_channel(
    channel_name: str,
    *,
    limit: int,
    feed: str | None = None,
    db_path: str | Path | None = None,
) -> FetchReport:
    """단일 채널의 아이템을 수집하고 DB에 저장한 뒤 보고서를 반환합니다.

    Args:
        channel_name: 수집할 채널 식별자 이름.
        limit: 수집할 아이템 수.
        feed: 세부 피드 이름 (선택 사항).
        db_path: 데이터베이스 파일 경로 (선택 사항).

    Returns:
        수집 통계 및 성공 여부를 담은 FetchReport 객체.
    """
    try:
        items = fetch_channel_items(
            channel_name, limit=limit, feed=feed, db_path=db_path
        )
        result = upsert_items(db_path, items)
        resolved_feed = None
        if get_channel(channel_name)["fetch"] is not fetch_feed:
            resolved_feed = feed or hackernews.DEFAULT_FEED
        return FetchReport(
            channel=channel_name,
            fetched=len(items),
            result=result,
            feed=resolved_feed,
        )
    except Exception as exc:
        return FetchReport(channel=channel_name, fetched=0, error=str(exc))


def _all_jobs() -> list[tuple[str, str | None]]:
    """전체 채널에 대해 실행할 (채널명, 피드명) 수집 작업 목록을 생성합니다."""
    jobs: list[tuple[str, str | None]] = []
    for name in CHANNELS:
        channel = CHANNELS[name]
        if "feeds" in channel:
            jobs.extend((name, feed) for feed in channel["feeds"])
        else:
            jobs.append((name, None))
    return jobs


def fetch_all_channels(*, limit: int, db_path: str | Path | None = None) -> list[FetchReport]:
    """모든 채널을 병렬로 수집한 후 단일 트랜잭션으로 DB에 일괄 저장합니다.

    Args:
        limit: 채널/피드당 수집할 최대 아이템 수.
        db_path: 데이터베이스 파일 경로 (선택 사항).

    Returns:
        각 채널별 수집 결과 보고서(FetchReport) 리스트.
    """
    jobs = _all_jobs()

    def run(job: tuple[str, str | None]) -> tuple[str, str | None, list[NewsItem] | str]:
        name, feed = job
        try:
            items = fetch_channel_items(name, limit=limit, feed=feed, db_path=db_path)
            return name, feed, items
        except Exception as exc:  # noqa: BLE001 - surface as report, don't abort others
            return name, feed, str(exc)

    with ThreadPoolExecutor(max_workers=len(jobs)) as ex:
        raw_results = list(ex.map(run, jobs))

    flat_items: list[NewsItem] = []
    reports: list[FetchReport] = []
    for name, feed, outcome in raw_results:
        if isinstance(outcome, str):
            reports.append(
                FetchReport(channel=name, fetched=0, error=outcome, feed=feed)
            )
            continue
        flat_items.extend(outcome)
        reports.append(
            FetchReport(channel=name, fetched=len(outcome), feed=feed)
        )

    if flat_items:
        write_result = upsert_items(db_path, flat_items)
        # Spread the aggregate counts across reports with items. Approximate,
        # but keeps the CLI output useful without per-channel write transactions.
        remaining_saved = write_result.saved
        for i, report in enumerate(reports):
            if report.error or report.fetched == 0 or remaining_saved <= 0:
                continue
            gave = min(report.fetched, remaining_saved)
            reports[i] = FetchReport(
                channel=report.channel,
                fetched=report.fetched,
                result=UpsertResult(saved=gave),
                feed=report.feed,
            )
            remaining_saved -= gave
    return reports


def inspect_channel(channel_name: str, *, limit: int, feed: str | None = None) -> Any:
    """단일 채널의 원시(Raw) 페이로드를 DB 저장 없이 가져옵니다.

    Args:
        channel_name: 조회할 채널 이름.
        limit: 조회할 항목 수.
        feed: 세부 피드 이름 (선택 사항).

    Returns:
        파싱 전후의 원시 응답 데이터.
    """
    channel = get_channel(channel_name)
    fetch_raw = channel["fetch_raw"]
    if feed is not None:
        return fetch_raw(limit, feed=feed)
    return fetch_raw(limit)


def inspect_all(*, limit: int) -> dict[str, Any]:
    """등록된 모든 채널의 원시(Raw) 페이로드를 조회합니다.

    Args:
        limit: 채널당 조회할 항목 수.

    Returns:
        채널명을 키로 하고 원시 페이로드를 값으로 갖는 딕셔너리.
    """
    results: dict[str, Any] = {}
    for name in CHANNELS:
        channel = CHANNELS[name]
        try:
            if "feeds" in channel:
                # HN: include each feed separately
                results[name] = {
                    feed: inspect_channel(name, limit=limit, feed=feed)
                    for feed in channel["feeds"]
                }
            else:
                results[name] = inspect_channel(name, limit=limit)
        except Exception as exc:
            results[name] = {"error": str(exc)}
    return results
