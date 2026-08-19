from unittest import mock
import pytest

from signal_archive import cli
from signal_archive.core import FetchReport
from signal_archive.store import UpsertResult


def test_channels_command_prints_registered_channels(capsys: pytest.CaptureFixture[str]):
    exit_code = cli.main(["channels"])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "geeknews" in captured.out
    assert "hackernews" in captured.out


def test_fetch_command_prints_summary(capsys: pytest.CaptureFixture[str]):
    report = FetchReport(
        channel="geeknews",
        fetched=2,
        result=UpsertResult(saved=1, updated=1),
    )

    with mock.patch("signal_archive.cli.fetch_channel", return_value=report):
        exit_code = cli.main(["fetch", "--channel", "geeknews", "--limit", "2"])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "geeknews: fetched=2 saved=1 updated=1" in captured.out
    assert "skipped" not in captured.out


def test_fetch_all_continues_after_failed_channel(capsys: pytest.CaptureFixture[str]):
    reports = [
        FetchReport(
            channel="geeknews",
            fetched=1,
            result=UpsertResult(saved=1, updated=0),
        ),
        FetchReport(channel="indiehackers", fetched=0, error="timeout"),
    ]

    with mock.patch("signal_archive.cli.fetch_all_channels", return_value=reports):
        exit_code = cli.main(["fetch-all", "--limit", "1"])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert "geeknews: fetched=1 saved=1 updated=0" in captured.out
    assert "indiehackers: failed timeout" in captured.err
    assert "skipped" not in captured.out

