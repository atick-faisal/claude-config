#!/bin/bash
# Guards against ending a session with uncommitted work.
#
# Two modes, driven by the hook event:
#   baseline  (SessionStart) - record a hash of the working tree state
#   check     (Stop)         - block once if the tree changed since that baseline
#
# Design notes:
#   - Compares against a baseline rather than blocking on any dirty tree, so a Q&A session in an
#     already-dirty repo does not get interrupted.
#   - Never checks unpushed commits: pushing is denied in settings.json, so that would always fire.
#   - /implement ends its turn green-but-uncommitted by design and /commit-task is human-only,
#     so the message points at /commit-task rather than telling the model to commit.
#   - Exit 2 is the only code that blocks a Stop hook. Exit 1 is a silent non-blocking error.
#   - There is no stop_hook_active field, so the state file is the loop guard: it is removed after
#     blocking once, and the next Stop passes.

set -uo pipefail

MODE="${1:-check}"
STATE_DIR="$HOME/.claude/hooks/state"

payload=$(cat)
session_id=$(printf '%s' "$payload" | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin).get("session_id",""))' 2>/dev/null)
cwd=$(printf '%s' "$payload" | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin).get("cwd",""))' 2>/dev/null)

[ -n "$session_id" ] || exit 0
[ -n "$cwd" ] && cd "$cwd" 2>/dev/null || exit 0

# Not a git repo - nothing to guard.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

state_file="$STATE_DIR/$session_id"
current=$(git status --porcelain 2>/dev/null | shasum | cut -d' ' -f1)

if [ "$MODE" = "baseline" ]; then
    mkdir -p "$STATE_DIR"
    printf '%s' "$current" > "$state_file"
    # Opportunistic cleanup of state files older than a week.
    find "$STATE_DIR" -type f -mtime +7 -delete 2>/dev/null
    exit 0
fi

# check mode. No baseline means we never saw this session start - do not block.
[ -f "$state_file" ] || exit 0
baseline=$(cat "$state_file")

if [ "$current" = "$baseline" ]; then
    exit 0
fi

# The tree changed during this session and is not committed. Block once.
rm -f "$state_file"
dirty=$(git status --short | head -20)
cat >&2 <<MSG
Uncommitted work from this session in $(pwd):

$dirty

If this is a finished task in an onboarded repo, do NOT commit it yourself: /commit-task
<TASK-ID> reviews the diff and splits it by scope, and a human types it. Say the work is
ready to commit and stop there.

Otherwise commit it directly - gitmoji + conventional + task ID in the subject, never push -
or tell me explicitly to leave it dirty. This check will not fire again this session.
MSG
exit 2
