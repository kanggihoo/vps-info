"""signal-archive 커맨드라인 인터페이스(CLI) 및 진입점 모듈."""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
import sys

from signal_archive.channels import CHANNELS
from signal_archive.core import (
    FetchReport,
    fetch_all_channels,
    fetch_channel,
    inspect_all,
    inspect_channel,
)
from signal_archive.store import init_db, list_items


logger = logging.getLogger("signal_archive")


def setup_logging(verbose: bool = False) -> None:
    """stdout(INFO)과 stderr(ERROR)를 분리하여 내장 로깅 핸들러를 구성합니다.

    Args:
        verbose: True일 경우 DEBUG 레벨까지 활성화합니다.
    """
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    logger.handlers.clear()

    # stdout 핸들러: INFO 이하(DEBUG, INFO) 메시지 출력
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setLevel(logging.DEBUG if verbose else logging.INFO)
    stdout_handler.addFilter(lambda record: record.levelno < logging.WARNING)

    # stderr 핸들러: WARNING 이상(WARNING, ERROR, CRITICAL) 메시지 출력
    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setLevel(logging.WARNING)

    formatter = logging.Formatter("%(message)s")
    stdout_handler.setFormatter(formatter)
    stderr_handler.setFormatter(formatter)

    logger.addHandler(stdout_handler)
    logger.addHandler(stderr_handler)


def _log_report(report: FetchReport) -> None:
    """수집 결과 보고서(FetchReport)를 logger를 통해 출력합니다.

    에러가 발생한 채널은 logger.error(stderr), 정상 수집된 채널은 logger.info(stdout)로 출력합니다.

    Args:
        report: 출력할 FetchReport 객체.
    """
    label = report.channel
    if report.feed:
        label = f"{report.channel}/{report.feed}"
    if report.error:
        logger.error("%s: failed %s", label, report.error)
        return
    logger.info(
        "%s: fetched=%d saved=%d updated=%d",
        label,
        report.fetched,
        report.result.saved,
        report.result.updated,
    )


def build_parser() -> argparse.ArgumentParser:
    """CLI 인자 파서(ArgumentParser)를 구성하여 반환합니다.

    Returns:
        서브커맨드가 구성된 ArgumentParser 객체.
    """
    parser = argparse.ArgumentParser(prog="signal-archive")
    parser.add_argument("--db", type=Path, default=None, help="SQLite DB path")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose/debug logging")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init-db", help="Create SQLite schema")
    subparsers.add_parser("channels", help="List registered channels")

    fetch_parser = subparsers.add_parser("fetch", help="Fetch one channel")
    fetch_parser.add_argument("--channel", required=True, choices=sorted(CHANNELS))
    fetch_parser.add_argument("--limit", type=int, default=20)
    fetch_parser.add_argument(
        "--type",
        choices=["best", "show"],
        default=None,
        help="HN feed (best/show). Ignored for RSS channels.",
    )

    fetch_all_parser = subparsers.add_parser("fetch-all", help="Fetch all channels")
    fetch_all_parser.add_argument("--limit", type=int, default=20)

    list_parser = subparsers.add_parser("list", help="List saved items")
    list_parser.add_argument("--channel", choices=sorted(CHANNELS), default=None)
    list_parser.add_argument(
        "--feed",
        choices=["best", "show"],
        default=None,
        help="Filter by HN feed (best/show).",
    )
    list_parser.add_argument("--limit", type=int, default=20)

    inspect_parser = subparsers.add_parser(
        "inspect",
        help="Show raw payloads from a channel without saving",
    )
    inspect_parser.add_argument(
        "--channel",
        choices=sorted(CHANNELS),
        default=None,
        help="Channel to inspect; omit to inspect all channels",
    )
    inspect_parser.add_argument(
        "--type",
        choices=["best", "show"],
        default=None,
        help="HN feed (best/show). Defaults to 'best' for hackernews.",
    )
    inspect_parser.add_argument("--limit", type=int, default=20)

    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI 애플리케이션의 메인 진입 함수.

    Args:
        argv: 커맨드라인 인자 목록 (기본값: None, sys.argv 사용).

    Returns:
        실행 결과 종료 코드 (정상 종료 시 0, 실패 시 1 또는 2).
    """
    args = build_parser().parse_args(argv)
    setup_logging(verbose=getattr(args, "verbose", False))

    if args.command == "init-db":
        init_db(args.db)
        logger.info("initialized")
        return 0

    if args.command == "channels":
        for channel in CHANNELS.values():
            logger.info("%s\t%s\t%s", channel["name"], channel["method"], channel["target"])
        return 0

    if args.command == "fetch":
        report = fetch_channel(
            args.channel, limit=args.limit, feed=args.type, db_path=args.db
        )
        _log_report(report)
        return 0 if report.ok else 1

    if args.command == "fetch-all":
        reports = fetch_all_channels(limit=args.limit, db_path=args.db)
        for report in reports:
            _log_report(report)
        return 0 if all(report.ok for report in reports) else 1

    if args.command == "list":
        for item in list_items(
            args.db, channel=args.channel, feed=args.feed, limit=args.limit
        ):
            published = item["published_at"] or ""
            feed = item.get("feed") or ""
            logger.info(
                "%s\t%s\t%s\t%s\t%s",
                published,
                item["source"],
                feed,
                item["title"],
                item["url"],
            )
        return 0

    if args.command == "inspect":
        if args.channel is None:
            payload = inspect_all(limit=args.limit)
        else:
            payload = inspect_channel(args.channel, limit=args.limit, feed=args.type)
        logger.info("%s", json.dumps(payload, indent=2, ensure_ascii=False))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
