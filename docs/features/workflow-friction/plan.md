---
slug: workflow-friction
title: Workflow Friction Fixes
status: shipped
created: 2026-10-09
---

# Workflow Friction Fixes

## Summary

After three onboarded projects (thermal image registration, thermal-to-optical translation, AI
asset management), the spec workflow works, but four things keep costing the human time:

1. **Replies bury what matters.** Questions that need the human's input sit mid-response, and the
   summary of what was done is written in task, experiment and finding IDs that have to be looked
   up in the repo to mean anything.
2. **`/implement` always stops before building**, even for a trivial task, so the human spends a
   turn typing "go ahead". `/log-experiment` does the same before writing a record.
3. **`/log-experiment` keeps asking for run metadata**: git SHA, the command, and which machine
   with how much RAM and which GPU. The run already knew all of it, but never printed it.
4. **There is no merge-readiness check.** At the end of a feature the human audits by hand: was it
   built correctly, and is anything left before merging?

This feature fixes all four, plus a little housekeeping the reconnaissance turned up.

## Tech Stack / Approach

Everything here is Markdown instructions, one template, one guideline, and one new skill, all inside
`~/.claude`. No code ships, so `just verify` (hooks, JSON and tracked-file checks) is a smoke test
here, not proof of the wording. Fix provenance (P3) before the `/log-experiment` part of P2, because
most of that skill's questions come from missing provenance.

**P1: closing block.**
- `CLAUDE.md` "How I like answers": replace "Put important findings, risks, and decisions upfront"
  (`CLAUDE.md:92-93`) with a short closing-block rule. Any response that finishes a piece of work
  (exploration, implementation, logging, commit) or needs the human's input ends with:
  - **Summary**: two to four plain sentences saying what was done or found. No task, experiment
    or finding IDs, and no paths the human would have to open to understand it.
  - **Needs your input**: numbered questions, only ones that truly need an answer. Left out
    entirely when there are none.
- `CLAUDE.md` "Next step" (`CLAUDE.md:47-52`): the suggested command goes on the very last line,
  below the questions. It is the one place an ID is allowed.
- If a hook forces another response after the closing block (`hooks/check-clean.sh:59-64`), any
  unanswered questions are repeated at the bottom of that new response.
- The rule must live under "How I like answers" (personal style), not in the planning section,
  because `docs/goal.md` keeps ad-hoc work outside the planning system. Keep it to a few lines,
  since `CLAUDE.md` loads in every session.
- A general rule loses to a specific skill instruction, so every skill's Report step is rewritten
  to end with the closing block, and any "name the task/run ID" instruction is removed:
  - `skills/implement/SKILL.md:150`
  - `skills/log-experiment/SKILL.md:143-147`
  - `task-plan` §4, `task-status` §5, `write-adr` §6, `log-pitfall` §5, `resolve-pitfall` §3
  - `project-init` Report, `commit-task:87`, and the end of `feature-plan`'s relay

**P2: stop only when it matters.**
- `skills/implement/SKILL.md` goes from a two-turn protocol to one turn: resolve, load context,
  check the gate, state the plan in a few lines, implement, verify, mark done, closing block.
- The "never skip a STOP" rationale (`:26-28`, `:105`, `:161`) is rewritten around one rule:
  stop only when the human's input is genuinely needed, or before a destructive action. The stops
  that remain:
  - no ID given, so ask which task (`:48`);
  - an ID that isn't on disk, in a fresh session (`:60-62`);
  - no `verify` gate (`:81-91`);
  - `plan.md` doesn't say how to build the task, so offer `/task-plan` and stop;
  - the existing escalation triggers: Stuck, Judgment, Scope, Pre-existing red (`:127-139`);
  - a destructive action.
- "Destructive" is defined in the skill, in one short list: deleting or overwriting anything this
  task did not create, rewriting git history or force operations, schema or data migrations
  against real data, deleting logs, results or experiment records, and anything outside the repo.
- Important choices made without stopping go in the closing block's Summary.
- This also removes the double approval on small work: `/feature-plan`'s inline path already
  stops once (`skills/feature-plan/SKILL.md:72-80`).
- `skills/log-experiment/SKILL.md:117-118`: drop the stop before writing. The skill writes the
  record and updates both ledgers, and the human reviews the uncommitted diff. "Written once and
  never edited" (`:117`, `:158`) is reworded to mean "never edited after it is committed". Before
  commit, git is the undo, and an uncommitted rejected record burns no ID.

