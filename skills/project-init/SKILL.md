---
description: Onboard a repository into the planning system — surveys the repo, then scaffolds docs/goal.md, a project CLAUDE.md, and a justfile `verify` recipe.
argument-hint: "[what this project is]"
disable-model-invocation: true
---

# Project bootstrap

Every other skill in this system assumes a repo already has three things: `docs/goal.md`, a project
`CLAUDE.md`, and a `justfile` exposing `verify`. This is what puts them there, once, per repo.

`$ARGUMENTS` is the human's description of the project, in their own words. It may be absent — in
an existing repo the README and the package metadata usually say more than a sentence would.

## This is a protocol across turns, not a script

Read the whole file, then execute **one turn at a time**. Each **STOP** below means: end your turn,
say nothing further, wait for the human.

```
Turn 1  resolve repo root → survey → report state, show every proposed write → STOP
Turn 2  human approves → write → report → STOP (suggest /feature-plan)
```

Writing in the same response that proposes is the failure mode this file exists to prevent. These
three files are read at the top of every future session in this repo; a wrong `goal.md` is wrong for
months. Nothing is on disk after Turn 1, so a pivot costs nothing. Never batch.

You never write code. You never commit. You touch four files and no others.

---

## Turn 1 — survey and propose

**Resolve the repo root.** Run `git rev-parse --show-toplevel`. If it fails you are not in a git
repo: say so, offer `git init`, and carry on surveying the working directory. Do not abort.

### Survey

Every check below is independent. A check that cannot be answered is a reported line, never a reason
to stop.

| Check | How | What it decides |
| --- | --- | --- |
| `just` on PATH | `command -v just` | absent → say so; the recipe still gets written |
| `docs/goal.md` | exists? | present → **immutable, untouched**; absent → draft it |
| `CLAUDE.md` at root | exists? | present → propose *additions only*; absent → instantiate |
| `justfile` | exists? has `verify`? (`just --summary`) | three states, see Turn 2 |
| `docs/features/` | exists? | non-empty → the repo is already onboarded |
| `mkdocs.yml` / docs site config | exists? excludes `features/`? | see below |
| what CI runs | `.github/workflows/*.yml`, `.pre-commit-config.yaml`, `Makefile`, `package.json` scripts, `pyproject.toml`, `build.gradle*`, `Cargo.toml`, `go.mod` | the `verify` body |

### Deriving `verify` is the real work of this skill

Do not pick a recipe off a shelf because the repo has a `pyproject.toml`. **Read what the repo's CI
already runs and compose exactly that, in the order CI runs it.** CI is the definition of "green" a
human already agreed to; `verify` exists to reach it before pushing, not to approximate it.

That is why there is one minimal template and no per-stack stubs. A generic Python stub gives you
ruff, mypy and pytest — and silently omits the copyright-header check and the migration-head
assertion that this particular repo will fail CI on.

Two rules for the body:

- **Call, never copy.** Where a recipe, `Makefile` target, or `package.json` script already runs the
  check, `verify` invokes it by name. A command written in two places drifts, and the copy is always
  the stale one.
- **One recipe per check, `verify` depends on them.** Named checks are what let a human run just the
  broken one. If the repo already has more than a couple of checks, say so and propose the
  non-fail-fast form (run all, collect failures, print one summary) — fail-fast dependencies hide
  every failure after the first.

If nothing in the repo runs any check at all, propose the smallest honest `verify` for its stack and
**say that you are guessing**, so the human corrects it now rather than discovering it at the first
`/implement`.

### Drafting `goal.md`

Only if it is absent. Source it from `$ARGUMENTS`, the README, package metadata and the repo's own
structure — nothing else.

**Anything you cannot ground in evidence gets an explicit `<TODO: …>` marker, not a plausible
sentence.** An invented Success Criterion is worse than a blank one: `/feature-plan` checks every
future feature against this file, so a guess becomes a rule nobody chose.

**Non-Goals will almost always be a TODO.** Nothing in a repo records what was deliberately left
out, and that section does the most work of the four — it is what a sprawling feature plan gets
checked against. Say out loud that it needs the human, rather than filling it.

### Relay

