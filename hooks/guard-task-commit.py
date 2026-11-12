#!/usr/bin/python3
"""PreToolUse guard: refuse a `git commit` whose subject carries no task ID.

The planning system (docs/goal.md Non-Goals) rejects a journal/changelog: git log IS the change history, and a
task is findable later only via `git log --grep=<TASK-ID>`. That holds only while the ID actually
reaches the message, so this blocks the commits that forget it.

Gates, cheapest first — every one of them exits 0, because this must be invisible in repos and
commands that have nothing to do with the system:
  1. the command does not mention "commit"          (~every Bash call)
  2. no `git [global opts] commit` segment in it     (`git log --grep=commit` is not a commit)
  3. the target repo is not a git repo, or has no docs/features/*/tasks.md  (not onboarded)
     — target being the session cwd unless the command moved: `cd <repo> && git commit`,
     `git -C <repo> commit`
  4. the message is inherited (--amend/--no-edit/-C/--squash/--fixup)   (guarded when written)
  5. the subject carries (<TASK-ID>), or the [no-task] opt-out

Design notes:
  - Exit 2 is the only code that blocks a PreToolUse hook, and its stderr becomes the reason shown
    to the model. Exit 1 is a silent non-blocking error. Mirrors check-clean.sh.
  - Warning-and-block, never a rewrite: the message names the convention and the repo's
    in-progress rows, then leaves the fix to the human/model.
  - Registered globally with matcher "Bash" and no `if:` narrowing. A wrong `if` expression fails
    silently — the guard would never run and nothing would say so. Gate 1 cannot fail that way.
  - Fails OPEN. Any unexpected error exits 0: a convenience guard must never be what stops a
    commit from being possible at all.
  - A message built by command substitution (the `-m "$(cat <<'EOF' ... EOF)"` form) is checked
    against the raw command text instead: if the pattern appears nowhere in it, it is not in the
    message either.
  - Heredoc bodies are data, not command text, and are stripped before tokenizing. Without that,
    `cat > notes.md <<'EOF'` followed by prose about this very convention reads as a real
    invocation two ways over: an apostrophe in the prose breaks shlex and lands in the raw-text
    fallback, and prose that tokenizes cleanly yields a matching segment outright. Bodies are
    kept rather than discarded, so a `-F -` message is still checked against the one feeding it.
  - The ID shape is <FEATURE-SLUG>-NN from templates/tasks.md. The two-digit tail is what keeps
    UTF-8, SHA-1 and ADR-1 from passing as task IDs. A roadmap phase ID, P<phase>-<n> with an
    optional sub-task letter (P5-8, P3-12c), is the one shape allowed a single digit: it is a
    live task ID in repos that track phases above the feature layer, and the leading P plus a
    phase number keeps it as narrow as the tail rule.
"""

import glob
import json
import os
import re
import shlex
import subprocess
import sys

TASK_ID = re.compile(r"\((?:[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,}|P\d+-\d+[a-z]?)\)")
NO_TASK = "[no-task]"
OPERATORS = {"&&", "||", ";", "|", "&", "\n"}
# git global options that consume the following token, so `commit` after one is still the subcommand
GIT_OPTS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path",
                       "--super-prefix"}
# `git commit` options meaning "reuse an existing message" — nothing new to check
INHERITED = {"--no-edit", "--amend", "--squash", "--fixup", "-C", "--reuse-message", "-c",
             "--reedit-message"}


# A heredoc redirection: <<EOF, <<'EOF', <<-"EOF". Not <<< (herestring).
HEREDOC_OP = re.compile(r"""(?<!<)<<(-?)\s*(?:(['"])([A-Za-z_][A-Za-z0-9_]*)\2|([A-Za-z_][A-Za-z0-9_]*))(?!<)""")


