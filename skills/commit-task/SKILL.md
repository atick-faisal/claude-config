---
description: Review a finished task's diff, group it into commits by logical scope, and commit each one with a gitmoji conventional message carrying the task ID.
argument-hint: "<task-id>"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*)
---

# Commit a task

`$ARGUMENTS` is the task ID whose work is sitting in the working tree, e.g. `AUTH-ROTATION-04`.

**One task is not one commit.** A task is a unit of verifiable work; a commit is a unit of
reviewable change. One task often produces two or three — the feature, its tests, a doc update —
and squashing them into one costs the reviewer the ability to read either half on its own. Split by
scope, and give every commit from the task the same ID so history still traces back to one row.

---

## Inspect

Run `git rev-parse --show-toplevel`, then `git status --short`, `git diff` and `git diff --staged`.
Read the actual hunks. A grouping guessed from filenames alone gets tests and fixtures wrong.

**Nothing to commit** → say so and stop. If the tree is clean because the work is already
committed, say that instead — `git log --grep=<ID>` will show it.

**Resolve the task** for the description: grep `docs/features/*/tasks.md` for the ID. No hit is
fine and expected on `/feature-plan`'s inline path — take the ID at face value and use this
conversation for the description. Never invent a description from the shape of the ID.

### Group by logical scope

Common seams, in the order they usually commit:

- the implementation itself (`feat` / `fix` / `refactor` / `perf`)
- tests covering it (`test`)
- docs, including this feature's spec docs (`docs`)
- config, deps, tooling (`chore` / `build`)

Judgement, not ceremony: **collapse to a single commit when the diff genuinely has one scope.** A
three-line fix plus the test that proves it is one commit, not two. Conversely, an unrelated
refactor that rode along is its own commit or, better, excluded.

Order the commits so each one is coherent on its own — implementation before the tests that import
it.

### Message shape

```
<gitmoji> <type>(<scope>): <imperative description> (<TASK-ID>)
```

Every commit from the task carries the same `(<TASK-ID>)`, which is what keeps a split traceable to
one row and what Phase H's commit guard greps for. Scope is the area of the repo (`api`, `skills`,
`auth`), not the task. Subject in the imperative, no trailing period, keep it under ~72 chars.

| | | | |
| --- | --- | --- | --- |
| ✨ `feat` | 🐛 `fix` | ♻️ `refactor` | ✅ `test` |
| 📝 `docs` | ⚡️ `perf` | 🔧 `chore` (config) | ⬆️ `build` (deps) |
| 🗑️ removal | 🎨 formatting | 🚨 lint fix | 🔒️ security |

Add a body only when the *why* is not obvious from the diff — a constraint that forced the
approach, or an ADR reference (`See ADR-02.`). Never restate the diff in prose.

Follow whatever commit attribution this session's own instructions specify. Do not hardcode
trailers here.

---

## Stage and commit

For each group, in order:

```
git add -- <explicit path> <explicit path>
git commit -m "<message>"
```

**Stage by explicit path, every time.** Never `git add -A`, never `git add .`, never `git add -p`
(interactive git does not work here). The excluded list from `Inspect` stays excluded, and the way it
stays excluded is that you never use a wildcard.

If a `git commit` is rejected by a hook, report the hook's output verbatim and stop. Do not retry
with `--no-verify`.

List each commit's short SHA and subject for reference. Then end with the closing block
(`CLAUDE.md`, "How I like answers"): the Summary says in plain words what was committed and what
is still uncommitted and why (it should be exactly the excluded list).

**End by wheeling back to the human for review.** No next command — the next step is a person
reading the diff, or `/implement` on a task they choose.

---

## Guardrails

- **Never rebase, reset, checkout, stash, branch, or push.** This skill only ever adds
  commits to the current branch. `--amend` only when asked explicitly.
- **Never `--no-verify`.**
- **Never stage a path you did not list in `Inspect`.**
- **Never commit unrelated pre-existing changes**, however tidy it would be.
- **Never write or edit a file.** If the diff needs fixing, that is `/implement`'s job, not a
  commit-time edit.
