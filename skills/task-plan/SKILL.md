---
description: Think one named task through against the feature's existing plan, and patch plan.md or tasks.md only if that surfaces a real gap. Writing nothing is the expected outcome.
argument-hint: "<task-id>"
disable-model-invocation: true
---

# Task planning

`$ARGUMENTS` is one task ID, e.g. `AUTH-ROTATION-04`. The human reached for this because that row
looks bigger or vaguer than the rest.

Your job is to think the task through **out loud, in conversation**, against everything already
decided — and then to answer one question honestly: did that thinking surface something the
feature's plan does not already cover?

**Usually it does not, and then you write nothing.** That is not a failed run. The docs are already
sufficient, the human now has the walkthrough, and `/implement` can start. A skill that always
finds something to add turns `plan.md` into a transcript, and a plan nobody re-reads is worse than
no plan. Say "the plan already covers this" plainly and stop.

You never write code. `/implement` does that.

---

## 1. Resolve and load

`git rev-parse --show-toplevel` for the root; fall back to the working directory and say so.

Grep `docs/features/*/tasks.md` for the ID. Two hits → show both, **STOP**, ask. No hit → the
inline path: `/feature-plan`'s trivial/small verdict wrote nothing under `docs/`. If this
conversation holds that plan, think the task through against it and expect to write nothing at all
— there is no file to patch. If it does not, run `git log --grep=<ID>`, then ask the human to
restate it. Never reconstruct a task from the shape of its ID, and never scaffold a feature
directory here.

Then read, in parallel:

| File | For |
| --- | --- |
| `docs/goal.md` | Success Criteria, Non-Goals, Constraints |
| `docs/features/<slug>/plan.md` | Summary, Tech Stack / Approach, **Resolved**, Out of Scope |
| `docs/features/<slug>/tasks.md` | this row, and the rows around it — dependencies run both ways |
| `docs/features/<slug>/decisions.md` | any ADR the row or the approach touches |
| `docs/features/<slug>/pitfalls.md` | unchecked entries near these files |

**And read the actual code the task will touch.** This is the difference between this skill and
`/feature-plan`: the feature plan was written from a reconnaissance brief, this one is written
against the code as it stands today. Open the files, follow the call sites.

## 2. Think it through, in conversation

Cover, in a few tight paragraphs — not a document:

- the files and functions this touches, with paths, and the existing code being reused;
- the approach, and where it hits the seam between what exists and what does not;
- the edge cases and failure modes the row's one-line Description hides;
- the ordering, if part of this has to land before another part works;
- what `just verify` will actually exercise, and what it will not.

`## Resolved` in `plan.md` is settled law here too. Build the checked option. If the code makes it
look wrong, that is finding (c) below, not a quiet substitution.

## 3. Classify what surfaced — then propose before writing

**(a) Nothing.** The plan covers it. Say so, name what you checked, suggest `/implement <ID>`, and
write nothing. Expected outcome; do not apologise for it.

**(b) Added detail, ordering or a constraint.** A minimal patch, proposed in conversation first,
written only after the human agrees:

- `plan.md` — a sentence or two appended to **Tech Stack / Approach**, or a line in **Out of
  Scope**. Never restructure the file, never touch `## Resolved`, never add prose that repeats what
  is already there.
- `tasks.md` — sharpen this row's Description, adjust its Complexity or Suggested Model, add a
  short Note, or **split the row**. A split keeps the original ID and appends new rows continuing
  from the highest `NN` in the file; the original's Notes point at them. **Never renumber, never
  reuse an ID, never delete a row** — gaps are expected and IDs are permanent.

  **A Note is one clause** — a dependency, an ADR reference, a blocker. Implementation detail
  (which columns, which helper, which ordering) goes to `plan.md`'s **Tech Stack / Approach**,
  never into a table cell. A paragraph in a Notes column makes the whole table unreadable, and
  every later `/implement` pays for it.

**(c) A genuine fork with live alternatives.** Not a detail — a real choice that will otherwise get
re-litigated during implementation. Add it to `plan.md`'s `## Open Questions` in the load-bearing
format: one `###` heading, **every** viable option as its own unchecked box, your pick tagged
`(recommended)`, a one-line rationale on each option including the rejected ones. Then **STOP** and
wait. Do not answer your own question, and do not start the task with the fork unresolved.

**(d) A pivot away from something already in `## Resolved`.** Never rewrite it. Say what the code
showed you, why the resolved option no longer holds, and offer `/write-adr` — that is the file
built for reversals, and it is the only thing that will stop `/implement` from building the old
decision. Offer it; never invoke it.

## 4. Report

End with the closing block (`CLAUDE.md`, "How I like answers"). The Summary says in plain words
what the thinking surfaced and what you changed, if anything — not the (a)–(d) label. Suggest
`/implement <ID>` when the task is ready to build. Suggest; never invoke.

If you wrote anything, note that it is a doc-only change for the human to commit, and that the
guard wants the task ID **in parentheses** — `📝 docs(plan): sharpen <ID> notes (<ID>)`, not a
bare mention of it in the prose.

---

## Guardrails

- **Writing nothing is a valid, common, good outcome.**
- **Propose before patching.** No doc edit lands in the same turn it was thought up in.
- **Never write code**, never change a Status cell (`/task-status` owns it), never touch
  `decisions.md` or `pitfalls.md` (`/write-adr` and `/log-pitfall` own them), never touch
  `docs/goal.md`.
- **Never edit `## Resolved`**, never delete a rejected option, never renumber or reuse a task ID.
- **Never scaffold a feature directory**, never stage or commit.
