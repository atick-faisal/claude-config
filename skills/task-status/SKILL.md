---
description: Set one task's Status in its feature's tasks.md, then roll up the feature's plan.md frontmatter status to match the table. Called by /implement at the start and end of a task.
argument-hint: "<task-id> <pending|in-progress|done|blocked> [reason]"
---

# Task status

One row, one cell. `$ARGUMENTS` is a task ID, then a status, then optionally a short reason:

```
AUTH-ROTATION-02 in-progress
AUTH-ROTATION-02 blocked  waiting on the Redis instance in staging
```

This is the one skill in the support set the model may invoke on its own — `/implement` calls it
twice per task, `in-progress` at the top of the build turn and `done` once `just verify` is green.
That is why it has to stay narrow. It writes **one Status cell**, optionally one Notes cell, and as
a consequence one frontmatter field. It never edits a Description, never adds or removes a row,
never renumbers anything, and never touches `plan.md`'s body.

---

## 1. Validate the status

The vocabulary is exactly `pending | in-progress | done | blocked`. Anything else — `wip`,
`complete`, `WONTFIX`, a typo — is refused, not coerced. Say which four are legal and stop.
`tasks.md` is read by other skills and by the human; a fifth value silently breaks all of them.

If the status is missing entirely, ask for it. Do not guess from context.

## 2. Resolve the task

Run `git rev-parse --show-toplevel`. If it fails you are not in a git repo — use the working
directory and say so, do not abort.

Grep `docs/features/*/tasks.md` for the ID. One hit gives you the row and the feature directory
that owns it.

**Two or more hits** — should not happen, since slugs are unique under `docs/features/`. Something
is wrong with the tree. Show both paths, **STOP**, ask which. Never write to both.

**No hit — the inline path.** Expected, not an error: `/feature-plan`'s trivial/small verdict
assigns an ad-hoc `<SLUG>-01` and deliberately writes nothing under `docs/`. Say the ID is not on
disk, that there is therefore no status to set, and stop. Write nothing. Do **not** create a
`docs/features/` directory, a `tasks.md`, or a row — only `/feature-plan` scaffolds a feature.

## 3. Write the Status cell

Edit that row's Status cell and nothing else on the line. Keep the table's existing column
alignment; a status change should be a one-line diff.

**If the cell already holds the requested status**, say so and write nothing. A no-op edit that
rewrites the file is a diff the human has to read for no reason.

**The reason argument**, when given, appends to that row's Notes cell — short, semicolon-separated
after whatever is already there. Anything longer than a clause belongs in `plan.md` via
`/task-plan`, not in a table cell.

**Setting `blocked` with no reason: ask for one.** A blocked row whose Notes do not say what it is
waiting on is a row that stalls the whole feature invisibly. This is the one case where this skill
stops to ask.

## 4. Roll up `plan.md`

This skill owns the feature's `plan.md` frontmatter `status:` field. `/implement` deliberately
never touches `plan.md`, and `/feature-plan` stops caring once the docs are written, so if this
step is skipped a shipped feature sits at `planned` forever.

**Derive the value from the whole table after your edit** — re-read every row's Status and map:

| Table state | `plan.md` frontmatter |
| --- | --- |
| every row `done` | `shipped` |
| any row not `pending` (in-progress, done or blocked present) | `in-progress` |
| every row `pending` | `planned` |

Derive, do not infer from the transition you just made. A row moved back to `pending`, or a `done`
row flipped to `blocked`, has to be able to pull `shipped` back to `in-progress` — and it can only
do that if the value is recomputed from the table each time.

Never write `draft`. That state means "Open Questions still unanswered, no tasks.md yet", and a
`tasks.md` existing is proof it no longer applies.

If the frontmatter already holds the derived value, leave it alone. If `plan.md` is missing, note
that in a line and carry on — the Status cell is still written.

## 5. Report

End with the closing block (`CLAUDE.md`, "How I like answers"). The Summary names the task by
what it does, not its ID, with the old status → the new one, and the roll-up if it changed:

> The token-refresh task moved from pending to in-progress, and so did the feature as a whole.

Called mid-loop by `/implement`, a single line in the same plain words is enough; the closing
block belongs to `/implement`'s own report.

On `done`, suggest `/commit-task <ID>`. On `blocked`, suggest nothing — the next move is the
human's. Suggest; never invoke.

**Report only what you read.** This skill writes `tasks.md` and, as a consequence, `plan.md`. Some
repos track a larger unit above the feature — a roadmap, a milestone list, a phase board — and
handing that back to the human is fair. Naming its state is not, unless you opened the file and
found the row.

---

## Guardrails

- **Four statuses, no coercion.**
- **One cell, one line, one diff.** Never rewrite the table, never reorder rows, never reformat.
- **Never add, remove, renumber or reuse a task ID.** `/feature-plan`, `/task-plan` and
  `/audit-feature` own rows.
- **Never touch `plan.md`'s body**, `decisions.md`, `pitfalls.md`, `docs/goal.md`, or any code.
- **Never scaffold a feature directory.** No hit means no hit.
- **Never stage or commit.** `/commit-task` owns git.
