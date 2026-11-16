"""Round-trip and refusal tests for unbundle.py. Run them with `just test`."""

from __future__ import annotations

import contextlib
import hashlib
import io
import tempfile
import unittest
import uuid
from pathlib import Path

import unbundle

FIXTURE = Path(__file__).parent / "fixtures" / "bundle-v1.txt"
FIXTURE_TOKEN = "5f0c2a9e7b1d4e3f8a6c0b2d9e1f7a3c"
BUNDLE_NAME = "2026-11-16-RUNBOOK-BUNDLE-01-bundle.txt"


def encode(files: dict[str, str], token: str | None = None) -> bytes:
    """Reference encoder: what the runbook's PowerShell does, step for step.

    Takes each file as already-decoded text, as `[IO.File]::ReadAllText` returns it.
    """
    token = token or uuid.uuid4().hex
    out = [f"=== BUNDLE v1 {token} files={len(files)} ==="]
    for name, text in files.items():
        text = text.replace("\r\n", "\n")
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        out += [f"--- BEGIN {token} lines={text.count(chr(10))} sha256={digest} {name} ---", text, f"--- END {token} ---"]
    out.append(f"=== END BUNDLE {token} ===")
    return ("\n".join(out) + "\n").encode("utf-8")


class Case(unittest.TestCase):
    """Each test gets a fresh repo/logs/ directory and saves its bundle into it."""

    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.logs = self.root / "logs"
        self.logs.mkdir()
        self.bundle = self.logs / BUNDLE_NAME

    def save(self, data: bytes) -> Path:
        self.bundle.write_bytes(data)
        return self.bundle

    def logs_now(self) -> set[str]:
        return {p.name for p in self.logs.iterdir()}

    def assert_refused(self, data: bytes, *fragments: str) -> None:
        """Refused, with every fragment in the message, nothing written, and the bundle kept."""
        before = {p.name for p in self.root.rglob("*")}
        with self.assertRaises(unbundle.BundleError) as caught:
            unbundle.unbundle(self.save(data))
        for fragment in fragments:
            self.assertIn(fragment, str(caught.exception))
        self.assertEqual({p.name for p in self.root.rglob("*")}, before | {BUNDLE_NAME})
        self.assertEqual(self.bundle.read_bytes(), data)


class RoundTrip(Case):
    FILES = {
        "trailing-newline.txt": "a\nb\n",
        "no-trailing-newline.csv": "x,y\n1,2",
        "empty.txt": "",
        "only-newlines.txt": "\n\n",
        "unicode.txt": "loss 0.6  ←[K\n━━━ 100%\n",
        "progress.txt": "10%\r20%\r30%\ndone\n",
        "ends-in-bare-cr.txt": "50%\r",
        "marker-lookalikes.txt": (
            "--- END 00000000000000000000000000000000 ---\n"
            "=== END BUNDLE 00000000000000000000000000000000 ===\n"
            "--- BEGIN ffffffffffffffffffffffffffffffff lines=1 sha256=" + "0" * 64 + " x.txt ---\n"
        ),
    }

    def assert_round_trip(self, data: bytes) -> None:
        placed = unbundle.unbundle(self.save(data))
        self.assertEqual(self.logs_now(), set(self.FILES))
        for name, text in self.FILES.items():
            self.assertEqual((self.logs / name).read_bytes(), text.encode("utf-8"), name)
        self.assertTrue(all(p.written for p in placed))

    def test_every_file_comes_back_byte_for_byte_and_the_bundle_is_deleted(self) -> None:
        self.assert_round_trip(encode(self.FILES))

    def test_crlf_added_in_transit_is_undone_exactly(self) -> None:
        self.assert_round_trip(encode(self.FILES).replace(b"\n", b"\r\n"))

    def test_surrounding_whitespace_is_ignored(self) -> None:
        self.assert_round_trip(b"\n \n" + encode(self.FILES) + b"\n\n  ")

    def test_crlf_in_the_original_file_becomes_lf(self) -> None:
        unbundle.unbundle(self.save(encode({"win.txt": "a\r\nb\r\n"})))
        self.assertEqual((self.logs / "win.txt").read_bytes(), b"a\nb\n")

    def test_identical_file_already_present_is_skipped(self) -> None:
        (self.logs / "a.txt").write_bytes(b"same\n")
        placed = unbundle.unbundle(self.save(encode({"a.txt": "same\n", "b.txt": "new\n"})))
        self.assertEqual({p.path.name: p.written for p in placed}, {"a.txt": False, "b.txt": True})
        self.assertFalse(self.bundle.exists())

    def test_no_temporary_files_are_left_behind(self) -> None:
        unbundle.unbundle(self.save(encode(self.FILES)))
        self.assertFalse([n for n in self.logs_now() if n.endswith(".part")])