**P3: provenance inside the log.**
- `guidelines/research.md` Conventions gets a new rule. Every experiment entrypoint prints a
  provenance block to the console, before anything else, between fixed markers
  (`=== PROVENANCE ===` … `=== END PROVENANCE ===`).
- It is printed to stdout because the pasted console log is the only thing that crosses back from
  the server (`research.md:11-12`).
- The block holds `key: value` lines:
  - start time with timezone, and hostname;
  - OS, CPU, total RAM, and each GPU's name, memory and driver;
  - CUDA, Python and torch versions;
  - `git_sha` with its `-dirty` / `-untracked` suffix (`research.md:40-44`);
  - working directory and the full command line.
- A matching footer at the end prints the finish time and wall clock. This closes the
  "Wall clock: not recorded" gap in t2o record 005.
- Every probe is best-effort. It prints `unavailable` and never raises, the same rule as
  "Telemetry must not take down a run" (`research.md:48`).
- It uses the standard library, torch and `nvidia-smi` only, so no new dependency. It lives in, or
  next to, the one results-formatting module.
- The guideline names the two partial implementations as prior art: `cmreg/tracking.py:60`
  (`git_sha()`) and t2o `scripts/campaign_report.py:186-193` (host, git HEAD/status, nvidia-smi).
- `templates/experiment.md:77-78`: `Machine` becomes the hostname from the block, and a new
  `## Environment` section holds the block pasted verbatim, the same way Results holds the console
  block.
- `skills/log-experiment/SKILL.md` §2 and §5 read the block by its anchor, like the result block,
  and take every header field from it.
- When an older log has no block, the skill does not ask. It writes `not recorded`, adds a
  provenance caveat, and mentions the gap once under "Needs your input" so the human can supply it
  before committing.

**P4: `/audit-feature`.**
- New `skills/audit-feature/SKILL.md`, with `disable-model-invocation: true` and argument
  `[feature-slug]`. With no slug, it lists features whose status is `in-progress` or `shipped` and
  asks which. The skill folder is tracked automatically (`.gitignore:35-36`).
- It loads `docs/goal.md`, plus the feature's `plan.md`, `tasks.md`, `decisions.md` and
  `pitfalls.md`.
- It collects the feature's commits with `git log --grep` on the feature's task-ID prefix (e.g.
  `WORKFLOW-FRICTION-`), which works whether the
  feature was built on a branch or on `main`, along with their combined diff and the uncommitted
  work.
- It runs `just verify`.
- It answers the human's two questions:
  - **Built correctly?** Each done task's diff matches its row and the checked options in
    `## Resolved`, ADRs are honoured, nothing in Out of Scope crept in, and the new behaviour has
    tests.
  - **Anything left?** Pending or blocked rows, unchecked pitfalls, TODO/FIXME lines added in the
    diff, plan items that no task covers, docs or `CLAUDE.md` lists not updated, uncommitted work.
- It ends with a verdict (ready to merge, or not yet), findings in plain language, and proposed
  new task rows under "Needs your input". Rows are appended only after the human says yes.
- Appending follows `skills/task-plan/SKILL.md:75-77`: continue from the highest `NN`, never
  renumber or reuse, and set Status to `pending`. The skill then rolls `plan.md`'s status back
  using the mapping in `task-status` §4, so a `shipped` feature with a new pending row reads
  `in-progress`.
- `skills/task-status/SKILL.md:107` ("/feature-plan and /task-plan own rows") is updated to name
  `/audit-feature` as the third row owner.
- It never invokes `/implement`, `/code-review` or `/commit-task`. It suggests the next one.
- Split per Q6: a new read-only `agents/auditor.md`, modelled on `agents/explorer.md`, does the
  loading, diffing, `just verify` and both checks. The skill picks the feature, dispatches the
  agent, relays its findings, and appends any approved rows itself, because the agent has no
  Write tool. `agents/**` is already allowlisted (`.gitignore:27-28`).

**Housekeeping.**
- `CLAUDE.md:29-32`: add `/ask` (missing today) and `/audit-feature` to the command list.
- Fix two stale comments: `hooks/check-clean.sh:30` ("~/.claude itself is not one") and
  `hooks/guard-task-commit.py:4` ("PLAN.md").
- Hooks load at session start, so the comment fix only shows up in a new session. That is
  harmless, because no behaviour changes.

## Open Questions

## Resolved

### Q1: How is the work split?

- [x] One feature, one task per problem (recommended). Every change lives in this repo and is mostly wording, so four features would mostly be four sets of paperwork.
- [ ] Four separate features, one per problem. Each could ship on its own, but that means four `plan` / `tasks` / `decisions` / `pitfalls` sets for small Markdown edits.
- [ ] One feature, a single task for everything. Fewest rows, but one large diff that is hard to review and no per-problem commits.

