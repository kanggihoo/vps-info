from unittest import mock
import pytest

from signal_archive import cli
from signal_archive.repository import UpsertResult


def test_sources_command_prints_registered_sources(capsys: pytest.CaptureFixture[str]):
    exit_code = cli.main(["sources"])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "geeknews" in captured.out
    assert "hackernews" in captured.out


def test_collect_command_delegates_to_collector(capsys: pytest.CaptureFixture[str]):
    with mock.patch("signal_archive.cli.run_collector", return_value=0) as collect:
        exit_code = cli.main(["collect", "--limit", "2"])

    assert exit_code == 0
    collect.assert_called_once_with(limit=2)
