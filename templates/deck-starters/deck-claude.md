<!-- TEMPLATE — delete this block when instantiating.

     Copy to <deck>/CLAUDE.md. Written once by /deck-init, after it has asked for the
     audience and the time budget. Based on templates/project-claude.md: same Verification
     shape, and the Planning section is that file's fixed text, word for word. Do not
     reword it per deck.

     This file holds the per-deck facts. The rules for writing chapters, slides, budgets
     and the final check live in ~/.claude/guidelines/presentation.md, once, for every
     deck; do not copy them in here. Keep it under a page: it loads on every session.

     This file is named deck-claude.md, not CLAUDE.md, on purpose: Claude Code loads a
     nested CLAUDE.md into any ~/.claude session that reads files beside it.

     Body placeholders after this block is deleted: <deck-title>, <audience>,
     <minutes>, and <budgets>.
-->

# Working in <deck-title>

An offline HTML presentation for <audience>, <minutes> minutes long. Follow
`~/.claude/guidelines/presentation.md` for every chapter, slide, budget and final-check task.
It overrides `~/.claude/guidelines/frontend.md`.

## Verification

**After implementing anything, run `just verify`.** It is the single entrypoint
that runs every check.

Do not report work as done until `just verify` exits zero. If a check fails for
a reason unrelated to your change, say so explicitly rather than removing the
check.

Run `just` with no arguments to see every recipe. The ones you will need most:

| Command | Purpose |
| --- | --- |
| `just verify` | Full verification. The entrypoint. |
| `just build [<N>min]` | Build `build/index.html`, or one time budget into `build/<N>min/`. |
| `just export [<N>min]` | Build, then export the PDF next to it. |
| `just check --complete` | The final check: also fails on any chapter not written yet. |

## This deck

- Storyline, audience and chapter order: `docs/roadmap.md`.
- Branding: `docs/brand.md` and the `--brand-*` tokens in `css/style.css`.
  `.branding-resources/` is the raw source; it is gitignored, so do not reread it per task.
- Time budgets: <budgets>. Each is an overlay in `budgets/<N>min/` on top of the base deck.

## Things that will trip you up

- `docs/<topic>.md` is the source of truth. Changing it makes `slides/<topic>.html` stale, and
  `just verify` fails until the slides are updated and their
  `<!-- source: docs/<topic>.md sha256:… -->` header carries the md's new hash
  (`shasum -a 256 docs/<topic>.md`).
- Chapter order comes from the `## Chapters` list in `docs/roadmap.md`, not from file names.
  A chunk the roadmap does not list is never built.
- The authored HTML of a slide is its final state, and that is what the PDF prints. Start
  states come from CSS under `html.deck--live` and from `init`, never from `enter`.
- A budget never edits a base chunk. It drops slides by id, or overrides a chunk with a
  trimmed copy in `budgets/<N>min/slides/`.
- `just verify` runs the browser tests, which need `npm install` once. Nothing else may touch
  the network: no CDN, no web fonts, no remote images.
- `build/` is generated. Never edit it.

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
