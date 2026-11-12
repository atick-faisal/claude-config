---
description: Answer a question about the current project from its own code and docs — read-only, no plan, no edits.
argument-hint: "<question>"
disable-model-invocation: true
---

# Ask

`$ARGUMENTS` is a question about this project, in the human's own words.

This is the thing to type *instead of* planning. The planning system is for work that spans a
sitting; a question is what it exists to skip. `/ask` answers and stops — it is not an entrypoint
into `/feature-plan`.

**Resolve the repo root.** Run `git rev-parse --show-toplevel`. If it fails, you are not in a git
repo: use the current working directory and say so.

**Dispatch the answerer.** Use the Agent tool with `subagent_type: answerer`. It starts cold and
inherits none of this conversation, so the prompt has to carry:

- `$ARGUMENTS` **verbatim**, quoted. Do not rewrite the question into what you assume it means —
  the phrasing is the question, and a paraphrase answers something else.
- the absolute repo root you just resolved;
- any context the human gave in conversation that the question alone does not carry.

**Relay the answer near-verbatim.** A subagent's report never reaches the human on its own; you are
the only path it has. Keep its citations and keep what it said it could not verify — those are the
parts that let the human check the answer rather than trust it.

Add your own follow-up only if you actually know something the answerer could not, and mark it as
yours.

## Guardrails

- **You write nothing.** No file is created, edited, or deleted on this path — not a scratch file,
  not a doc, not a fix for something the answer turned up.
- **You plan nothing.** No task IDs, no numbered plans, no spec docs.
- **You suggest no next command.** `/ask` ends the exchange. If the answer implies work, the human
  decides what to type next.
- **One question per invocation.** A follow-up is a fresh `/ask`.