### Q2: What does provenance capture do when a tool (`git`, `nvidia-smi`) is missing on the run machine?

- [x] Best-effort. Each probe is wrapped, prints `unavailable`, and never raises (recommended). It matches "Telemetry must not take down a run". The Windows server has both tools today, so this only guards the edge case.
- [ ] Hard requirement: fail the run at startup. Every record would be complete, but a missing PATH entry would kill a GPU run over metadata.

### Q3: When Claude makes an important choice that needs no approval, what happens?

- [x] Keep going and report it in the closing Summary. Stop only before a destructive action (recommended). This is the human's own rule, and it removes the "go ahead" turn.
- [ ] Stop and wait on every important choice. Closest to today's behaviour, and exactly the friction this feature removes.

### Q4: What shape does the closing block take?

- [ ] Two parts at the very end: a plain-language Summary with no IDs and no paths to open, then numbered "Needs your input" questions, left out when empty. The next-step command goes on the last line, as the only place an ID is allowed (recommended). The questions are the last thing on screen, and the human can answer them all in one message, which is how they already answer.
- [x] The `AskUserQuestion` picker for questions. It always sits at the bottom and is quick for multiple choice, but it is awkward for open questions, capped at four, and cannot be answered together in one free-form message. Hybrid: questions with clear options go in the picker, recommendation first; open-ended or overflow questions stay a numbered "Needs your input" list.

Revisited 2026-10-26: the human chose the picker for multiple-choice questions, with a text list for open ones.
- [ ] The next-step command above the questions. Keeps the current "Next step" rule untouched, but then the questions are no longer the last thing on screen.

### Q5: How does `/audit-feature` add the tasks it finds missing?

- [x] It proposes rows under "Needs your input" and appends them after the human says yes (recommended). The human asked for it to *suggest* tasks, and this follows `/task-plan`'s propose-then-write pattern.
- [ ] It appends rows immediately, and the human reviews the uncommitted diff. Fewer turns, but the audit's verdict and its fix list land as one unreviewed change to the feature's checklist.
- [ ] It only prints suggested rows, and the human adds them through `/task-plan`. No third row owner, but `/task-plan` works on one existing task ID and has no path for adding brand-new rows.

### Q6: Who performs the audit: the session itself, or a fresh read-only agent?

- [x] New read-only `auditor` agent (`agents/auditor.md`, tools `Read, Glob, Grep, Bash`) dispatched by a thin `/audit-feature` skill (recommended). It is a reviewer that did not write the code. The audit often runs in the same session that just finished the last task, where an inline audit would be grading its own work. It follows the `explorer` / `answerer` pattern already in `agents/`.
- [ ] Inline in the skill. One file instead of two, and no relay step. But in a warm session it is reviewing its own work, and the human has to remember to start a fresh session to get an independent look.
- [ ] Reuse `explorer` with an audit prompt. No new file, but `explorer` is built for recon before a plan exists, and its brief shape (Verdict as complexity, Pushback, Relevant files) does not fit a merge-readiness check.

### Q7: Does `/audit-feature` hunt for line-level bugs itself?

- [x] No. It checks the work against the plan, decisions, pitfalls, tasks and goal, runs `just verify`, flags any bug it happens to see, and suggests the built-in `/code-review` for a dedicated bug pass (recommended). It does not rebuild a reviewer that already exists, and the audit stays fast and focused on "is this feature done".
- [ ] Yes, it reviews the whole feature diff for bugs as well. One command covers everything, but it duplicates `/code-review`, makes every audit much longer and more expensive, and mixes two kinds of findings in one report.

## Out of Scope

- **Adding the provenance block to the existing experiment repos** (cmreg, t2o). The guideline now
  requires it, and each repo picks it up through its own task.
- **Editing existing experiment records** to backfill provenance. A committed record is never
  edited.
- **A shared provenance script in `~/.claude`.** `docs/goal.md` rules out distribution to other
  machines, and the server cannot read this directory.
- **Enforcing the closing block with a hook.** `docs/goal.md` rules out Stop-hook enforcement. It
  stays a written instruction.
- **Changing `/feature-plan`'s turn-by-turn stops.** They are where the human pivots before
  anything is written. Only its final report gets the closing block.
- **Any skill invoking or chaining into another.** `/implement` still never commits, and
  `/audit-feature` still never starts `/implement` or `/code-review`.
