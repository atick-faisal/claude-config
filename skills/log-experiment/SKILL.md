---
description: Turn a saved experiment log into one numbered record under docs/experiments/, and update the run and findings ledgers.
argument-hint: "<path to the saved log>, or <TASK-ID> for a no-run finding"
disable-model-invocation: true
---

# Log an experiment

`$ARGUMENTS` is a path to a log the human saved from the machine that ran the experiment, and may
name a task ID alongside it. A task ID **on its own** is the no-run form of §1: a finding that came
out of writing the code, with no log behind it.

---

## 1. The bar test

Record a run that **produced numbers someone might cite, argue with, or try to reproduce.** A
crashed run earns a record too, when the crash is the finding.

Not an experiment record: a run that only proved the code starts, a smoke test, a `--dry-run`, a
re-run that produced nothing new. Say so and write nothing rather than minting an ID for it. Run
numbers are permanent and a ledger padded with non-events is one nobody reads.

**A finding that came out of writing the code earns a record too, on the same bar** — a
dependency's hard limit, a default that silently does nothing, an ordering that matters. It has no
log, no wall clock and no console block, so it takes the **no-run form** the template sets out:
header collapsed to date, task and `git_sha`, `## Command` gone, `## Results` replaced by
`## Evidence`. It is not a lesser record and it draws on the same two counters, because a finding's
weight does not depend on whether a GPU was involved. The bar is unchanged: cited, argued with, or
re-derived the expensive way. A preference, a refactor, or something the docs already say is not a
finding.

## 2. Resolve the repo and read the log

`git rev-parse --show-toplevel`; fall back to the working directory and say so.

Records live at repo level in `docs/experiments/`, deliberately outside `docs/features/`, so a
campaign spanning three features stays one readable sequence. **This skill does not require an
onboarded repo** — a research repo that has never seen `/project-init` still gets records.

Read the log at the path. If nothing is there, say so and stop; never take a paste instead, because
the saved file is what the record's `Log:` field points at.

**The no-run form has no log**, so this step and the filename check below are skipped outright —
not faked with a plausible path. Take `git_sha` from `git rev-parse --short HEAD` with its `-dirty`
suffix intact, and take the evidence from the code itself: open the file and cite it by path and
line, never from a memory of what it says.

**Check the filename** against `~/.claude/guidelines/research.md`'s convention,
`logs/<YYYY-MM-DD>-<task>-<what-ran>.txt`. If it misses, say so in one line and carry on with the
path as given. Never rename or move the human's file — flagging the drift is the whole of the job
here, and two naming conventions living side by side is what that flag exists to catch.

**Read it by anchor, not whole.** A log is pasted unfiltered by mandate and can be enormous. Find
the two delimited blocks the guideline requires: the provenance block at the top
(`=== PROVENANCE ===` … `=== END PROVENANCE ===`) and the result block (`=== <TOOL> RESULT ===`).
Then find the provenance footer at the end, which carries the finish time and wall clock, and the
W&B group names. Those are what the record needs, and they are exactly what a filtered log would
have destroyed.

**An older log may have no provenance block.** That is not a reason to stop or to ask. §5 says
what the record does instead.

## 3. Open the ledger, creating it on first use

`docs/experiments/index.md` allocates both counters. Read it before anything else is decided.

**If `docs/experiments/` does not exist, create it** and instantiate the ledger from
`~/.claude/templates/experiments-index.md`, example rows deleted along with the strip block. This
is the one place in the system where a skill scaffolds, and it is deliberate: nothing else creates
`docs/experiments/`, and `/feature-plan` will not, because a campaign of experiments is not a
feature. Say plainly that you created it.

Instantiate both templates the way `skills/feature-plan/SKILL.md` sets out: read from
`~/.claude/templates/`, strip the `<!-- TEMPLATE ... -->` block entirely, replace every
`<angle-bracket>` placeholder. Do not `cp`. An instantiated file carries no HTML comment and no
placeholder.

## 4. Check for a duplicate, then allocate

**Before taking a number**, grep `docs/experiments/` for the log path. If a record already cites
it, this run is logged: name that record and stop. A duplicate is not a harmless second line — it
is a second row in the run ledger, and every later count of it is wrong.

**The no-run form has no log path to grep**, so check the claim instead: grep for the task ID and
for the symbol or file the finding is about. Two records asserting the same limit is the same
double-count, and it is likelier here, because the same footgun gets rediscovered by whoever next
touches the code.

Then allocate, each counter taken as the highest already in the ledger plus one:

- the run, `<NNN>`, zero-padded to three;
- each finding, `F<NN>`, zero-padded to two, **global across `docs/experiments/`**, never restarted
  per file.

Never reuse an ID, never renumber a row. Gaps are expected and fine.

## 5. Write the record

