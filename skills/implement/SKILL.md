---
description: Implement one task from a feature's tasks.md — loads the spec docs, states the plan, implements, and gates on `just verify`, stopping only for needed input or a destructive action.
argument-hint: "[task-id]"
disable-model-invocation: true
---

# Implementation loop

One task. Read what was already decided about it, say how you will build it, build it, and do not
call it done until `just verify` is green.

`$ARGUMENTS` is an optional task ID, e.g. `AUTH-ROTATION-02`. It may be absent.

## One turn, with stops only where they earn it

Read the whole file, then run it start to finish in **one turn**:

```
resolve repo root → resolve the task → load context → check the gate → state the plan
→ task-status in-progress → implement → verify loop → task-status done
→ closing block (suggest /commit-task)
```

**Stop only when the human's input is genuinely needed, or before a destructive action.** Each
**STOP** below means: end your turn, say nothing further, wait for the human. These are all of them:

- no ID was given — ask which task;
- the ID is not on disk, in a fresh session — ask for the plan;
- there is no `verify` gate;
- `plan.md` does not say how to build the task — offer `/task-plan`;
- an escalation trigger fires in the verify loop — Stuck, Judgment, Scope, Pre-existing red;
- the next step is a destructive action.

**Ping before you stop.** Right before ending the turn at any STOP above, before showing a
question picker (it waits for the human just like a STOP), and when the task goes green, call `PushNotification` (`status: "proactive"`) with one line that leads with what the human
must act on: `verify red, stuck on 2 auth tests` or `task done, run /commit-task`. Never for
progress. The tool already stays silent when the human is at the terminal or Remote Control is not
connected, so a "not sent" result is expected, not an error — do not retry it or mention it.

Everywhere else, keep going. The plan is still stated before code exists, so it sits in the
scrollback where the human can interrupt it. What makes the plan safe to act on without a "go
ahead" is that the real decisions were already made in front of the human — in `## Resolved`, or
in `/feature-plan`'s inline path, which already stopped once for approval. A second stop for the
same plan is friction, not review.

**Destructive** means any of these:

- deleting or overwriting anything this task did not create;
- rewriting git history, or any force operation;
- a schema or data migration against real data;
- deleting logs, results or experiment records;
- anything outside the repo.

Before one, say exactly what it would do and to what, and **STOP**. Approval covers that action
only, not the next one.

**Choices made without stopping are reported, not hidden.** A naming call, a helper reused instead
of written, an ambiguity read one way — when it matters, it goes in the closing block's Summary.

You never plan a feature. You do not add Open Questions, you do not edit `plan.md`, and you do not
re-open anything already sitting in its `## Resolved`. `/feature-plan`, `/task-plan` and
`/write-adr` own that.

---

## Resolve, load, gate

**Resolve the repo root.** Run `git rev-parse --show-toplevel`. If it fails, you are not in a git
repo: use the current working directory instead and say so. Do not abort.

### Resolve the task

**With an ID given.** Grep `docs/features/*/tasks.md` for it. One hit gives you both the task row
and the feature directory that owns it. No hit → the inline path below.

**With no ID.** Glob `docs/features/*/tasks.md` and collect every row whose Status is `pending`.
Present them grouped by feature, next-up row first within each — dependency order, and a row whose
`Notes` names an unfinished blocker is not next-up. Then **STOP and ask which one.**

Do not pick for them. Which feature the human is holding in their head today is not something the
file tree knows, and starting the wrong task costs more than the extra turn.

If nothing anywhere is `pending`, say so and stop. That is a `/feature-plan` situation, not this one.

**Inline path — the ID matches nothing on disk.** Expected, not an error: `/feature-plan`'s
trivial/small path assigns an ad-hoc `<SLUG>-01` and deliberately writes nothing under `docs/`.

- If **this conversation** already contains that inline plan, work from it. Skip every `tasks.md`
  interaction for the rest of the run, including both `task-status` calls.
- If it does not — a fresh session — say the ID is not on disk, run `git log --grep=<the ID>` in
  case earlier commits carry it, and ask the human to restate the plan or run `/feature-plan`.
  **STOP.** Never reconstruct a task from the shape of its ID.

### Load context

Read these in parallel. All are optional; when one is missing, note it in a line and carry on.

| File | What you are taking from it |
| --- | --- |
| `docs/goal.md` | Success Criteria, Non-Goals, Constraints — the standing check on scope creep |
| `docs/features/<slug>/plan.md` | Summary, Tech Stack / Approach, **Resolved**, Out of Scope |
| `docs/features/<slug>/tasks.md` | the row: Description, Complexity, Suggested Model, Notes |
| `docs/features/<slug>/decisions.md` | any ADR the row's Notes references |
| `docs/features/<slug>/pitfalls.md` | **unchecked** entries — carry forward any touching this task |
| `git status`, recent `git log` | uncommitted work, in-flight branch, earlier commits for this ID |

