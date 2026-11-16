---
description: Write a server runbook for one task — instantiate templates/runbook.md into runbooks/<YYYY-MM-DD>-<TASK-ID>-<what-runs>.md, git-ignoring runbooks/ on first use.
argument-hint: "<TASK-ID> [<what runs>]"
disable-model-invocation: true
---

# Write a runbook

`$ARGUMENTS` is a task ID, optionally followed by what the run is, in the human's words.

A runbook is the PowerShell the human pastes into the Windows GPU server over RDP, where only text
crosses (`~/.claude/guidelines/research.md`). It is the only record of exactly what was pasted, so
it is kept, dated, next to the repo's logs, and never deleted. Its last section, Bundle, brings
every log back in one paste for `/log-experiment`.

This skill writes one runbook. It writes no code and runs nothing.

---

## 1. Resolve the repo and the task

`git rev-parse --show-toplevel`. If it fails, say so and **STOP**: step 0 of every runbook is
`git pull`, so a directory the server cannot pull has nothing to run.

**No task ID given: STOP and ask for one.** The ID becomes `$TASK`, and the Bundle section gathers
logs by it. Never invent one.

Grep `docs/features/*/tasks.md` for the ID. A hit gives you the row's Description. No hit is fine:
a research repo may not be onboarded, and `/feature-plan`'s inline path writes nothing to disk. Say
so in one line and carry on with the ID as given.

## 2. Gather what the runbook needs

Every value comes from the conversation, the repo or an earlier runbook. **Never invent a command,
a path or a SHA.** If one is missing, ask for it rather than writing something plausible.

- **The commands** — what runs on the server, taken from the conversation. If the conversation
  does not say what runs, ask.
- **`<what-runs>`** — kebab-case, two to four words, naming the run. Each step's `<what-ran>` is
  distinct, so no two steps write the same log, and never `bundle`, which the Bundle section skips.
- **`<server-repo-path>`** — from the newest runbook in `runbooks/`. If there is none, ask.
- **`<git-sha>`** — `git rev-parse --short HEAD`. The server runs what was pushed, not this working
  tree. If `git status --porcelain` shows changes to the code the run uses, say so in one line.
- **Durations** for `<order>` and `<step-notes>` — from an earlier log of the same command, else say
  the duration is not known yet.

## 3. Name the file

`runbooks/<YYYY-MM-DD>-<TASK-ID>-<what-runs>.md`, with today's date. That matches the log naming
rule, so a runbook sorts next to the logs it produced.

**If the name is taken by a runbook this conversation did not write, do not overwrite it.** Pick a
`<what-runs>` that says how this run differs, and say so. A runbook you wrote earlier in this
conversation, not yet run, is yours to revise.

## 4. Git-ignore `runbooks/` on first use

Runbooks carry server paths and the hostname, so they stay off the remote. Before writing, run
`git check-ignore -q runbooks/<filename>`.

- **Already ignored** — by any rule, an allowlist `*` included — do nothing.
- **Not ignored** — append `runbooks/` to the repo-root `.gitignore`, creating the file if there is
  none, and say plainly that you changed it. Never reorder or reword its existing lines.

## 5. Instantiate the template

Follow the template rules in `skills/feature-plan/SKILL.md`. Read `~/.claude/templates/runbook.md`,
then Write the runbook with the `<!-- TEMPLATE ... -->` block removed and every `<angle-bracket>`
placeholder replaced. Do not `cp`.

- **Read the strip block before you remove it.** Its STEPS rules decide how every step is
  written: log name, `& { ... } 2>&1 | Tee-Object $log`, `Write-Provenance`, the FINISHED line, and
  results CSVs copied into `logs\`. Its last line lists every placeholder left in the body.
- **The `## <N>. <step-title>` section repeats once per step**, numbered from 1, each ending with
  its `---` rule.
- **Copy the Bundle section exactly as written.** `skills/log-experiment/unbundle.py` reads its
  output and checks it against a line count and a checksum. One changed character can make every
  bundle fail on the Mac.

An instantiated runbook has no HTML comment and no angle-bracket placeholder left.

## 6. Report

End with the closing block (`CLAUDE.md`, "How I like answers"). In plain words, the Summary says:

- what the runbook runs and how its steps are ordered;
- whether `.gitignore` changed;
- any value that was missing and how it was handled;
- what the human does next: `git push`, then paste the blocks on the server.

After the run, the Bundle step prints the exact `/log-experiment` command. Suggest
`/log-experiment logs/<date>-<TASK-ID>-bundle.txt` as the next step, using the date that Bundle
prints. Suggest it; never invoke it.

The runbook is git-ignored and is never committed. A `.gitignore` change is committed by the human.
The commit guard needs the task ID **in parentheses** in the subject, for example
`🔧 chore(git): ignore runbooks/ (<TASK-ID>)`.

---

## Guardrails

- **Never invent a command, a path, a SHA or a task ID.** Ask instead.
- **Never change the Bundle section.** It must keep the same format `unbundle.py` reads.
- **Never overwrite, move or delete a runbook** this conversation did not write.
- **Never write code.** If the run needs a change first, that is `/implement`'s job.
- **Never push, stage or commit**, and never chain into `/log-experiment`.
- **Never touch `docs/goal.md`, `plan.md`, `tasks.md`, `decisions.md` or `pitfalls.md`.**