def strip_heredocs(command):
    """(command text with every heredoc body removed, [bodies in the order opened]).

    A body is data the command *writes*, not shell the command runs, so it must not be
    tokenized as though it were. Returned rather than dropped because a `-F -` message comes
    from exactly that body.
    """
    lines = command.split("\n")
    skeleton, bodies, i = [], [], 0
    while i < len(lines):
        line = lines[i]
        skeleton.append(line)
        i += 1
        for m in HEREDOC_OP.finditer(line):
            delim = m.group(3) or m.group(4)
            strip_tabs = m.group(1) == "-"
            body = []
            while i < len(lines):
                raw = lines[i]
                i += 1
                if (raw.strip() if strip_tabs else raw) == delim:
                    break
                body.append(raw)
            bodies.append("\n".join(body))
    return "\n".join(skeleton), bodies


def segments(tokens):
    """Split a token stream on shell operators into individual commands."""
    out, cur = [], []
    for tok in tokens:
        if tok in OPERATORS or tok.endswith(";"):
            if tok.endswith(";") and tok not in OPERATORS:
                cur.append(tok[:-1])
            if cur:
                out.append(cur)
            cur = []
        else:
            cur.append(tok)
    if cur:
        out.append(cur)
    return out


def commit_args(seg):
    """(args after `commit`, dir from `git -C <dir>`) if this segment is a git commit, else None."""
    i = 0
    while i < len(seg) and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", seg[i]):
        i += 1  # leading env assignments: FOO=bar git commit ...
    if i >= len(seg) or os.path.basename(seg[i]) != "git":
        return None
    i += 1
    repo_dir = None
    while i < len(seg) and seg[i].startswith("-"):
        if seg[i] in GIT_OPTS_WITH_VALUE:
            if seg[i] in ("-C", "--git-dir", "--work-tree") and i + 1 < len(seg):
                repo_dir = seg[i + 1]
            i += 2
        else:
            i += 1
    if i < len(seg) and seg[i] == "commit":
        return seg[i + 1:], repo_dir
    return None


def cd_target(seg):
    """The directory of a bare `cd <dir>` segment, else None."""
    if len(seg) == 2 and seg[0] == "cd" and not seg[1].startswith("-"):
        return seg[1]
    return None


def extract_messages(args, stdin_bodies=()):
    """Messages passed to `git commit`, in order, plus whether the message is inherited."""
    msgs, inherited, i = [], False, 0
    while i < len(args):
        a = args[i]
        if a in INHERITED:
            inherited = True
            if a in ("-C", "-c", "--reuse-message", "--reedit-message"):
                i += 2
                continue
        elif a.startswith("--message="):
            msgs.append(a[len("--message="):])
        elif a == "--message" or a == "-m":
            if i + 1 < len(args):
                msgs.append(args[i + 1])
            i += 2
            continue
        elif a.startswith("--file="):
            msgs.append(read_source(a[len("--file="):], stdin_bodies))
        elif a in ("--file", "-F"):
            if i + 1 < len(args):
                msgs.append(read_source(args[i + 1], stdin_bodies))
            i += 2
            continue
        elif a.startswith("-") and not a.startswith("--") and "m" in a:
            # short cluster: -am "msg" / -sm "msg" / -mmsg
            idx = a.index("m")
            if idx == len(a) - 1:
                if i + 1 < len(args):
                    msgs.append(args[i + 1])
                i += 2
                continue
            msgs.append(a[idx + 1:])
        i += 1
    return [m for m in msgs if m is not None], inherited


def read_source(path, stdin_bodies):
    """A -F argument: the heredoc feeding stdin, or the contents of a named file."""
    if path in ("-", "/dev/stdin"):
        return stdin_bodies[0] if stdin_bodies else None
    return read_file(path)


