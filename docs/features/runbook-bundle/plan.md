---
slug: runbook-bundle
title: Server runbooks and log bundling
status: shipped
created: 2026-11-16
---

# Server runbooks and log bundling

## Summary

Research repos run their experiments on a Windows GPU server reached over RDP, where only text
crosses between the server and this Mac (`guidelines/research.md`). Claude writes a *runbook* for
each server run: a Markdown file of PowerShell blocks the human pastes into the server. Two things
about this hurt today.

1. **Runbooks have no convention.** Thermal-To-Optical-Translation keeps an undated
   `RUNBOOK-clipped-box-audit.md` at the repo root, and its header says to delete it after logging.
   Thermal-Image-Registration has deleted every runbook it ever had, so record 055 can only
   describe its runbook in prose — including that the runbook's log names differed from the files
   actually saved. The two repos share no format.
2. **Bringing results back costs one paste per file.** A run writes many logs and CSVs; record 026
   in Thermal-To-Optical-Translation cites fifteen log files and two CSVs. RDP shares the clipboard
   but not files, so the human creates each file on the Mac by hand and pastes its contents one at
   a time. One record already cites two logs marked "(condensed)", the opposite of the guideline's
   unfiltered rule.

This feature gives every runbook a fixed format, a dated name and a permanent home on the Mac.
Every runbook ends with a **Bundle** section that joins all of the run's logs and CSVs into one
block of text, copied in one go. `/log-experiment`, given that pasted bundle, splits it back into
the original dated files under `logs/`, checks each one against a checksum, deletes the bundle, and
then records the experiment exactly as it does today.

## Tech Stack / Approach

Everything is built in `~/.claude`. The research repos only receive the files the new flow writes.

**Writing the runbook (Mac)**

- `templates/runbook.md` (new) — fixed sections, taken from the shape of
  Thermal-To-Optical-Translation's `RUNBOOK-clipped-box-audit.md`:
  - a header naming the task ID, the date, the server repo path and the expected `git log -1`;
  - `## 0. Session setup`, which sets `$D` and `$TASK` in every PowerShell window;
  - numbered steps, each writing `logs\$D-$TASK-<what-ran>.txt` through `Tee-Object`, as that
    runbook already does;
  - a final `## Bundle` section, replacing today's "Bring back" list.
  - No "delete this file after `/log-experiment`" line: runbooks are kept.
- Runbooks are named like logs, `runbooks/<YYYY-MM-DD>-<TASK-ID>-<what-runs>.md`, kept in each
  repo, git-ignored and never deleted (Q1).
- `skills/runbook/SKILL.md` (new, Q2) — `/runbook` takes a task ID, instantiates the template into
  `runbooks/`, and adds `runbooks/` to the repo's `.gitignore` on first use. It writes no code and
  chains into nothing.
- `guidelines/research.md` — two Conventions bullets:
  - **Runbooks:** where they live, that they are never deleted, and that the last section is
    always Bundle.
  - **What a run prints (Q3):** always the provenance block, the result block, the footer, W&B
    group names, warnings and errors, and per-epoch or per-stage summaries; never per-batch lines
    or progress-bar redraws. The ultralytics lesson's `GITHUB_ACTIONS=1` is one candidate switch,
    not yet confirmed on Windows. This limits what is *printed*. What was printed is still pasted
    unfiltered, so "a filtered log is a destroyed record" stands.

**The Bundle section (server)**

- Inline PowerShell in the template — not a script committed to each repo, and not a function in
  the server's profile. That keeps both halves of the format, bundler and unbundler, defined in
  one repo: `~/.claude`.
- It gathers `logs\*-$TASK-*` (`.txt` and `.csv`), prints the list, and reads each file with
  `[IO.File]::ReadAllText`, which honours a byte-order mark and defaults to UTF-8. Neither shortcut
  is safe: `Tee-Object` on PowerShell 5.1 writes UTF-16, and `Get-Content` on 5.1 reads a BOM-less
  UTF-8 CSV as ANSI.
- Line endings are normalised from CRLF to LF. Each file is wrapped in marker lines that carry a
  random per-bundle token, the file's relative path, its line count and its SHA-256. A log line
  that merely looks like a marker cannot match, because it would need the token.
- `Set-Clipboard` puts the bundle on the server's clipboard, so nobody selects text in a console
  with limited scrollback. A copy is kept as `logs\$D-$TASK-bundle.txt` on the server so it can be
  re-copied.
- No size handling (Q3). Output is kept small at the source; an oversized run is an exception the
  human handles with custom instructions; and a paste the clipboard cut short fails its checksum
  on the Mac, so it is never saved as half a log.
- On the Mac the human runs one command, `pbpaste > logs/<YYYY-MM-DD>-<TASK-ID>-bundle.txt`,
  instead of creating each file in an editor.

**Unbundling (Mac)**

- The splitter is `skills/log-experiment/unbundle.py` (Q4), standard library only:
  - verifies every file's line count and SHA-256 before writing any of them;
  - rejects absolute paths, `..`, and anything that would land outside `logs/`;
  - skips an existing file with the same hash, and refuses one with a different hash;
  - writes atomically (temp file, then rename), because Google Drive syncs a half-written file;
  - deletes the bundle only after every write succeeds, then prints a short summary to relay.
- Content is carried byte for byte, with no ANSI stripping. The
  `ultralytics-progress-bar-garbles-piped-logs` lesson shows Windows pipes leave `←[K` and mangled
  box-drawing characters in logs, and that is still the log.
