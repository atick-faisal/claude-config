---
slug: research-workflow
title: Research Workflow Guideline + Experiment Record Skill
status: shipped
created: 2026-09-08
---

# Research Workflow Guideline + Experiment Record Skill

## Summary

Experimental ML work here targets publishable results, and it runs across two machines: this
Mac (CPU/MPS, dataset download and exploration, Docker, `uv`, and as much verification as can
possibly happen before a GPU is involved) and a Windows Server 2022 VM with 2x A100s, CUDA
13.0, no WSL GPU passthrough, and a local W&B server. IT restrictions mean **nothing but text
crosses between them**: code goes over by `git pull`, results come back as a pasted console
log. Two artifacts come out of this feature.

1. `guidelines/research.md`, currently a 12-line skeleton, filled in to state that workflow —
   the two-machine split and what "verify it here first" concretely means, the on-demand `uv`
   dependency blocks that keep a 2.3 GB CUDA torch off a CPU-only machine, the requirement
   that every experiment emit both a copy-pasteable console block and a machine-readable
   results file, and where W&B fits (opt-in, summaries only, and the stakeholder-facing
   channel later).
2. A `/log-experiment` skill that turns a pasted server log into one structured, findable
   record. This is the half that has already failed once: in the case study, run-by-run
   findings were appended inline into `TASKS.md` until it reached 3,125 lines / 223 KB, mixing
   an unbounded experiment journal into what should be a checklist. The content is good —
   findings cross-reference each other, `F6` posts a falsifiable prediction that `F11`/`F12`
   later confirm, `F3` gets refuted by `F7` — and the failure is purely one of location and
   growth. The skill gives those records a home with a bounded per-file size and stable IDs.

On the goal file's Non-Goal *"A journal or changelog. Git log plus task-ID commit subjects is
the history"*: an experiment record is deliberately outside that. Git history records what the
code became; an experiment record is measurement data — what the code produced when run on
inputs that are not in the repo, on a machine the repo never sees. It cannot be reconstructed
from a diff. That distinction is stated here so it is settled rather than re-argued.

## Tech Stack / Approach

**The guideline** follows `guidelines/python.md`'s established shape: terse bullets under
`## Stack & tooling`, `## Conventions`, `## Things that will trip you up`, read before
proposing an approach. It is additive to `python.md`, never a restatement of it. Content is
seeded from what already works in the case study rather than invented:

- the case-study repo's `pyproject.toml` — the on-demand
  dependency answer, already working: conflicting `cpu`/`gpu` extras under `[tool.uv]
  conflicts`, `[tool.uv.sources]` routing torch/torchvision to explicit `pytorch-cpu` /
  `pytorch-cu130` indices so one `uv.lock` serves both machines, plus *orthogonal* extras
  (`matchers`, `scripts`) that are not in the conflict set, each carrying an inline comment
  naming its failure mode.
- `.../src/cmreg/results/store.py` — Parquet as the source of truth for per-pair rows, with a
  **declared, never inferred** Arrow schema (an all-failed run infers `null` dtype and refuses
  to concatenate months later at aggregation time).
- `.../src/cmreg/results/report.py` — the `=== CMREG RESULT ===` console block, and
  `cmreg report` re-rendering it from a Parquet file without re-running anything. This is the
  answer to "no file transfer": the text block is the channel.
- `.../src/cmreg/tracking.py` — W&B as an opt-in no-op, never able to take a run down, and
  `git_sha()` stamping `-dirty` / `-untracked` into the run identifier so a result from an
  uncommitted tree is self-identifying.
- `.../AGENTS.md` — the log protocol (`logs/<YYYY-MM-DD>-<task>-<what-ran>.txt`, git-ignored,
  "paste the log unfiltered"), and why: filtering out the INFO and W&B lines once destroyed the
  only record of a stage's wall clock and W&B group names.
- `~/.GoogleDrive/Documents/Obsidian/Lessons/uv-run-reverts-extras.md` — already covers the
  `uv run` re-sync footgun; the guideline points at it rather than restating it.

One tension to resolve in the writing, not to leave implicit: `python.md` says "`logging`,
never `print`". The console block is not an exception to that — it is stdout written
deliberately by one reporter module that is the only thing in the package that formats a
result, which is exactly how `report.py` is structured.

**The skill** is modelled on `skills/log-pitfall/SKILL.md` (87 lines), the closest analogue in
the system: frontmatter is exactly `description` / `argument-hint` /
`disable-model-invocation: true`; the body is numbered steps opening with a bar test, resolving
the repo via `git rev-parse --show-toplevel`, and closing with a Report step and a
`## Guardrails` list of bolded negatives. It never scaffolds, never commits, and ends by
suggesting the next command rather than invoking it. Structure of the record itself comes from
a new `templates/experiment.md`, matching how every other skill references
`~/.claude/templates/<name>.md` rather than inlining the shape.

Shipping also touches `CLAUDE.md`: one entry in the "On demand:" list at line 25, and — if the
guideline is to be found at all — its row already exists in the guidelines table at line 53.
`CLAUDE.md` loads in every session in every project, so that addition is one clause, not a
paragraph.

