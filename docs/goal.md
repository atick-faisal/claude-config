# Claude Code Planning + Implementation System

## Problem

Long-running project work in Claude Code has no memory between sittings. Decisions get
re-litigated, footguns get re-hit, and a task's context lives only in a transcript that is
gone next session. Ad-hoc prompting is fine for a one-liner and falls apart across weeks.

## Success Criteria

- A repo is onboarded by `/project-init` alone: `docs/goal.md`, a project `CLAUDE.md`, and a
  `justfile` exposing `verify` — no hand-editing needed afterwards.
- A feature planned by `/feature-plan` produces `docs/features/<slug>/` whose `plan.md`,
  `tasks.md`, `decisions.md` and `pitfalls.md` let a cold session pick up mid-feature.
- `/implement` refuses to call a task done until `just verify` exits zero.
- Every commit in an onboarded repo names its task ID, enforced by a hook, with `[no-task]`
  the only documented opt-out.
- No skill self-invokes and none chains into the next; every entrypoint is human-typed.
- The system is stack-agnostic — proven on a second project in a non-Python stack.

## Non-Goals

- A journal or changelog. Git log plus task-ID commit subjects is the history.
- Enforcement beyond the commit guard: no Stop-hook loop enforcement, no model-switch hook,
  no complexity heuristic that auto-triggers per-task planning.
- Changing default Claude Code behaviour. Ad-hoc work stays untouched by all of this.
- A shared cross-feature task counter. IDs are feature-slug-scoped, no coordination.
- Publishing `docs/features/` as documentation. It is agent state.
- Distribution to other people or machines.

## Constraints

- Lives in `~/.claude`, a directory Claude Code itself reads and writes in place. Machine
  state outnumbers hand-written config ~14:1; `.gitignore` is an allowlist and a new
  hand-authored file is invisible to git until it is named there.
- Every project it onboards must expose `just verify`. `just` is the runner, no exceptions.
- Hooks are snapshotted at session start — a hook change takes effect in the next session.
- `CLAUDE.md` here is the global instruction file loaded into every session in every
  project; length and wording cost on every task.
- `CLAUDE.md` imports a lessons index from an Obsidian vault under `~/.GoogleDrive/`, which
  lives outside this repo and syncs separately.
