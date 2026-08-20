"""One-shot collector 실행용 최소 command line 진입점."""

from __future__ import annotations

import argparse
import logging

from signal_archive.sources import SOURCES
from signal_archive.collector import run_collector


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="signal-archive")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("sources", help="List configured sources")
    collect = commands.add_parser("collect", help="Collect all configured sources once")
    collect.add_argument("--limit", type=int, default=20)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "sources":
        for source in SOURCES.values():
            print(f"{source['name']}\t{source['method']}\t{source['target']}")
        return 0
    return run_collector(limit=args.limit)
