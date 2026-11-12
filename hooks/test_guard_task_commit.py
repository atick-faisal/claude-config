"""Exercise the task-ID guard: does it still block, and has it stopped false-positiving?"""

import json
import os
import subprocess
import sys

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "guard-task-commit.py")
# The repo holding this test is itself onboarded (docs/features/*/tasks.md), so it
# stands in for "an onboarded repo" without naming any real project.
REPO = os.path.dirname(os.path.dirname(HOOK))

BLOCK, ALLOW = 2, 0

CASES = [
    # (expected exit, label, command)
    (ALLOW, "heredoc prose mentioning the convention (the reported bug)",
     "cat > n.md <<'EOF'\nA project's notes about git commit subjects and git-ignored files.\nEOF"),
    (ALLOW, "heredoc body that tokenizes cleanly as an invocation",
     'cat > n.md <<\'EOF\'\ngit commit -m "no id here"\nEOF'),
    (ALLOW, "python heredoc patching this very guard",
     "python3 - <<'PY'\nx = 'git commit -m subject'  # a project's text\nPY"),
    (ALLOW, "herestring is not a heredoc",
     'grep commit <<< "git commit -m nope"'),

    (BLOCK, "real -m with no task ID", 'git commit -m "fix the thing"'),
    (ALLOW, "real -m with a task ID", 'git commit -m "docs: x (ABC-DEF-01)"'),
    (ALLOW, "real -m with the opt-out", 'git commit -m "chore: x [no-task]"'),
    (ALLOW, "roadmap phase ID, single digit", 'git commit -m "docs: x (P5-8)"'),
    (ALLOW, "roadmap phase sub-task ID", 'git commit -m "docs: x (P3-12c)"'),
    (BLOCK, "UTF-8 is not a task ID", 'git commit -m "fix: read as (UTF-8)"'),
    (BLOCK, "ADR-1 is not a task ID", 'git commit -m "docs: per (ADR-1)"'),
    (BLOCK, "short cluster -am with no task ID", 'git commit -am "fix the thing"'),

    (BLOCK, "-F - heredoc message with no task ID",
     "git commit -F - <<'MSG'\ndocs: a subject with no id\n\nbody\nMSG"),
    (ALLOW, "-F - heredoc message carrying a task ID",
     "git commit -F - <<'MSG'\ndocs: a subject (ABC-DEF-01)\n\nbody\nMSG"),

    (ALLOW, "amend inherits its message", "git commit --amend --no-edit"),
    (ALLOW, "not a commit at all", 'git log --grep=commit'),
    (BLOCK, "cd into the repo first", 'cd %s && git commit -m "fix"' % REPO),
    (ALLOW, "unonboarded repo is none of our business", 'cd /tmp && git commit -m "fix"'),
]


def run(command):
    payload = json.dumps({"tool_input": {"command": command}, "cwd": REPO})
    return subprocess.run([sys.executable, HOOK], input=payload,
                          capture_output=True, text=True).returncode


failures = 0
for expected, label, command in CASES:
    actual = run(command)
    ok = actual == expected
    failures += not ok
    verb = {BLOCK: "block", ALLOW: "allow"}
    print("%s  expected %-5s got %-5s  %s" % (
        "ok  " if ok else "FAIL", verb[expected], verb.get(actual, actual), label))

print()
print("%d/%d passed" % (len(CASES) - failures, len(CASES)))
sys.exit(1 if failures else 0)
