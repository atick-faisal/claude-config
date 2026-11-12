---
description: Check off a resolved entry in a feature's pitfalls.md, in place, by text or by index.
argument-hint: "<item text or index>"
disable-model-invocation: true
---

# Resolve a pitfall

`$ARGUMENTS` identifies the entry: a distinctive fragment of its text, or the index from the list
this skill prints. It may name a task ID to scope the search.

The footgun is gone. Mark it — and leave the record standing, because **a checked entry is the
point**: it says this trap existed, someone hit it, and it was dealt with. Nothing here is ever
deleted or filed away.

---

## 1. Resolve the feature and find the entry

`git rev-parse --show-toplevel`; fall back to the working directory and say so.

Find the feature directory the same way `/log-pitfall` does: a task ID in `$ARGUMENTS`, else the
feature in play, else glob `docs/features/*/pitfalls.md` and ask. If no `pitfalls.md` exists
anywhere, say so and stop.

Match against the **unchecked** entries:

1. **By text** first — a case-insensitive substring of the entry. One match wins.
2. **By index** — the number from the list below, 1-based over the unchecked entries **as this
   skill prints them**. Never over raw file line numbers; the two drift the moment an entry is
   checked.

**No argument, no match, or more than one match** → print the unchecked entries numbered, and
**STOP** to ask which. Checking the wrong entry writes a small lie into the record, so guessing is
never worth the saved turn.

**Already checked** → say so, name the line, write nothing. Someone got there first.

## 2. Check the box

Change `- [ ]` to `- [x]` on that line. **Nothing else on the line changes** — not the task ID, not
the wording, not the consequence clause. Do not append a resolution note, do not move the entry to
a "resolved" section, do not sort the list. One character, one line, one diff.

Which task fixed it belongs in the commit message, where `git log --grep` can find it. The pitfalls
file is a list of traps, not a changelog.

## 3. Report

End with the closing block (`CLAUDE.md`, "How I like answers"). The Summary says in plain words
which footgun was marked resolved and how many open ones remain for the feature — not the raw
line. If the fix that resolved it is uncommitted, suggest `/commit-task <ID>`; otherwise suggest
resuming `/implement`. Suggest; never invoke.

This skill cannot verify the footgun is actually gone — the human asserts it. If nothing in this
conversation shows it fixed, say plainly that you are taking their word for it.

The checked box is a doc-only change and the human commits it — usually riding along with the fix
that resolved it, under that task's ID. On its own it still needs the task ID **in parentheses** in
the subject, or `[no-task]`.

---

## Guardrails

- **Never delete, reword, reorder or move an entry.** Ever, for any reason.
- **Never uncheck a box**, never add an entry (`/log-pitfall` owns that).
- **Never guess between two candidate entries.** Print the list and ask.
- **Never write code**, never touch `plan.md`, `tasks.md`, `decisions.md` or `docs/goal.md`, never
  stage or commit.
