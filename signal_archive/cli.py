"""Minimal command line entry point for the one-shot collector."""

from __future__ import annotations

import argparse
import logging

from signal_archive.channels import CHANNELS
from signal_archive.collector import run_collector


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="signal-archive")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("channels", help="List configured channels")
    collect = commands.add_parser("collect", help="Collect all configured channels once")
    collect.add_argument("--limit", type=int, default=20)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "channels":
        for channel in CHANNELS.values():
            print(f"{channel['name']}\t{channel['method']}\t{channel['target']}")
        return 0
    return run_collector(limit=args.limit)
