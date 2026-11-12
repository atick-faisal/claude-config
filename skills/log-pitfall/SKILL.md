---
description: Append an unchecked footgun to a feature's pitfalls.md, tagged with the task that surfaced it.
argument-hint: "<what bit you>"
disable-model-invocation: true
---

# Log a pitfall

`$ARGUMENTS` is the footgun, in the human's words. It may name a task ID.

A pitfall that stays in the console is one the next task hits too. This skill takes about fifteen
seconds and is the only reason the second person to touch that code does not lose the same
afternoon.

---

## 1. The bar test

Log the thing that **cost real time and would cost it again**:

- behaviour nobody documented, that you only learned by hitting it
- a config or flag that silently does nothing
- an ordering that matters and does not look like it does
- an error message that points at the wrong cause

Not a pitfall: a TODO, a refactor you would like, "remember to run the tests", a bug with a ticket,
or anything a reader would guess. If it fails the bar, say so and name where it belongs instead —
a task row via `/task-plan`, or a decision via `/write-adr`. Do not log it anyway to be helpful; a
pitfalls file full of reminders is one nobody reads.

## 2. Resolve the feature

`git rev-parse --show-toplevel`; fall back to the working directory and say so.

Find the feature directory: from a task ID in `$ARGUMENTS` (grep `docs/features/*/tasks.md`), else
the feature this conversation is working in, else glob `docs/features/*/` and **STOP** to ask which
one owns it. Never create a directory or a `pitfalls.md` — only `/feature-plan` scaffolds a
feature. If the repo has no feature directory at all, say the footgun has nowhere to live, suggest
`/feature-plan`, and leave the text in your reply so it is not lost.

## 3. Write the line

Exactly one line, exactly this shape:

```
- [ ] [<TASK-ID>] <what bites> — <what happens if it stays unresolved>
```

**Both halves are required.** The consequence is what makes the entry worth reading later; without
it, an entry is just a complaint. If the conversation does not make the consequence clear, ask for
it in one clause rather than inventing one.

The task ID is the task that surfaced the footgun — not necessarily the task that will fix it. If
no task is in play, use the nearest one from this conversation; if there genuinely is none, ask.
Keep the brackets: `/resolve-pitfall` and the human both read by them.

Keep it to a line. Anything needing a paragraph is a `plan.md` note via `/task-plan`, or an ADR.

## 4. Check for a duplicate, then append

Read the existing entries first. If the same footgun is already listed — **checked or unchecked** —
do not append a second one. Quote the existing line and say where it is. A checked duplicate is
worth flagging out loud: the footgun was marked resolved and just bit again, which usually means
the fix did not hold.

Otherwise append at the end of the list. Never reorder, never reword, never delete an existing
entry, and never touch a checked one.

## 5. Report

End with the closing block (`CLAUDE.md`, "How I like answers"). The Summary says in plain words
what bites and what happens if it stays unresolved — not the raw line or its path. Then suggest
resuming what was interrupted — usually `/implement <ID>`; a pitfall is logged mid-loop and the
loop is still open. Suggest; never invoke.

It is a doc-only change and the human commits it. The guard wants the task ID **in parentheses**
in the subject — `📝 docs(plan): log <what bites> pitfall (<TASK-ID>)`, not a bare mention of it
in the prose — or `[no-task]` when no row owns the write.

---

## Guardrails

- **One line, both halves, task ID in brackets.**
- **Never delete, reorder or reword an existing entry**, checked or unchecked.
- **Never check a box.** `/resolve-pitfall` owns that.
- **Never create a feature directory or a `pitfalls.md`.**
- **Never write code**, never touch `plan.md`, `tasks.md`, `decisions.md` or `docs/goal.md`, never
  stage or commit.
