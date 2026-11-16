r"""Split a pasted log bundle back into the files it carries.

Research runs happen on a Windows GPU server reached over RDP, and only text crosses back to this
Mac (guidelines/research.md). A runbook's last step joins every log and CSV the run wrote into one
block of text, a *bundle*, and puts it on the server's clipboard. On the Mac it is saved with one
command, `pbpaste > logs/<YYYY-MM-DD>-<TASK-ID>-bundle.txt`, and this script turns it back into the
original files beside it.

Usage:
    python3 ~/.claude/skills/log-experiment/unbundle.py logs/<YYYY-MM-DD>-<TASK-ID>-bundle.txt

Exit 0: every file is in place and the bundle is deleted. stdout is a short summary to relay.
Exit 1: the bundle was refused and is kept. stderr says why. A problem found while checking
writes nothing. A write that fails part-way leaves the files already in place, and a re-run
skips them.

Format, version 1
=================

This docstring is the spec. The PowerShell in the runbook template's `## Bundle` step writes it
and must match it exactly. `encode` in test_unbundle.py is a reference encoder in Python.

A bundle is UTF-8 text, lines joined with LF:

    === BUNDLE v1 <token> files=<count> ===
    --- BEGIN <token> lines=<lines> sha256=<sha256> <name> ---
    <content>
    --- END <token> ---
    (one BEGIN / content / END block per file)
    === END BUNDLE <token> ===

- <token> is random per bundle: 32 lowercase hex characters, `[guid]::NewGuid().ToString('N')`.
  Every marker carries it, so a log line that merely looks like a marker is just content. It
  cannot contain a token that did not exist when the log was written.
- <count> is the number of file blocks. With the closing line, it catches a paste cut short
  between two files.
- <name> is a bare file name, such as `2026-11-16-ABC-DEF-01-train.txt`: no `/` or `\`, and not
  `.` or `..`. Files are written into the directory holding the bundle, which is `logs/`, so
  nothing can land anywhere else. A name ending in `-bundle.txt` is refused. A bundle never
  carries a bundle, so the bundler must leave its own saved copy out of the files it gathers.
- <content> is the file's text, read honouring a byte-order mark and as UTF-8 otherwise
  (`[IO.File]::ReadAllText`), with every CRLF turned into LF. Nothing else changes: no ANSI
  stripping and no trimming. A lone CR, such as a progress-bar redraw, stays.
- A block is: the BEGIN line, LF, the content, LF, the END line. The LF before END is framing,
  not content. So a file holding "a\n" is framed `BEGIN\na\n\nEND`, a file holding "a" is
  `BEGIN\na\nEND`, and an empty file is `BEGIN\n\nEND`.
- <lines> is the number of LF characters in the content. <sha256> is the lowercase hex SHA-256
  of the content's UTF-8 bytes, with no BOM. A wrong line count means the paste was cut short or
  lines were lost. A right count with a wrong checksum means the text was altered.
- Whitespace before the first line and after the last line is ignored.

What this side does with it:

- If the first line arrives ending in CRLF, the clipboard hop turned every LF into CRLF, so
  every CRLF is turned back into LF before parsing. This is exact, because the bundler already
  removed every CRLF from the content. Any other change in transit fails a checksum.
- Every block's line count and checksum are checked before any file is written.
- A file already present with the same checksum is skipped. One with different content refuses
  the whole bundle. That makes a re-run after a failure safe.
- Each file is written under a temporary name and renamed into place, so Google Drive never
  syncs half a log.
- The bundle is deleted only after every file is in place.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from dataclasses import dataclass
from pathlib import Path

HEADER = re.compile(rb"=== BUNDLE v(?P<version>\d+) (?P<token>[0-9a-f]{32}) files=(?P<count>\d+) ===")


class BundleError(Exception):
    """The bundle was refused. Each argument is one problem, worded for the human."""

    def __str__(self) -> str:
        return "\n".join(f"  - {problem}" for problem in self.args)


@dataclass(frozen=True)
class Entry:
    """One file carried by a bundle, as its BEGIN line describes it."""

    name: str
    lines: int
    sha256: str
    content: bytes


@dataclass(frozen=True)
class Placed:
    """One file that is now in place, and whether this run wrote it."""

    path: Path
    lines: int
    written: bool


def parse(data: bytes) -> list[Entry]:
    """Split a bundle into its entries. Checks structure only, not names or checksums.

    Raises:
        BundleError: the text is not a whole v1 bundle.
    """
    data = data.strip()
    if not data:
        raise BundleError("the file is empty: nothing was pasted")
    if data.split(b"\n", 1)[0].endswith(b"\r"):
        data = data.replace(b"\r\n", b"\n")
    lines = data.split(b"\n")

    header = HEADER.fullmatch(lines[0])
    if not header:
        raise BundleError(f"not a bundle: the first line is {lines[0][:80]!r}")
    if header["version"] != b"1":
        raise BundleError(f"bundle format v{header['version'].decode()} is not supported; this reads v1")
    token, count = header["token"], int(header["count"])

    if len(lines) < 2 or lines[-1] != b"=== END BUNDLE " + token + b" ===":
        raise BundleError(
            "the paste was cut short: the closing `=== END BUNDLE` line is missing. "
            "Copy the bundle again on the server and save it again."
        )

    begin = re.compile(
        rb"--- BEGIN " + token + rb" lines=(?P<lines>\d+) sha256=(?P<sha>[0-9a-fA-F]{64}) (?P<name>.+) ---"
    )
    end = b"--- END " + token + b" ---"
    entries: list[Entry] = []
    i, last = 1, len(lines) - 1
    while i < last:
        match = begin.fullmatch(lines[i])
        if not match:
            raise BundleError(f"line {i + 1}: expected a BEGIN line, found {lines[i][:80]!r}")
        name = match["name"].decode("utf-8", errors="replace")
        try:
            j = lines.index(end, i + 1, last)
        except ValueError:
            raise BundleError(f"{name}: no END line, so the block is incomplete") from None
        # BEGIN, LF, content, LF, END: split on LF, the content is at least one (maybe empty) line.
        if j == i + 1:
            raise BundleError(f"{name}: the block is missing the framing line before END")
        content = b"\n".join(lines[i + 1 : j])
        entries.append(Entry(name, int(match["lines"]), match["sha"].lower().decode(), content))
        i = j + 1

    if len(entries) != count:
        raise BundleError(f"the header promises {count} files but {len(entries)} arrived")
    return entries


def name_problem(name: str) -> str | None:
    """Why a name may not be written into logs/, or None when it is a safe bare file name."""
    if not name or name in (".", "..") or any(c in name for c in "/\\\0"):
        return f"refused name {name!r}: a bundle carries bare file names, with no path"
    if name.endswith("-bundle.txt"):
        return f"refused name {name!r}: a bundle never carries another bundle"
    return None


def content_problem(entry: Entry) -> str | None:
    """Why an entry's content is not what its BEGIN line promised, or None when it matches."""
    lines = entry.content.count(b"\n")
    if lines != entry.lines:
        return f"{entry.name}: expected {entry.lines} lines, got {lines}. The paste was cut short or altered"
    if hashlib.sha256(entry.content).hexdigest() != entry.sha256:
        return f"{entry.name}: checksum mismatch. The text changed in transit"
    return None