class HandWrittenFixture(Case):
    """The fixture was written by hand, its checksums taken with `shasum`, not with this code."""

    def setUp(self) -> None:
        super().setUp()
        self.data = FIXTURE.read_bytes()

    def test_fixture_unbundles(self) -> None:
        unbundle.unbundle(self.save(self.data))
        self.assertEqual(
            self.logs_now(),
            {f"2026-11-16-RUNBOOK-BUNDLE-01-{n}" for n in ("train.txt", "metrics.csv", "warnings.txt")},
        )
        train = (self.logs / "2026-11-16-RUNBOOK-BUNDLE-01-train.txt").read_text("utf-8")
        self.assertIn("--- END 00000000000000000000000000000000 ---\n", train)
        self.assertIn("←[K", train)
        self.assertTrue(train.endswith("wall_clock: 00:41:07\n"))
        metrics = self.logs / "2026-11-16-RUNBOOK-BUNDLE-01-metrics.csv"
        self.assertEqual(metrics.read_bytes(), b"epoch,loss,val_iou\n1,0.912,0.41\n2,0.604,0.48")
        self.assertEqual((self.logs / "2026-11-16-RUNBOOK-BUNDLE-01-warnings.txt").read_bytes(), b"")

    def test_fixture_with_crlf_added_in_transit_unbundles(self) -> None:
        unbundle.unbundle(self.save(self.data.replace(b"\n", b"\r\n")))
        self.assertEqual(len(self.logs_now()), 3)

    def test_truncated_paste_is_refused(self) -> None:
        self.assert_refused(self.data[: len(self.data) // 2], "cut short")

    def test_paste_cut_between_files_is_refused(self) -> None:
        cut = self.data.index(b"--- BEGIN", self.data.index(b"metrics.csv ---"))
        self.assert_refused(self.data[:cut], "cut short")

    def test_altered_text_fails_its_checksum_and_nothing_is_written(self) -> None:
        self.assert_refused(self.data.replace(b"0.604,0.48", b"0.604,0.49"), "metrics.csv: checksum mismatch")

    def test_lost_line_fails_its_line_count(self) -> None:
        self.assert_refused(self.data.replace(b"1,0.912,0.41\n", b""), "expected 2 lines, got 1")

    def test_path_traversal_is_refused(self) -> None:
        for bad in ("../evil.txt", "/tmp/evil.txt", "sub/evil.txt", "..\\evil.txt", ".."):
            with self.subTest(bad):
                data = self.data.replace(b"2026-11-16-RUNBOOK-BUNDLE-01-metrics.csv ---", bad.encode() + b" ---")
                self.assert_refused(data, "refused name")


class Refusals(Case):
    def test_different_existing_file_is_kept_and_nothing_else_written(self) -> None:
        (self.logs / "a.txt").write_bytes(b"original\n")
        self.assert_refused(encode({"a.txt": "other\n", "b.txt": "new\n"}), "already exists with different content")
        self.assertEqual((self.logs / "a.txt").read_bytes(), b"original\n")

    def test_symlink_pointing_out_of_logs_is_refused(self) -> None:
        (self.logs / "a.txt").symlink_to(self.root / "elsewhere.txt")
        self.assert_refused(encode({"a.txt": "x\n"}), "resolves outside")

    def test_a_bundle_inside_a_bundle_is_refused(self) -> None:
        self.assert_refused(encode({"2026-11-15-X-01-bundle.txt": "x\n"}), "never carries another bundle")

    def test_duplicate_names_are_refused(self) -> None:
        token = uuid.uuid4().hex
        one = encode({"a.txt": "x\n"}, token).split(b"\n")
        # one = header, BEGIN, "x", "", END, footer, "": the block is one[1:5].
        data = b"\n".join([one[0].replace(b"files=1", b"files=2"), *one[1:5], *one[1:5], one[5], b""])
        self.assert_refused(data, "appears twice")

    def test_file_count_must_match_the_header(self) -> None:
        self.assert_refused(encode({"a.txt": "x\n"}).replace(b"files=1", b"files=2", 1), "promises 2 files but 1")

    def test_text_that_is_not_a_bundle_is_refused(self) -> None:
        self.assert_refused(b"epoch 1/2 loss 0.9\n", "not a bundle")

    def test_empty_paste_is_refused(self) -> None:
        self.assert_refused(b"\n", "empty")

    def test_unknown_format_version_is_refused(self) -> None:
        self.assert_refused(encode({"a.txt": "x\n"}).replace(b"BUNDLE v1", b"BUNDLE v2", 1), "v2 is not supported")


class CommandLine(Case):
    def run_main(self, data: bytes) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = unbundle.main([str(self.save(data))])
        return code, out.getvalue(), err.getvalue()

    def test_success_prints_a_summary_naming_every_file(self) -> None:
        code, out, _ = self.run_main(encode({"a.txt": "x\ny\n"}))
        self.assertEqual(code, 0)
        self.assertIn("Unbundled 1 files", out)
        self.assertIn(f"{self.logs / 'a.txt'}  2 lines", out)

    def test_refusal_exits_1_and_says_the_bundle_is_kept(self) -> None:
        code, out, err = self.run_main(b"not a bundle\n")
        self.assertEqual((code, out), (1, ""))
        self.assertIn("it is kept", err)


if __name__ == "__main__":
    unittest.main()
