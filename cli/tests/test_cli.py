"""End-to-end tests: every command runs as a real process against recorded data.

The Go binary is held to the same tests when SNAG_GO_BIN is set, or when `go` is on the path, so
"identical commands and JSON output" is checked rather than promised.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tests.stub import FIXTURES, Stub

ROOT = Path(__file__).resolve().parent.parent
SESSION = FIXTURES["session_id"]
GROUP = FIXTURES["group_key"]


def go_binary():
    """Path to a built Go CLI, or None when Go is not available."""
    if os.environ.get("SNAG_GO_BIN"):
        return os.environ["SNAG_GO_BIN"]
    if not shutil.which("go"):
        return None
    out = Path(tempfile.gettempdir()) / "snag-go-test"
    subprocess.run(["go", "build", "-o", str(out), "./cmd/snag"], cwd=ROOT, check=True)
    return str(out)


PYTHON = [sys.executable, "-m", "snag"]
GO = go_binary()


class CliCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stub = Stub().__enter__()
        cls.home = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        cls.stub.__exit__(None, None, None)
        shutil.rmtree(cls.home, ignore_errors=True)

    def run_cli(self, *argv, cmd=None, endpoint=None):
        env = {
            "PATH": os.environ.get("PATH", ""),
            "HOME": self.home,
            "XDG_CONFIG_HOME": self.home,
            "XDG_DATA_HOME": self.home,
            "SNAG_ENDPOINT": endpoint or self.stub.url,
            "SNAG_PROJECT": "demo",
            "SNAG_TIMEOUT": "5",
            "NO_COLOR": "1",
        }
        return subprocess.run(
            [*(cmd or PYTHON), *argv], cwd=ROOT, env=env, capture_output=True, text=True, timeout=30
        )

    def json_of(self, *argv, cmd=None):
        result = self.run_cli("--json", *argv, cmd=cmd)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)


class Commands(CliCase):
    def test_issues_are_sorted_worst_first(self):
        issues = self.json_of("issue", "list")
        rank = {"high": 2, "medium": 1, "low": 0}
        ranks = [rank[i["severity"]] for i in issues]
        self.assertEqual(ranks, sorted(ranks, reverse=True))
        self.assertIn("POST /api/orders failed (500)", [i["title"] for i in issues])

    def test_select_keeps_only_the_requested_fields(self):
        issues = self.json_of("--select", "severity,title", "issue", "list")
        self.assertEqual(set(issues[0]), {"severity", "title"})

    def test_severity_filter_is_passed_to_the_server(self):
        self.assertEqual(self.run_cli("issue", "list", "--severity", "high").returncode, 0)

    def test_evidence_turns_a_recording_into_a_transcript(self):
        text = self.run_cli("session", "evidence", SESSION).stdout
        self.assertIn("POST /api/orders -> 500", text)
        self.assertIn("left the page", text)

    def test_evidence_json_counts_the_problems(self):
        data = self.json_of("session", "evidence", SESSION)
        self.assertGreater(data["session"]["problems"], 0)
        self.assertTrue(any(row["bad"] for row in data["transcript"]))

    def test_recorded_control_characters_cannot_reach_the_terminal(self):
        from snag.output import scrub

        self.assertEqual(scrub("safe\x1b[31mtext"), "safe[31mtext")

    def test_analytics_report_is_markdown(self):
        report = self.run_cli("analytics", "report").stdout
        self.assertIn("**", report)


class ExitCodes(CliCase):
    def test_not_found_is_3(self):
        self.assertEqual(self.run_cli("session", "view", "demo:missing").returncode, 3)

    def test_unreachable_server_is_4(self):
        result = self.run_cli("project", "list", endpoint="http://127.0.0.1:9")
        self.assertEqual(result.returncode, 4)

    def test_bad_usage_is_2(self):
        self.assertEqual(self.run_cli("issue", "nonsense").returncode, 2)


class ExploreSafety(CliCase):
    def test_refuses_a_production_url_without_force(self):
        result = self.run_cli("explore", "run", "--url", "https://shop.example.com", "-n")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("--force", result.stderr)

    def test_allows_a_local_url(self):
        result = self.run_cli("explore", "run", "--url", "http://localhost:3000", "-n")
        self.assertEqual(result.returncode, 0, result.stderr)


@unittest.skipUnless(GO, "Go is not available")
class Parity(CliCase):
    """The two implementations must agree, byte for byte once parsed."""

    def assert_same(self, *argv):
        python = self.json_of(*argv)
        go = self.json_of(*argv, cmd=[GO])
        self.assertEqual(python, go, f"output differs for: {' '.join(argv)}")

    def test_json_output_matches(self):
        for argv in (
            ("project", "list"),
            ("issue", "list"),
            ("--select", "groupKey,severity,title", "issue", "list"),
            ("issue", "view", GROUP),
            ("session", "list"),
            ("session", "evidence", SESSION),
            ("analytics", "show"),
            ("status",),
        ):
            with self.subTest(argv=argv):
                self.assert_same(*argv)

    def test_exit_codes_match(self):
        for argv in (("session", "view", "demo:missing"), ("issue", "nonsense"), ("issue",)):
            with self.subTest(argv=argv):
                python = self.run_cli(*argv).returncode
                go = self.run_cli(*argv, cmd=[GO]).returncode
                self.assertEqual(python, go)


if __name__ == "__main__":
    unittest.main()
