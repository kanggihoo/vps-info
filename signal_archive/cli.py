from __future__ import annotations

import argparse
import json
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


def _print_report(report: FetchReport) -> None:
    label = report.channel
    if report.feed:
        label = f"{report.channel}/{report.feed}"
    if report.error:
        print(f"{label}: failed {report.error}")
        return
    print(
        f"{label}: fetched={report.fetched} "
        f"saved={report.result.saved} "
        f"updated={report.result.updated}"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="signal-archive")
    parser.add_argument("--db", type=Path, default=None, help="SQLite DB path")
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
    args = build_parser().parse_args(argv)

    if args.command == "init-db":
        init_db(args.db)
        print("initialized")
        return 0

    if args.command == "channels":
        for channel in CHANNELS.values():
            print(f"{channel['name']}\t{channel['method']}\t{channel['target']}")
        return 0

    if args.command == "fetch":
        report = fetch_channel(
            args.channel, limit=args.limit, feed=args.type, db_path=args.db
        )
        _print_report(report)
        return 0 if report.ok else 1

    if args.command == "fetch-all":
        reports = fetch_all_channels(limit=args.limit, db_path=args.db)
        for report in reports:
            _print_report(report)
        return 0 if all(report.ok for report in reports) else 1

    if args.command == "list":
        for item in list_items(
            args.db, channel=args.channel, feed=args.feed, limit=args.limit
        ):
            published = item["published_at"] or ""
            feed = item.get("feed") or ""
            print(
                f"{published}\t{item['source']}\t{feed}\t{item['title']}\t{item['url']}"
            )
        return 0

    if args.command == "inspect":
        if args.channel is None:
            payload = inspect_all(limit=args.limit)
        else:
            payload = inspect_channel(args.channel, limit=args.limit, feed=args.type)
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
