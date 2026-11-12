---
description: Plan a new feature — dispatches read-only reconnaissance, relays the verdict, then either states an inline plan or scaffolds docs/features/<slug>/ spec docs.
argument-hint: "<feature description>"
disable-model-invocation: true
---

# Feature planning

The human wants to build something. Your job is to find out what it would touch, show them that
before anything exists on disk, and then either state a plan inline or lay down the feature's spec
docs.

`$ARGUMENTS` is the feature description, in the human's own words.

## This is a protocol across turns, not a script

Read the whole file, then execute **one turn at a time**. Each **STOP** below means: end your turn,
say nothing further, wait for the human.

```
Turn 1  resolve repo root → dispatch explorer → relay brief → STOP
Turn 2  human reacts → branch on the verdict:
          trivial | small     → state the inline plan → STOP (done)
          moderate | complex  → derive slug → write plan.md → STOP
Turn 3  human answers the Open Questions → move them to ## Resolved → STOP
Turn 4  human approves → write tasks.md, decisions.md, pitfalls.md → STOP (done)
```

Running two turns in one response is the failure mode this file exists to prevent. If you dispatch
the explorer and write `plan.md` in the same response, the human never got to pivot — and pivoting
for free, before anything is written, is the entire point of the plan phase. Never batch. Never
skip a STOP because the next step looks obvious.

You never write code. Not on any path, not even a one-line change. `/implement` does that.

---

## Turn 1 — reconnaissance

**Resolve the repo root.** Run `git rev-parse --show-toplevel`. If it fails, you are not in a git
repo: use the current working directory instead and say so in your relay. Do not abort.

**Dispatch the explorer.** Use the Agent tool with `subagent_type: explorer`. It starts cold — it
inherits none of this conversation — so the prompt has to carry everything:

- `$ARGUMENTS` **verbatim**, quoted. Do not paraphrase it into a task description; the explorer
  checks the ask against the repo's stated non-goals, and a summary is what lets a real conflict
  slip through.
- the absolute repo root you just resolved.
- any constraint the human stated only in conversation and not in `$ARGUMENTS`.

**Relay the brief near-verbatim.** Reproduce the explorer's report in its own headings — Verdict,
Pushback and Relevant files at minimum. A subagent's report never reaches the human on its own;
you are the only path it has. Summarising it away breaks the property this phase protects. The
brief is capped at roughly 60 lines by design, so relaying it whole costs little.

If the brief flagged a missing `docs/goal.md`, a missing `just verify`, or an overlapping feature
directory, keep those lines — they are the ones most likely to change the human's mind.

**STOP.** Do not derive a slug. Do not create a directory. Do not pick a branch.

---

## Turn 2 — branch

The verdict routes, the human overrides. "Spec it anyway" on a `small` verdict, or "just do it" on
a `moderate` one, is the human's call to make — follow it. If they push back on the feature itself,
drop it and say so; nothing was written, so there is nothing to undo.

### Inline path — `trivial` or `small`

Nothing is written to `docs/`. State in conversation:

- the files to change, with paths and line anchors, drawn from the brief's Relevant files;
- the approach, in a few lines;
- a task ID, `<SLUG>-01` — slug derived per the rules below, upper-cased. It is ad-hoc: nothing on
  disk records it, and `git log --grep` is how it gets looked up later. It exists so the commit
  carries a traceable reference and passes the commit guard.

End with the closing block (`CLAUDE.md`, "How I like answers"), **STOP**, and suggest
`/implement`.

### Spec path — `moderate` or `complex`

Derive the slug, then instantiate `plan.md` — and only `plan.md`.

**Slug rules.** Kebab-case, two to four words, derived from what the feature *is*, not from the
verbatim prompt: `auth-token-rotation`, not `add-refresh-token-rotation-to-the-auth-service`.
Upper-cased it becomes every task ID's prefix, so keep it short.

**If `docs/features/<slug>/` already exists, STOP and ask.** Never write into or over an existing
feature directory. The human chooses between a different slug and continuing the existing feature.

**Instantiating a template.** Read the template from `~/.claude/templates/`, then Write the
destination file with:

- the `<!-- TEMPLATE ... -->` block removed entirely, and
- every `<angle-bracket>` placeholder replaced.

