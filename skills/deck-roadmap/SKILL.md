---
description: Plan an HTML deck's story — interview for audience, time budget, arc and references, write docs/roadmap.md, stop for acceptance, then write the deck's docs/features/<deck>/ with an -md and a -slides row per chapter, a row per time budget and a final-check row.
argument-hint: "[anything already decided: the story, chapters, sources, shorter versions]"
disable-model-invocation: true
---

# Plan a deck's story

`$ARGUMENTS` is whatever the human said about the story, in their own words: an arc, chapters,
sources to use, things to leave out. Any of it may be absent.

This skill runs after `/deck-init`. It turns the deck facts into a storyline the human accepts,
`docs/roadmap.md`, and then into a task list that `/implement` can work through one row at a
time. It writes no chapter md and no slides. The rules for those rows live in
`~/.claude/guidelines/presentation.md`; read it once before you start, so the rows you write
agree with it.

## This is a protocol across turns, not a script

Read the whole file, then execute **one turn at a time**. Each **STOP** means: end your turn, say
nothing further, wait for the human.

```
Turn 1  resolve root → survey → read the deck facts → interview → STOP
Turn 2  answers → write docs/roadmap.md → check it parses → ask for acceptance → STOP
        (changes requested → edit the roadmap → ask again → STOP, as often as needed)
Turn 3  accepted → write docs/features/<deck>/ → check → report → STOP (suggest /implement)
```

The roadmap gate is real. Nothing else in the deck starts until the human accepts the
storyline, because every chapter md, slide and budget is derived from it.

---

## Turn 1 — survey and interview

### Resolve the deck root

Run `git rev-parse --show-toplevel`.

- **It fails: not a git repo.** Say so, suggest `/deck-init`, and **STOP**.
- **The root is `~/.claude`: refuse.** The scaffold lives there, and the repo is public.

### Survey

| Check | How | What it decides |
| --- | --- | --- |
| Initialised | `build.js` and `CLAUDE.md` both exist | no → suggest `/deck-init`, **STOP** |
| Already planned | any `docs/features/*/tasks.md` | yes → say so, write nothing, **STOP** |
| Roadmap waiting | `docs/roadmap.md` exists, no `docs/features/` | yes → read it, go to the acceptance step of Turn 2 |
| Deck facts | `docs/goal.md`, `CLAUDE.md`, `docs/brand.md` | read all three; a missing one is a reported line |

**Already planned** means the roadmap was accepted before. A later change to it, such as a new
chapter, is a conversation about the roadmap and about rows in that `tasks.md`, not a re-run of
this skill.

**A roadmap waiting** was written by an earlier run that never got its acceptance, or by the
human. It may still be the starter, with `<angle-bracket>` placeholders. If so, treat it as
absent and interview.

### What you already know

`/deck-init` asked for the title, audience, minutes, shorter versions and purpose, and wrote
them into `docs/goal.md` and `CLAUDE.md`. **Do not ask for them again.** Repeat them in one
short block, so the human can correct one before the story is built on it.

If the interview changes one of them, say so plainly. `docs/goal.md` is immutable: never edit
it from here. The human decides whether the goal or the new fact gives way.

### The interview

The goal is an engaging story for this audience in this time, not a table of contents. Ask
about what only the human knows. Take each answer from `$ARGUMENTS` or the conversation when it
is already there.

- **What they know.** What the audience already knows, and what they will get wrong or
  push back on.
- **The one takeaway.** The sentence they should repeat to a colleague the next day.
- **The hook.** What makes the first two minutes worth their attention: a question, a story,
  a surprising number, a demo.
- **The turn.** Where the story changes direction: the problem that the payoff answers.
- **The payoff.** How it lands: the answer, the call to action, the next step for them.
- **Must-haves and must-nots.** Material the deck has to cover, and anything to leave out.
- **References.** Sources the human wants used: papers, reports, data, their own earlier
  talks. Files in the repo count.

Then **propose**. Offer two or three candidate arcs with the picker, each one line, your
recommendation first. If the human has already given an arc, offer a chapter outline instead.
An interview that only collects answers leaves the storytelling to the human, and that is the
part they asked for help with.

Ask everything in one go: picker questions with `AskUserQuestion`, free-text ones in a short
numbered **Needs your input** list. Then **STOP**.

---

## Turn 2 — write the roadmap

### Write `docs/roadmap.md`

Follow the template rules in `skills/feature-plan/SKILL.md`:

- read the starter from `~/.claude/templates/deck-starters/roadmap.md`;
- Write the destination with the `<!-- TEMPLATE … -->` block removed;
- replace every `<angle-bracket>` placeholder.

Do not `cp` it. The strip-block's last line lists the placeholders left in the body; use it as
your checklist.

**`build.js` reads two things from this file, so keep their shape exactly.**

- The first `# ` heading is the deck's `<title>`.
- The first ordered list under `## Chapters` sets the chapter order. Each item holds one
  `[Chapter title](<topic>.md)` link. `<topic>` is lowercase kebab-case and unique. It names
  both `docs/<topic>.md` and `slides/<topic>.html`, and every task row, so keep it short and
  stable.

**The chapters.**

- Each one has a role in the arc: the hook, a step of the build-up, the turn, the payoff.
  Say which in its item.
- **Their minutes add up to the base budget.** Leave a minute or two for the opening and Q&A
  if the human wants them, and say so.