def plan_writes(entries: list[Entry], logs: Path) -> list[tuple[Entry, Path, bool]]:
    """Check every entry and destination. Returns (entry, path, needs writing) for each.

    Raises:
        BundleError: listing every problem found, so one re-copy can fix all of them.
    """
    problems: list[str] = []
    seen: set[str] = set()
    plan: list[tuple[Entry, Path, bool]] = []
    for entry in entries:
        problem = name_problem(entry.name) or content_problem(entry)
        if entry.name in seen:
            problem = f"{entry.name}: appears twice in the bundle"
        seen.add(entry.name)
        if problem:
            problems.append(problem)
            continue

        path = logs / entry.name
        # Defence in depth: a symlink already sitting in logs/ could point anywhere.
        if path.resolve().parent != logs.resolve():
            problems.append(f"{path}: resolves outside {logs}")
        elif not path.exists():
            plan.append((entry, path, True))
        elif path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == entry.sha256:
            plan.append((entry, path, False))
        else:
            problems.append(f"{path}: already exists with different content; refusing to overwrite it")

    if problems:
        raise BundleError(*problems)
    return plan


def write_atomically(path: Path, content: bytes) -> None:
    """Write under a temporary name, then rename, so a syncing Google Drive never sees half."""
    temp = path.with_name(f".{path.name}.part")
    try:
        temp.write_bytes(content)
        temp.replace(path)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise


def unbundle(bundle: Path) -> list[Placed]:
    """Write every file in the bundle beside it, then delete the bundle.

    Raises:
        BundleError: the bundle was refused and is kept.
    """
    if not bundle.is_file():
        raise BundleError(f"{bundle}: no such file")
    plan = plan_writes(parse(bundle.read_bytes()), bundle.parent)
    for entry, path, needs_writing in plan:
        if needs_writing:
            write_atomically(path, entry.content)
    bundle.unlink()
    return [Placed(path, entry.lines, needs_writing) for entry, path, needs_writing in plan]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Split a pasted log bundle back into its files.")
    parser.add_argument("bundle", type=Path, help="logs/<YYYY-MM-DD>-<TASK-ID>-bundle.txt")
    bundle = parser.parse_args(argv).bundle
    try:
        placed = unbundle(bundle)
    except BundleError as error:
        print(f"Refused {bundle}; it is kept.\n{error}", file=sys.stderr)
        return 1
    except OSError as error:
        print(f"Failed writing from {bundle}; it is kept, and a re-run skips files already in place.\n  - {error}", file=sys.stderr)
        return 1

    width = max((len(str(p.path)) for p in placed), default=0)
    print(f"Unbundled {len(placed)} files from {bundle}, then deleted it:")
    for p in placed:
        note = "" if p.written else ", already present and identical"
        print(f"  {'wrote  ' if p.written else 'skipped'}  {str(p.path):<{width}}  {p.lines} lines{note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