`## Resolved` in `plan.md` is settled law. Every option listed there was weighed once, in front of
the human, and the checked one won. Build the checked one. If you believe it is wrong, that is a
`/write-adr` conversation, not a silent substitution.

### Check the gate — before you state the plan

Look for a `verify` recipe: `just --list`, or read the `justfile`. If there is no justfile, or no
`verify` in it:

> Say so, suggest `/project-init` — which derives the recipe from what the repo's CI already runs —
> or offer to take a one-off verification command for this session, and **STOP.** Nothing gets
> implemented behind a gate that cannot close. Suggest; never invoke.

Check this *first*. A plan written out and then blocked on a missing gate wastes the human's
reading on something knowable at the top.

### State the plan

In conversation, not in a file, in a few lines:

- the files you will change, with paths and line anchors;
- the approach, naming the existing code being reused;
- what `just verify` will run against;
- any unchecked pitfall that applies to these files, quoted.

Then carry on into the build. The plan is stated so the work can be checked against it, and so the
human can interrupt — not to collect a "go ahead".

**If `plan.md` does not actually say how to build this** — the row is `moderate` or `complex` and
the Approach is silent on it, or two readings of it would produce different code — name what is
missing, offer `/task-plan <ID>`, and **STOP.** Offer it — never invoke it. A high Complexity on
its own is not a reason to stop when the plan already answers how.

---

## Implement, verify, mark

**Mark it started.** Invoke the `task-status` skill: `<ID> in-progress`. Skip on the inline path.

**Implement the one task.** One task per invocation. Finishing early is not permission to start the
next row — that is a fresh `/implement`. If the work turns out to need a file outside what you
stated in the plan, say so and **STOP**; do not quietly widen the diff.

### The verify loop

Run `just verify`. On failure, fix and rerun — **at most 3 fix attempts**, four runs in total.

Loop quietly. The human does not need a play-by-play of a ruff autofix; surface only when you are
green, when you hit the cap, or when one of the escalation triggers fires.

Fix attempts are for **mechanical** failures: lint, formatting, an obvious type or import error, a
test asserting something this task plainly and intentionally changed.

**Escalate immediately, before the cap, when any of these is true:**

- **Stuck** — the same failure signature comes back unchanged across two attempts. A third identical
  run will not find something the first two missed.
- **Judgment** — the fix needs a call `plan.md` did not settle: a design choice, an interface
  change, a failing test whose correct expectation is genuinely ambiguous.
- **Scope** — the fix would touch files outside what you stated in the plan.
- **Pre-existing red** — the failure is in code this task never touched. Report it as someone else's
  breakage. Do not repair it inside this task's diff, where it will land under this task's ID and
  disappear from history.

On escalation, report the failure output verbatim, what you tried, and which trigger stopped you.
**STOP.**

**Footguns.** When something undocumented costs you real time and would cost it again — a config
that silently does nothing, an ordering that matters, behaviour no one wrote down — say so and
suggest `/log-pitfall`. Suggest it; do not invoke it. A footgun that stays in the console is one the
next task hits too.

### On green

1. Invoke the `task-status` skill: `<ID> done`. It sets the Status cell and rolls up `plan.md`'s
   frontmatter. Skip entirely on the inline path — there is no `tasks.md`.
2. End with the closing block (`CLAUDE.md`, "How I like answers"): the Summary says in plain
   words what was built, any choice that mattered and was made without stopping, and that
   `just verify` is green.
3. Ping the human, then **STOP**, suggesting `/commit-task <ID>`.

Never `git add`, never `git commit`. `/commit-task` reviews the diff, groups it into commits by
logical scope, and it is the human's gate — it is deliberately not model-invocable.

---

## Guardrails

- **One task per invocation.** Never roll into the next row.
- **Stop only where this file says — and always stop there.** Never chain into `/commit-task`.
- **Never take a destructive action without stopping first.**
- **Never edit `plan.md`, `decisions.md` or `pitfalls.md`.** `/task-plan`, `/write-adr` and
  `/log-pitfall` own those. `docs/goal.md` is immutable.
- **Never implement behind a gate that cannot close.**
- **Never re-open a question already in `## Resolved`.**
- **Never stage or commit.**
- End with the next-step suggestion when the next step is obvious. It is a suggestion — you never
  invoke it yourself.