`just verify` at `justfile` checks shell, Python-ast, JSON and tracked-ness. Markdown is
unchecked, so it will not catch a malformed `SKILL.md`; correctness of these files is a
read-them-back matter. `.gitignore` is an allowlist but already has `!guidelines/**`,
`!skills/**` and `!templates/**`, so no `.gitignore` change is needed and `just tracked` will
say so if that is wrong.

## Open Questions

## Resolved

### Q1: Where does an experiment record live?

- [x] Repo-level `docs/experiments/<NNN>-<slug>.md`, one file per run, plus a one-line-per-run
      `docs/experiments/index.md` ledger (recommended) — directly fixes the failure being
      designed against: per-file size is bounded by construction, and a campaign that spans
      three features (as the case study's phases do) stays one readable sequence. Costs a
      concept the system does not have yet: state outside `docs/features/`.
- [ ] `docs/features/<slug>/experiments.md`, appended — cheapest, and consistent with
      `pitfalls.md` / `decisions.md` being per-feature and append-only. It is also exactly the
      shape that produced the 223 KB `TASKS.md`; unbounded append is the known failure mode.
- [ ] `docs/features/<slug>/experiments/<NN>-<slug>.md`, a directory per feature — bounded
      files and stays inside the existing per-feature convention, but scatters one campaign
      across feature directories and makes the cross-feature `F6 → F11` reference chain hard
      to follow.

### Q2: How do findings get identified and cross-referenced?

- [x] A numbered findings ledger, `F<NN>`, global to the repo, each with a status of
      `open` / `confirmed` / `refuted` / `superseded` and a back-reference to the finding it
      acts on (recommended) — this is what the case study grew organically and it is the most
      valuable thing in that file: `F3` refuted by `F7`, `F6`'s falsifiable prediction
      confirmed by `F11`. A status field makes a stale claim visible instead of leaving two
      contradictory paragraphs 1,800 lines apart.
- [ ] Findings live inside their run record with no IDs — simplest to write, and loses the
      refutation chain entirely; the next run cannot cite what it overturns.
- [ ] Findings as ADRs in the feature's `decisions.md` — reuses existing machinery, but an ADR
      records a choice that was made, not a measurement that might later be refuted by data,
      and mixing the two makes `decisions.md` unreadable.

### Q3: What happens to the raw pasted log?

- [ ] The skill writes the paste verbatim to `logs/<YYYY-MM-DD>-<task>-<what-ran>.txt` itself,
      then distils the record from it (recommended) — one paste, no discipline required. The
      case study shows discipline decaying: `logs/` there carries two naming conventions side
      by side (`2026-08-27-p3a-stage-a-flir-msrs.txt` next to `logs_p3c_upsample.txt`).
- [x] The human saves the log first and passes a path — keeps a large paste out of the
      conversation, but the log arrives *as* a paste (that is the whole constraint), so this
      just adds a manual step before the automatic one.
- [ ] Keep the distilled record only, no raw retention — smallest footprint, and discards
      what `AGENTS.md` learned the hard way: the noise around the result blocks is the only
      record of wall clock and W&B group names.

### Q4: Does `just verify` have to run on the Windows GPU server?

- [ ] `just verify` must run on both machines (lint, types, CPU-only tests), with a separate
      `just gpu-smoke` recipe the server runs before a multi-hour job (recommended) — preserves
      `docs/goal.md`'s constraint that every onboarded project exposes `just verify`, and gives
      the server a cheap one-command sanity check that a long run will not die at minute three.
      Requires `just` installed on Windows Server 2022 — **unverified; worth checking before
      picking this.**
- [x] `just verify` is Mac-side only; the server runs experiment drivers and nothing else —
      matches current reality (the case study has no justfile at all, only `scripts/*.py`,
      `prek` and `pytest`), but means a GPU-only code path is never verified by the contract
      the rest of the system relies on.
- [ ] Research repos are exempt from the `just verify` contract — honest about the two-machine
      split, and it opts the entire research stack out of `/implement`'s definition of done,
      which is most of what the planning system is for.

### Q5: How prescriptive is the guideline about results storage?

- [x] Mandate the pattern: a frozen metrics-key schema, a declared Arrow/Parquet per-row store,
      one reporter module rendering the console block, a `<cmd> report` subcommand that
      re-renders from disk, W&B receiving summaries only (recommended) — it is a proven
      implementation with the reasoning already written down, and "port this" is a far cheaper
      instruction than "design a results layer".
- [ ] State the requirement only — every experiment must emit a copy-pasteable console block
      and a machine-readable results file — and leave the shape to each repo. More
      stack-agnostic, which `docs/goal.md` lists as a success criterion, but it re-opens a
      design question that has already been answered well once.

## Out of Scope

- Implementing a results store, summarizer or reporter in any specific research repo. The
  guideline says what the shape must be; `cmreg`'s implementation already exists and is the
  reference, not something to be re-derived here.
- Retro-migrating the case study's `TASKS.md` and `PLAN.md` into the new record format. If it
  is worth doing it is its own feature, in that repo.
- Any automation that runs experiments, provisions the Windows environment, moves files between
  the two machines, or calls the W&B API from `~/.claude`. The transfer constraint is a fact to
  design around, not a problem to solve.
- Changing `/implement`, `/feature-plan`, or `hooks/guard-task-commit.py`. The new skill is
  additive and human-invoked, like every other entrypoint.
- Publishing any of this as documentation for other people or machines — `docs/goal.md`
  Non-Goals, twice over.
