---
description: Append a structured ADR entry to a feature's decisions.md when a genuinely forked decision was made, and mark what it supersedes.
argument-hint: "<what was decided>"
disable-model-invocation: true
---

# Write an ADR

`$ARGUMENTS` describes the decision, in the human's words. It may name a task ID.

An ADR exists so a decision does not get re-litigated six weeks from now by someone — possibly you
— who cannot remember why the obvious option was rejected. It records a fork in the road, not a
detail of the route.

---

## 1. The bar test — before anything else

**If you cannot name a real alternative that was rejected, this is not an ADR.** Say so, and point
at where it belongs instead:

- added detail about *how* something is built → `plan.md`, via `/task-plan`
- a footgun that cost time → `pitfalls.md`, via `/log-pitfall`
- a choice with live options nobody has picked yet → `plan.md`'s `## Open Questions`, via
  `/task-plan` — an unmade decision is a question, not a record

Apply this test honestly against the actual conversation. "We used the library that was already
installed" is not a decision; "we kept Redis rather than moving sessions to Postgres, because X" is.

## 2. Resolve the feature

`git rev-parse --show-toplevel`; fall back to the working directory and say so.

Find the feature directory: from a task ID in `$ARGUMENTS` (grep `docs/features/*/tasks.md`), else
the feature this conversation has been working in, else glob `docs/features/*/` and **STOP** to ask
which one owns this decision. Never guess between two features, and never create a directory — only
`/feature-plan` scaffolds one. If the repo has no feature directory at all, say the decision has
nowhere to live and stop.

Read `decisions.md` and `plan.md` before drafting.

## 3. Gather the four parts

Take them from the conversation. **Ask rather than invent** — a fabricated rationale is worse than
a missing one, because it reads as authoritative.

- **Context** — the constraint or conflict that forced a decision. Not the backstory, not the
  feature description. What made the easy path unavailable.
- **Decision** — what was chosen, stated so a reader can check the code against it.
- **Alternatives considered** — each real option, with the reason it lost. This section is the
  whole point; one bullet is a smell.
- **Consequences** — what the project now lives with, **including at least one cost**. An ADR whose
  consequences are all upside was not a fork. Press for the cost; if the human says there is none,
  ask whether the bar test in §1 really passed.

## 4. Draft, stop, then append

Allocate the ID: read the existing entries and take the next `ADR-NN` after the highest present,
zero-padded, scoped to this feature directory. Two features both having an `ADR-01` is expected —
the path disambiguates.

Draft the entry in conversation, in exactly the format `~/.claude/templates/decisions.md` sets out:

```
## ADR-02 — <short title>

**Date:** <yyyy-mm-dd>
**Status:** accepted
**Tasks:** <task IDs this governs>

**Context**
...

**Decision**
...

**Alternatives considered**
- <option> — <why it lost>

**Consequences**
- <what we now live with, including the cost>
```

**STOP.** ADRs are permanent — never deleted, only superseded — so the human reads it before it
lands, not after.

On approval, append it at the **bottom** of `decisions.md`, newest last. Never reorder, never edit
an existing entry except as §5 allows.

## 5. Superseding

When this decision reverses an earlier one, two things change and nothing else:

**In `decisions.md`** — set the old entry's `**Status:**` line to `superseded by ADR-NN`. That is
the only permitted edit to a past entry: its Context, Decision, Alternatives and Consequences stay
exactly as written, because what people believed at the time is the record. The new entry's Context
names what it supersedes.

**In `plan.md`, when the reversed decision sits in `## Resolved`** — append one line directly
beneath that question's block:

```
> Superseded by ADR-02 (2026-09-07)
```

Leave the block itself untouched: the checked box stays checked, every rejected option stays listed
with its rationale. This line is load-bearing, not bookkeeping — `/implement` treats `## Resolved`
as settled law and does not open `decisions.md` unbidden, so without the pointer it will keep
building the decision this ADR just reversed.

Touch nothing else in `plan.md`.

## 6. Report

End with the closing block (`CLAUDE.md`, "How I like answers"). The Summary states the decision
and anything it superseded in plain words — not ADR IDs or the path. If the decision changes how a
pending task should be built, say which work it affects and suggest `/task-plan <ID>`. Suggest;
never invoke.

It is a doc-only change and the human commits it. The guard wants the task ID **in parentheses**
in the subject — `📝 docs(adr): record ADR-NN (<TASK-ID>)`, not a bare mention of it in the
prose — or `[no-task]` when no row owns the write.

---

## Guardrails

- **No rejected alternative, no ADR.**
- **Never edit or delete a past entry** beyond flipping its `**Status:**` to superseded.
- **Never invent a rationale, an alternative, or a consequence.** Ask.
- **Never touch `plan.md`** beyond the one supersede line — not `## Resolved`'s content, not Open
  Questions, not the frontmatter (`/task-status` owns that).
- **Never write code**, never change a Status cell, never scaffold a feature directory, never stage
  or commit.