Do not `cp`. Each template's strip-block names, on its last line, exactly which placeholders remain
in the body once the block is gone — use that as your checklist. An instantiated file should
contain no HTML comment and no angle-bracket placeholder.

**`plan.md`** — from `~/.claude/templates/plan.md`:

- frontmatter: `slug`, `title`, `status: draft`, `created:` today's date;
- **Summary** — what and why, readable by someone who was not in this conversation;
- **Tech Stack / Approach** — components touched, the pattern being followed, and the existing code
  being reused **with paths**, taken from the brief's Relevant files and Existing patterns;
- **Open Questions** — see below;
- **Resolved** — left empty;
- **Out of Scope** — checked against `docs/goal.md`'s Non-Goals if that file exists.

**Open Questions format is load-bearing.** One `###` heading per question. **Every** viable option
gets its own unchecked box — never present one. Tag your pick `(recommended)` with a one-line
rationale, and give the rejected options a rationale too; that is what makes them reviewable rather
than filler.

Ask about genuine forks the exploration surfaced: a real choice with live alternatives that would
otherwise get re-litigated later. If there were none, leave the section empty. Do not invent
questions to fill it.

**STOP.** Do not answer your own questions. Do not write `tasks.md` in this turn.

---

## Turn 3 — resolution

The human answers in the file or in conversation.

**Re-read `plan.md` from disk first** — they may have edited it directly, and their edit wins over
your memory of what you wrote.

For each answered question, move the whole block into `## Resolved` and check **only** the picked
box. Leave every rejected option listed, unchecked, with its rationale intact. Do not delete them,
do not summarise them away, do not tidy the section on a later pass. Six weeks on, "why not
Postgres?" is the question that gets asked, and this is the only place that answers it.

If questions remain open, name them and **STOP**. If all are resolved, ask for approval to write
the task list and **STOP**.

---

## Turn 4 — task list

On approval, in this one turn:

**`tasks.md`** — from `~/.claude/templates/tasks.md`. Number rows `<SLUG>-01`, `<SLUG>-02`, … inline
as you draft them; there is no external counter. Order by dependency where one exists. One row per
unit that ends green on `just verify` — a unit of verifiable work, not a unit of typing.

**Verification is not itself a row.** Every task already gates on `just verify`, so a final
"run `just verify` and fix the fallout" row is either a no-op or an admission that the rows
before it were never green. The same goes for "write the tests" as a trailing row when the
tests belong to the task that needs them. Fill:

- **Complexity** — `trivial | small | moderate | complex`
- **Suggested Model** — `haiku | sonnet | opus`, advisory only; nothing enforces it
- **Status** — `pending`
- **Notes** — short: blockers, task IDs this one depends on, ADR references. Anything long belongs
  in `plan.md`.

Delete the template's example rows along with its strip-block.

**`decisions.md`** and **`pitfalls.md`** — instantiate empty. Strip-block gone, `<feature-title>`
substituted, heading only, no entries. They fill up later via `/write-adr` and `/log-pitfall`.

**Flip `plan.md` frontmatter** `status: draft` → `planned`.

**Committing these docs is the human's**, not yours — you never stage or commit. Worth saying
once, because `tasks.md` existing is what switches the commit guard on for this repo from here
on: the subject needs a task ID **in parentheses**, e.g.
`📝 docs(plan): add <slug> task list (<SLUG>-01)`. A bare mention of the ID does not satisfy it.
For the scaffolding commit itself, which no single row owns, `[no-task]` in the subject is the
honest and documented answer.

End with the closing block (`CLAUDE.md`, "How I like answers"), **STOP**, and suggest
`/implement`.

---

## Guardrails

- **Never write outside `docs/features/<slug>/`.** `docs/goal.md` is immutable and this skill does
  not create it. If it is missing, note that in the relay and carry on.
- **Never overwrite an existing feature directory.**
- **Never skip a STOP**, never chain into `/implement`, never batch turns into one response.
- **Every strip-block deleted, every placeholder filled.** Check before you finish the turn.
- End with the next-step suggestion when the next step is obvious. It is a suggestion — you never
  invoke it yourself.
