from io import StringIO
from unittest import mock
import unittest

from signal_archive import cli
from signal_archive.core import FetchReport
from signal_archive.store import UpsertResult


class CliTests(unittest.TestCase):
    def test_channels_command_prints_registered_channels(self):
        stdout = StringIO()

        with mock.patch("sys.stdout", stdout):
            exit_code = cli.main(["channels"])

        self.assertEqual(exit_code, 0)
        self.assertIn("geeknews", stdout.getvalue())
        self.assertIn("hackernews", stdout.getvalue())

    def test_fetch_command_prints_summary(self):
        stdout = StringIO()
        report = FetchReport(
            channel="geeknews",
            fetched=2,
            result=UpsertResult(saved=1, updated=1, skipped=0),
        )

        with mock.patch("signal_archive.cli.fetch_channel", return_value=report):
            with mock.patch("sys.stdout", stdout):
                exit_code = cli.main(["fetch", "--channel", "geeknews", "--limit", "2"])

        self.assertEqual(exit_code, 0)
        self.assertIn("geeknews: fetched=2 saved=1 updated=1 skipped=0", stdout.getvalue())

    def test_fetch_all_continues_after_failed_channel(self):
        stdout = StringIO()
        reports = [
            FetchReport(
                channel="geeknews",
                fetched=1,
                result=UpsertResult(saved=1, updated=0, skipped=0),
            ),
            FetchReport(channel="indiehackers", fetched=0, error="timeout"),
        ]

        with mock.patch("signal_archive.cli.fetch_all_channels", return_value=reports):
            with mock.patch("sys.stdout", stdout):
                exit_code = cli.main(["fetch-all", "--limit", "1"])

        self.assertEqual(exit_code, 1)
        self.assertIn("geeknews: fetched=1 saved=1 updated=0 skipped=0", stdout.getvalue())
        self.assertIn("indiehackers: failed timeout", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
