---
slug: <feature-slug>
title: <feature-title>
status: draft
created: <yyyy-mm-dd>
---

<!-- TEMPLATE — delete this block when instantiating.

     Copy to docs/features/<feature-slug>/plan.md. One per feature. This is the
     feature's front door and the only file that carries frontmatter — tasks.md,
     decisions.md and pitfalls.md are subordinate to it and carry none.

     status: draft | planned | in-progress | shipped
       draft        — Open Questions still unanswered, no tasks.md yet
       planned      — questions resolved, tasks.md written, nothing built
       in-progress  — at least one task done
       shipped      — all tasks done. The directory stays in place; nothing is
                      deleted, moved or renumbered.

     OPEN QUESTIONS — the format below is load-bearing, not decoration:
       - One ### heading per question.
       - EVERY viable option gets its own unchecked box. Never present one.
       - Tag your pick `(recommended)` and give it a one-line rationale. Give
         the rejected options a rationale too — that is what makes them
         reviewable rather than filler.
       - Then STOP and wait. Do not answer your own questions.

     RESOLVING — when the human picks, move the whole question block into
     `## Resolved` and check only the picked box. LEAVE THE REJECTED OPTIONS
     LISTED AND UNCHECKED. Do not delete them, do not summarise them away, do
     not tidy the section on a later pass. The road not taken is the point:
     six weeks on, "why not Postgres" is the question that gets asked, and this
     is the only place that answers it. The resolved shape:

       ### Q1: Session storage backend?

       - [x] Redis (recommended) — already in stack, TTL support fits refresh-token expiry
       - [ ] Postgres table — avoids new infra dependency
       - [ ] In-memory — simplest, but breaks on multi-instance deploy

     Replace the example question below with the real ones. If exploration
     surfaced no genuine forks, delete the example and leave the section empty
     rather than inventing questions to fill it.

     Body placeholders after this block is deleted: the three frontmatter
     fields (<feature-slug>, <feature-title>, <yyyy-mm-dd>), the <option A>/
     <option B> / <option C> stubs, and <exclusion>.
-->

# <feature-title>

## Summary

<What this feature does and why, in a short paragraph. Written so someone who
has not read the conversation can follow it.>

## Tech Stack / Approach

<The shape of the implementation: components touched, libraries used, the
pattern being followed. Name existing code that is being reused, with paths.>

## Open Questions

### Q1: <the question, as a question>

- [ ] <option A> (recommended) — <one line: why this one>
- [ ] <option B> — <one line: what it buys, what it costs>
- [ ] <option C> — <one line>

## Resolved

## Out of Scope

<What this feature deliberately does not do. Checked against docs/goal.md's
Non-Goals — anything here that contradicts the goal file is a conversation,
not a note.>

- <exclusion>