Write `docs/experiments/<NNN>-<slug>.md` in the shape `~/.claude/templates/experiment.md` sets
out — kebab-case slug, two to four words, naming what ran. Take every header field from the log
rather than from memory, and from the provenance block wherever it has the field:

- **Machine** — the block's `hostname` line.
- **git_sha** — the block's `git_sha` line, `-dirty` / `-untracked` suffix intact.
- **Command** — the block's command line, as it was actually run.
- **Wall clock** — the provenance footer.
- **Date** and **W&B group** — the block's start time, and the W&B group names found in §2.
- **Environment** — the whole block pasted verbatim, markers and all, the same way Results holds
  the console block.

**No provenance block — do not ask.** Write `not recorded` in every field the block would have
filled, and in `## Environment`. Add a provenance caveat saying the log predates the block, so
the machine, environment and exact command are unknown, and flag the gap in the report (§7). A
field filled from memory or guessed from the log's filename is the fabrication the next rule
forbids. This is for a run whose log lacks the block; the no-run form has no run, so its fields
are deleted, not marked `not recorded`.

- **Results** — the console block verbatim from the log. Not retyped, not tidied, not trimmed to
  the rows that look interesting.
- **Evidence** — the no-run form's replacement for Results: paths and line anchors, and the
  behaviour actually observed. An error quoted verbatim, a value that came back, a branch that
  never fired. Evidence that is a reading of the source rather than an observation of it is a
  hypothesis, and the record says which it is.
- **Findings** — a claim and the numbers under it, each naming what it is being compared against.
  A finding that cannot name its comparison is an observation; leave it out.
- **Provenance caveats** — fill it or write `None.`, never blank. A `-dirty` SHA, a column composed
  from an earlier run, a cell a resume skipped: each makes a number mean less than it looks, and
  each is invisible three weeks later. On a no-run record this carries what was **not** checked:
  the version the behaviour was observed under, and whether it was executed or reasoned about.
- **Task** — the task ID that owns the run, or `[no-task]` when no row does, the same opt-out the
  commit guard documents.

**Never invent.** A number the log does not contain, a comparison nobody ran, a caveat you
assumed: leave it out, and ask about it as a closing question if it matters. A fabricated record is
worse than a missing one, because it reads as evidence.

**No stop before writing.** The human reviews the record as part of the uncommitted diff. Until it
is committed, git is the undo: a rejected record is deleted along with its ledger rows, and since
nothing committed ever cited its number, no ID is burned. "Never edited" starts at the commit.

## 6. Update both ledgers

Append one row to **Runs** and one row per finding to **Findings**. A no-run record gets an
ordinary row with `—` in `Machine`, `What ran` naming what was being authored, and the claim itself
as the Headline; the dash is the whole of what marks it, because splitting these into a second
table is how a finding chain stops being followable from one end to the other. Otherwise the
Headline is the one number someone would actually cite, not a summary of the run, and a run whose
headline is "no change" still gets its row — a flat result is a result, and this is where it stays
visible.

**When a new finding acts on an earlier one, two cells change and nothing else:** the old row's
`Status` — `confirmed`, `refuted` or `superseded` — and the old row's cross-reference cell. The new
row names what it acts on from its own side. Written from both ends, the chain reads from whichever
end you arrive at, which is the entire reason that column exists.

That is the only permitted edit to an existing ledger row, and **the committed record file it
points at is never touched** — not to soften the claim, not to add a note that it was
overturned. A record is a dated statement of what was believed on the strength of one run. Edit it
and it stops being evidence of anything.

## 7. Report

End with the closing block (`CLAUDE.md`, "How I like answers"). The Summary says in plain words
what ran, what it found, and any earlier finding it confirmed or overturned — not run or finding
IDs. If the log had no provenance block, say so once as a closing question, naming the
`not recorded` fields, so the human can fill them in before committing. Then suggest resuming what
was interrupted — usually `/implement <ID>`. Suggest; never invoke.

It is a doc-only change and the human reviews and commits it. The guard wants the task ID **in
parentheses** in the subject — `📝 docs(experiments): record <NNN> <what-ran> (<TASK-ID>)`, not a
bare mention of it in the prose — or `[no-task]` when no row owns the run.

---

## Guardrails

- **One run, one file, one number.** Never reused, never renumbered.
- **Never edit a record after it is committed.** The ledger's Status cell is where a claim's fate
  is recorded instead. Before the commit, the uncommitted diff is the review.
- **Never edit a committed ledger row beyond the two cells §6 names**, and never delete one.
- **Never invent a number, a comparison or a caveat.** Leave it out, or write `not recorded`.
- **Never let a no-run record borrow a run's authority.** No wall clock, no machine, no W&B group,
  no `Log:` path and no `## Environment` — those are deleted, not filled with something plausible.
- **Never rename, move, filter or delete the log.**
- **Never write code**, never touch `docs/goal.md`, `plan.md`, `tasks.md`, `decisions.md` or
  `pitfalls.md`, never stage or commit.
