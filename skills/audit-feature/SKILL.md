---
description: Check whether a feature is ready to merge — dispatches a read-only auditor against its plan, commits and just verify, relays the verdict, and appends the missing task rows the human approves.
argument-hint: "[feature-slug]"
disable-model-invocation: true
---

# Feature audit

The feature has been built, or mostly built, and the human is about to merge it. They want two
questions answered: **was it built correctly, and is anything left?** This skill gets those
answered by a reviewer that did not write the code, and turns the gaps into task rows.

`$ARGUMENTS` is an optional feature slug, e.g. `auth-token-rotation`.

You never write code, never fix a finding, and never change an existing row. `/implement` builds,
`/code-review` hunts for bugs, `/commit-task` commits. This skill audits, and adds rows.

## A protocol across two turns

```
Turn 1  resolve repo root → resolve the feature → dispatch auditor → relay → STOP
Turn 2  human approves rows (all, some, or none) → append them → roll up plan.md → STOP
```

Turn 2 only happens when the audit proposed rows. If it proposed none, turn 1 is the whole run.

---

## Turn 1 — audit

**Resolve the repo root.** Run `git rev-parse --show-toplevel`. If it fails, you are not in a git
repo: use the current working directory and say so. Do not abort.

**Resolve the feature.**

- **Slug given.** `docs/features/<slug>/` must exist. If it does not, say so, list the slugs that
  do, and **STOP**.
- **No slug.** Read the frontmatter `status:` of every `docs/features/*/plan.md` and list the ones
  that are `in-progress` or `shipped`, with their titles. Then **STOP and ask which.** Do not pick —
  which feature is about to merge is not something the file tree knows.
- **No `docs/features/` at all.** Say the repo has no planned features, so there is nothing to
  audit against, and stop. That is a `/feature-plan` or `/project-init` situation.

**Dispatch the auditor.** Use the Agent tool with `subagent_type: auditor`. It starts cold and
inherits none of this conversation — that is the point of it — so the prompt has to carry:

- the feature slug and its directory;
- the absolute repo root you just resolved;
- anything the human said in conversation that changes what "done" means, quoted.

Do not pass along what this session believes it built. The auditor reads what was committed.

**Relay the report near-verbatim.** Reproduce it in its own headings: Verdict, Built correctly?,
Anything left?, just verify, Proposed rows, Not checked. A subagent's report never reaches the
human on its own; you are the only path it has. Keep what it said it could not check — that is
what lets the human trust the verdict rather than take it on faith.

Add your own note only if you know something the auditor could not, and mark it as yours.

**End with the closing block** (`CLAUDE.md`, "How I like answers"). The Summary gives the verdict
and the one or two findings that drive it, in plain words. When there are proposed rows, ask which to
add. Up to four rows: one multi-select picker question, one option per row. More than four: a
numbered "Needs your input" list, one per row, so the human can answer "1 and 3" in one message.
Then **STOP**.

The suggested next step depends on the verdict:

- **ready to merge** → `/code-review`, for the dedicated bug pass the audit does not do;
- **not yet, only uncommitted work left** → `/commit-task`;
- **not yet, with proposed rows** → none yet; the human's answer comes first.

Suggest; never invoke.

---

## Turn 2 — append approved rows

Append only the rows the human approved, with any wording they changed. A "no" to every row is a
valid answer: write nothing and stop.

**Append to the end of `tasks.md`**, following `/task-plan`'s rules for new IDs and Notes. Status
is `pending`; Notes is `from audit` or a dependency. Never edit, reorder or reformat an existing row.

**Roll up `plan.md`'s frontmatter `status:`** from the whole table, using `/task-status` §4. A
`shipped` feature that just gained a pending row reads `in-progress` again.

**End with the closing block.** The Summary says how many rows were added and what they cover, in
plain words. Note that it is a doc-only change for the human to commit, with the first new task ID
in parentheses — `📝 docs(plan): add audit follow-up tasks (<first new ID>)`. Suggest
`/implement <first new ID>`. Suggest; never invoke.

---

## Guardrails

- **Never pick the feature for the human.** No slug means list and ask.
- **The auditor audits; you relay.** Do not re-audit, soften or overrule its findings.
- **Rows land only after a yes.** Never append a row the human did not approve.
- **Never edit an existing row**, never change a Status cell (`/task-status` owns it), never
  renumber or reuse an ID.
- **Never touch `plan.md`'s body**, `decisions.md`, `pitfalls.md`, `docs/goal.md`, or any code.
- **Never invoke `/implement`, `/code-review` or `/commit-task`.** Suggest the next one.
- **Never stage or commit.**
