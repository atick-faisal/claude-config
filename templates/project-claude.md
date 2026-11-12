<!-- TEMPLATE — delete this block when instantiating.

     Copy to <repo>/CLAUDE.md. Written once at project bootstrap by
     /project-init. If the repo already has a CLAUDE.md this file is not used
     at all — /project-init inserts the Planning section into the existing one
     and leaves every other line alone.

     Keep it under a page. It loads on every session in this repo, so length
     costs on every turn.

     Write only what someone would get wrong without being told. Not "run the
     tests" — the footgun that cost an afternoon: the directory a command has
     to run from, the service a suite needs up first, the generated file that
     has to be committed, the check that is scoped to changed files on purpose.

     The Planning section is fixed text, the same in every repo. Do not
     reword it per project.

     Body placeholders after this block is deleted: <project-name>, the
     <recipe> / <purpose> table rows, and the <footgun> list stubs.
-->

# Working in <project-name>

## Verification

**After implementing anything, run `just verify`.** It is the single entrypoint
that runs every check CI runs.

Do not report work as done until `just verify` exits zero. If a check fails for
a reason unrelated to your change, say so explicitly rather than removing the
check.

Run `just` with no arguments to see every recipe. The ones you will need most:

| Command | Purpose |
| --- | --- |
| `just verify` | Full verification. The entrypoint. |
| `<recipe>` | <purpose> |

## Things that will trip you up

- <footgun — what bites, and what to do instead>
- <footgun>

## Planning

Work here is planned before it is built.

- `docs/goal.md` is the north star: Problem, Success Criteria, Non-Goals,
  Constraints. Read it first. It is immutable — changing it is a conversation,
  not a routine edit.
- `docs/features/` holds one directory per feature, named for its slug:
  `plan.md` (whose `## Resolved` section is settled law), `tasks.md` (the
  checklist and its task IDs), `decisions.md` (ADRs), and `pitfalls.md`
  (footguns hit along the way). These are agent state, not published docs.
- `/feature-plan` starts a new feature. `/implement` builds one task from an
  existing one. `/task-plan`, `/write-adr`, `/log-pitfall` and
  `/resolve-pitfall` are on-demand. None of them run on their own — a human
  types them.
- Every commit names its task in the subject, e.g.
  `✨ feat(api): add refresh endpoint (AUTH-ROTATION-04)`. A commit that
  genuinely belongs to no task says `[no-task]` instead.