- Usually one chapter per 5 to 10 minutes. A chapter is also the unit of one `-md` and one
  `-slides` task, so a chapter far longer than that is a heavy task.

**References.**

- **Never invent a source.** List only what the human gave or what you have actually read.
- A claim that needs a source nobody has yet is listed as "source to find". The chapter's
  `-md` row finds it, or cuts the claim.

### Check that it parses

Run `node build.js --check` from the deck root. With no chapter written yet, it should pass,
with a "has no docs/<topic>.md and slides/<topic>.html yet" warning per chapter. Any error about the roadmap is yours to fix before
the human reads it.

### Ask for acceptance

Show the storyline and the chapter list, with minutes and the total. Then ask with the picker:

- "Accept the roadmap" (Recommended, if you would recommend it);
- "Change it": the human says what, in their next message.

**STOP.**

**On a change**, edit `docs/roadmap.md`, run the check again, and ask again. Repeat as often as
needed. **On acceptance**, go on to Turn 3.

---

## Turn 3 — the task list

### Name the deck's feature

The slug is short kebab-case, two or three words, from the deck title, e.g. `geometry-meaning`.
Upper-cased, it prefixes every task ID, so keep it short. Use the slug rules in
`skills/feature-plan/SKILL.md`. If `docs/features/<slug>/` exists, **STOP and ask.**

### Write `docs/features/<slug>/`

Use the same template rules as the roadmap: strip-block gone, every placeholder filled.

**`plan.md`**, from `~/.claude/templates/plan.md`.

- Frontmatter: `slug`, `title` (the deck title), `status: planned`, `created:` today.
- **Summary:** the deck, its audience and minutes, its takeaway, and the arc in two or three
  sentences. Point at `docs/roadmap.md`, the source of the storyline.
- **Tech Stack / Approach:** the scaffold and `~/.claude/guidelines/presentation.md`, which
  holds the rules for every row. Name the branding source as `docs/brand.md`. Do not copy the
  guideline's rules in.
- **Open Questions:** empty.
- **Resolved:** each fork the interview settled with the picker, such as the arc. Use the
  `/feature-plan` format: one `###` per question, every option kept, only the picked box
  checked. This stops the story being re-argued at the fifth chapter. With no forks, leave it
  empty.
- **Out of Scope:** what the human said to leave out, and goal.md's Non-Goals.

**`tasks.md`**, from `~/.claude/templates/tasks.md`. The prefix is the slug upper-cased. Rows
are numbered inline, in this order:

1. **Per chapter, in roadmap order, two rows.**
   - **`-md`:** "Chapter md: `docs/<topic>.md`, <Chapter title> (<role>, ~<M> min)".
     `moderate`, `opus`. Notes: "human approves and commits before -NN", naming its
     `-slides` row.
   - **`-slides`:** "Chapter slides: `slides/<topic>.html` from `docs/<topic>.md`, plus any
     interaction". `moderate`, `opus`; `complex` when the roadmap promises a demo or a heavy
     build. Notes: "blocked by -NN approved and committed", naming its `-md` row.
2. **Per shorter version, longest first:** "Time budget: `budgets/<N>min/`, cut to <N> min".
   `moderate`, `opus`. Notes: "blocked by every -slides row; start once
   `just check --complete` is green".
3. **The final check, last:** "Final check: `just check --complete`, every export, story flow,
   consistency, facts and references". `moderate`, `opus`. Notes: "blocked by every row above;
   the deck is done when this is".

Every Status is `pending`. With no shorter versions, there are no budget rows. A row's Notes
stay short: the rules for running it are in the guideline, which the deck's `CLAUDE.md` points
at.

**`decisions.md`** and **`pitfalls.md`**, from `~/.claude/templates/`: heading only, no entries.
`/write-adr` and `/log-pitfall` append to them, and neither creates the file.

### Check and report

1. **Check the files.** None holds a `<!--` or an `<angle-bracket>` placeholder. Run
   `just check`; it should still pass.
2. **End with the closing block** (`CLAUDE.md`, "How I like answers"). In plain words, the
   Summary says:
   - the accepted storyline in one sentence;
   - how many chapters, and their total minutes against the budget;
   - how many rows were written, and that each `-slides` row waits for its `-md` row's approval;
   - any "source to find" left in the roadmap.

**Committing is the human's.** Say once that `tasks.md` existing switches the commit guard on:
from here, every subject names a task ID in parentheses. This first commit, of the roadmap and
the feature docs, belongs to no row, so `[no-task]` in its subject is the honest answer.

**STOP**, and suggest `/implement <PREFIX>-01`. Suggest it; never invoke it.

---

## Guardrails

- **Nothing past the roadmap until the human accepts it.** No `docs/features/` before a yes.
- **Never invent a reference**, a deck fact or an audience trait. Ask, or mark "source to find".
- **Never edit `docs/goal.md`**, `CLAUDE.md`, `docs/brand.md` or the scaffold. If the story
  contradicts one, say so.
- **Never write `docs/<topic>.md`, `slides/` or `budgets/`.** The task rows own those.
- **Never overwrite an existing `docs/features/` directory or an accepted roadmap.**
- **Every strip-block deleted, every placeholder filled.** Check before you finish the turn.
- **Never stage or commit**, and never chain into `/implement`.