Report, in one response:

1. **State table** — one row per artifact (`docs/goal.md`, `CLAUDE.md`, `justfile`, docs-site
   config), each `missing` / `present, unchanged` / `present, needs patch`, with one line of why.
2. **The drafted `goal.md` in full**, TODO markers and all.
3. **The proposed `verify` recipe verbatim**, in a fenced block, plus what you derived it from.
4. **The exact `CLAUDE.md` change** — the whole file if it is being created, otherwise only the
   lines being inserted.

**If every row is `present, unchanged`, the repo is already onboarded.** Say so, report any drift
you found anyway (see below), and **STOP** — do not manufacture a patch to justify the run.

**STOP.** Nothing has been written.

---

## Turn 2 — write

On approval, and only for the rows the human approved.

**Instantiating a template.** Read it from `~/.claude/templates/`, then Write the destination with
the `TEMPLATE` strip-block removed entirely and every `<angle-bracket>` placeholder replaced. Do not
`cp`. Each strip-block's last line names exactly which placeholders remain in the body once it is
gone — use it as your checklist. An instantiated file contains no strip-block and no placeholder,
with the sole exception of `goal.md`'s deliberate `<TODO: …>` markers.

**`docs/goal.md`** — from `~/.claude/templates/goal.md`. Write **only if absent**. An existing one
is never edited, never appended to, never "brought up to date". It is the immutable north star, and
this skill is not the exception to that.

**`CLAUDE.md`** — from `~/.claude/templates/project-claude.md`.

- Absent → instantiate. Fill the recipe table from the justfile, and the footgun list from what the
  survey actually turned up (a command that must run from a subdirectory, a suite that needs a
  service, a generated file that must be committed). No footguns found → leave the section with one
  honest placeholder line rather than inventing three.
- Present → insert **only** the `## Planning` section, and only if it is missing or points somewhere
  stale. Never rewrite, never reorder, never touch a line of prose the human wrote. A `## Planning`
  section pointing at a root `PLAN.md`/`TASKS.md` from a superseded workflow is the common case —
  propose replacing that section's body, and show the human both versions first.

**`justfile`** — from `~/.claude/templates/justfile`.

- Absent → instantiate with the derived body.
- Present, no `verify` → **append one recipe.** Nothing else in the file moves: no reordering, no
  reformatting, no touching another recipe's body. The diff is the recipe you added.
- Present, has `verify` → **leave it alone entirely.** Report what it runs so the human can confirm
  it is still the full set, and move on.

**Docs-site config** — if `mkdocs.yml` (or equivalent) exists and does not exclude the feature tree,
propose it. Note the trap: **being absent from `nav:` is not exclusion.** MkDocs builds every `.md`
under `docs_dir` regardless of nav, so feature specs are published unless excluded outright —
`exclude_docs` (MkDocs ≥ 1.5) is the modern fix. `docs/features/` is agent state, not documentation.
Ask before editing; the published docs config is the human's.

### Report

End with the closing block (`CLAUDE.md`, "How I like answers"). The Summary says what was
written and what was left alone. A genuinely needed follow-up — a `<TODO: …>` in `goal.md`, a
guessed `verify`, a declined patch — is asked as a closing question.

**STOP**, and suggest `/feature-plan`.

---

## Guardrails

- **`docs/goal.md` is write-once.** If it exists, this skill does not touch it. No exceptions.
- **Never rewrite an existing `CLAUDE.md` or `justfile`.** Add only, and only what was approved.
- **Never invent `goal.md` content.** Ungrounded → `<TODO: …>`, and say so out loud.
- **Never create `docs/features/`** or anything inside it. `/feature-plan` owns that tree.
- **Never write code, never touch `.gitignore` or CI config, never stage, never commit.** The
  bootstrap files are the human's to commit. Note that once `docs/features/*/tasks.md` exists the
  commit guard applies, and `[no-task]` in the subject is its documented opt-out.
- **Idempotent.** A second run on a finished repo writes nothing and says so.
- **Every strip-block deleted, every placeholder filled.** Check before you finish the turn.
- End with the next-step suggestion. It is a suggestion — you never invoke it yourself.