def read_file(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return None


def in_progress_rows(top):
    """Best-effort: `<ID> — <description>` for every in-progress row across the repo's features."""
    rows = []
    for path in sorted(glob.glob(os.path.join(top, "docs", "features", "*", "tasks.md"))):
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                lines = fh.read().splitlines()
        except OSError:
            continue
        for line in lines:
            if not line.lstrip().startswith("|"):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 5 and cells[4].lower() == "in-progress":
                rows.append("%s — %s" % (cells[0], cells[1]))
    return rows[:5]


def block(top, subject, note=None):
    lines = []
    if note:
        lines.append(note)
    lines.append("Commit blocked: no task ID in the subject line.")
    lines.append("")
    if subject:
        lines.append("  subject: %s" % subject.strip())
        lines.append("")
    lines.append("This repo has docs/features/*/tasks.md, so its history is the task record —")
    lines.append("`git log --grep=<TASK-ID>` is how /implement and /commit-task find a task's work.")
    lines.append("")
    lines.append("Required shape (see /commit-task):")
    lines.append("  <gitmoji> <type>(<scope>): <description> (<TASK-ID>)")
    lines.append("  e.g. ✨ feat(api): add refresh endpoint (AUTH-ROTATION-04)")
    rows = in_progress_rows(top)
    if rows:
        lines.append("")
        lines.append("In progress right now:")
        lines.extend("  " + r for r in rows)
    lines.append("")
    lines.append('If this commit genuinely belongs to no task, put [no-task] in the subject.')
    lines.append("Do not retry with --no-verify.")
    sys.stderr.write("\n".join(lines) + "\n")
    sys.exit(2)


def main():
    payload = json.load(sys.stdin)
    tool_input = payload.get("tool_input") or {}
    command = tool_input.get("command") or ""
    cwd = payload.get("cwd") or ""

    # 1. fast path — almost every Bash call leaves here
    if "commit" not in command:
        return

    # 2. is there a real `git ... commit` in there? The directory it commits into is the session
    #    cwd unless the command moved first — `cd <repo> && git commit` / `git -C <repo> commit`.
    skeleton, bodies = strip_heredocs(command)
    parsed, where = True, cwd
    try:
        args = None
        for seg in segments(shlex.split(skeleton)):
            target = cd_target(seg)
            if target:
                where = target if os.path.isabs(target) else os.path.join(where, target)
                continue
            found = commit_args(seg)
            if found is not None:
                args, repo_dir = found
                if repo_dir:
                    where = repo_dir if os.path.isabs(repo_dir) else os.path.join(where, repo_dir)
                break
        if args is None:
            return
    except ValueError:
        # unbalanced quotes even with the bodies gone — cannot tokenize. Match the skeleton, so
        # prose inside a heredoc can never be what puts us here.
        if not re.search(r"\bgit\b[^\n;|&]*\bcommit\b", skeleton):
            return
        parsed, args = False, []

    # 3. onboarded repo?
    if not where or not os.path.isdir(where):
        return
    try:
        top = subprocess.run(["git", "-C", where, "rev-parse", "--show-toplevel"],
                             capture_output=True, text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return
    if not top or not glob.glob(os.path.join(top, "docs", "features", "*", "tasks.md")):
        return

    if not parsed:
        # Fall back to the raw command text: if the pattern appears nowhere in it, it is not in
        # the message either.
        if TASK_ID.search(command) or NO_TASK in command:
            return
        block(top, None, note="(could not parse the command; scanned its full text)")

    msgs, inherited = extract_messages(args, bodies)
    if not msgs:
        # 4. inherited message, or an editor commit we cannot see — same raw-text fallback
        if inherited or TASK_ID.search(command) or NO_TASK in command:
            return
        block(top, None, note="(no -m/-F message found on this commit)")

    # 5. the subject is the first line of the first message
    subject = msgs[0].splitlines()[0] if msgs[0].splitlines() else ""

    # An unexpanded command substitution — `-m "$(cat <<'EOF' ... EOF)"`, the form Claude Code
    # writes for multi-line messages — means the real subject is not in the token we hold.
    if "$(" in msgs[0] or "`" in msgs[0]:
        if TASK_ID.search(command) or NO_TASK in command:
            return
        block(top, None, note="(message came from a command substitution; scanned the full text)")
    if NO_TASK in subject or TASK_ID.search(subject):
        return
    block(top, subject)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:  # fail open — never be the reason a commit is impossible
        sys.exit(0)