- `skills/log-experiment/SKILL.md` — a new step before §2: a path ending in `-bundle.txt` is
  unbundled first, then the whole bundle becomes one record whose `Log:` field lists every
  unpacked file (Q5); the duplicate check in §4 greps for each of them. The guardrail "Never
  rename, move, filter or delete the log" gains one exception: the bundle file, deleted only after
  a verified unbundle.
- `justfile` — the `python` check also parses `skills/**/*.py`, and a new `test` check runs the
  unbundler's round-trip tests (stdlib `unittest`). A hand-written bundle fixture covers CRLF, a
  marker-like line inside a log, a truncated file, a bad checksum and path traversal. The PowerShell
  half cannot run on this Mac, so the first real bundled run is its test.

**Reused:** the log naming rule and "nothing but text crosses" from `guidelines/research.md`; the
runbook shape of Thermal-To-Optical-Translation's `RUNBOOK-clipped-box-audit.md`; template
instantiation as `skills/feature-plan/SKILL.md` sets it out; and a multi-file `Log:` field, which
Thermal-To-Optical-Translation records 026 and 030–040 already use.

## Open Questions

## Resolved

### Q1: Where do runbooks live, and are they committed to git?

- [x] `runbooks/` in each repo, dated, git-ignored, never deleted (recommended) — sits next to the code and logs it belongs to; Google Drive already backs the repos up; keeps server paths and the hostname off Thermal-To-Optical-Translation's public remote.
- [ ] `runbooks/` in each repo, committed — real history and reviewable diffs; but publishes `D:\Atick\…` paths, the server hostname and dataset locations, and every runbook tweak becomes a commit that needs a task ID.
- [ ] One central folder outside the repos, e.g. a per-repo folder in Google Drive — one place to browse every runbook; but separates a run's instructions from its repo and logs, and bakes an absolute path into the tooling.

### Q2: How does a runbook get written to the convention?

- [x] A new `/runbook` skill, given a task ID, that instantiates `templates/runbook.md` (recommended) — the format is applied every time it is typed, it pairs with `/log-experiment` as the two ends of one server run, and it can git-ignore `runbooks/` on first use.
- [ ] Template plus a rule in `guidelines/research.md`, no new skill — smallest change, no new entrypoint; but it depends on the guideline being read at the moment a runbook is written ad hoc, which is the path that produced today's drift.

### Q3: What happens when a bundle is too large for one paste?

- [ ] Split into numbered parts under a size cap (recommended) — the server copies one part to the clipboard and waits for Enter before the next; on the Mac each part is appended with `pbpaste >>`; the unbundler refuses a missing or out-of-order part. Big campaigns are where the friction is worst, and three pastes still beats fifteen files. The cap starts conservative and the first real run calibrates it.
- [ ] One block only; past the cap the bundler warns and the human copies files one by one — simplest format; but it fails on exactly the big runs, where a single log reaches about 3 MB.
- [ ] Compress first (gzip, then base64) — most bundles fit one paste; but the paste is unreadable, one mangled character loses the whole bundle, and a big campaign still needs parts.
- [x] None of these: keep output small at the source (the human's answer) — "this should never happen. add rules to log important info and supress irrevalent info. when it happens i will treat it like a exceptional case i provie custom instructions. adding a rule for this would encourage this behavior." A rule in `guidelines/research.md` limits what experiment code prints; the bundler has no size handling; a truncated paste still fails its checksum on the Mac.

### Q4: Who splits the pasted bundle back into files?

- [x] A small standard-library Python script that `/log-experiment` runs (recommended) — byte-exact, unit-tested, costs almost no tokens on a multi-MB log, and only a short summary enters the conversation; it is the first skill to ship a script, so it sets a new pattern.
- [ ] Inline steps in the skill, with the model writing each file — no new pattern; but the model reads and re-types every byte, which is slow and costly on 3 MB logs and can truncate or "tidy" content the guideline says must stay unfiltered.
- [ ] A specialised subagent — keeps the main conversation clean; but it carries the same re-typing risk as inline, needs the first write-capable agent, and a script keeps the conversation just as clean.

### Q5: After unbundling, how many experiment records does `/log-experiment` write?

- [x] One record for the whole bundle, its `Log:` field listing every file (recommended) — this is already how records 026 and 030–040 cite a runbook's many logs; the skill's "one log path" wording catches up with practice.
- [ ] None yet: unbundle, list the files and stop, then the human runs `/log-experiment` per log — keeps one-log-one-record literal; but brings back one command per file, which is the friction being removed.
- [ ] One record per log that passes the bar test — a finer-grained ledger; but it splits a training run from its readout and inflates the run counter.

## Out of Scope

- Hand-editing the two research repos as part of this feature. Each adopts the convention at its
  next runbook; moving the existing `RUNBOOK-clipped-box-audit.md` into `runbooks/` is a one-off
  the human can do.
- Binary artifacts such as checkpoints, images and Parquet files. Only text logs and CSVs are
  bundled; "nothing but text crosses" still stands.
- Any other transfer channel: a shared drive, `scp`, or cloud sync from the server. The text-only
  RDP link is treated as fixed.
- An index or journal of runbooks. The dated folder is the index; a running log of runs would be
  the journal `docs/goal.md` rules out.
- Changing the experiment record template. A bundle's files go in the existing `Log:` field.
- Rewriting past records, logs or runbooks.
