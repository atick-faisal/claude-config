---
slug: deck-workflow
title: HTML presentation (deck) workflow
status: in-progress
created: 2026-11-20
---

# HTML presentation (deck) workflow

## Summary

The human builds a lot of HTML presentations ("decks") with Claude. Today every deck starts with the
same long briefing: 16:9 full-screen slides, keyboard control, a fullscreen mode, a subtle progress
bar, jump-to-slide, PDF export showing every slide's final state, offline only, light theme only,
branding taken from `.branding-resources/`, and Markdown chapters as the source of truth with one
HTML chunk per chapter. This feature turns that briefing into a reusable skillset, so a new deck
starts from a working scaffold and a known workflow instead of a re-explanation.

The workflow it standardises:

1. **Roadmap.** Ask about the audience, the time budget and the story. Write `docs/roadmap.md`, the
   high-level storyline with references. Nothing else starts until the human accepts it.
2. **Branding.** Use `.branding-resources/` or a guide the human provides. If neither exists, stop
   and ask.
3. **Per chapter, two steps, each approved and committed separately.** First `docs/<topic>.md`, the
   full speaker's guide with no thought for time. Then `slides/<topic>.html` plus any interaction
   JS. The human triggers each chapter.
4. **Time budget.** Once all chapters exist ("base slides done"), cut the less important content
   into a separate version per time budget, leaving the base intact.
5. **Final check.** Go through the deck end to end for consistency, story flow, and correctness of
   facts and references. Once it passes, the deck is done.

The generic `/feature-plan`, `/implement` and `/commit-task` stay untouched. The presentation
behaviour lives in new skills, a scaffold, a guideline and the deck's own `CLAUDE.md`.

## Tech Stack / Approach

Everything is built in `~/.claude`. Deck repos only receive what the new skills write into them.

**Deck layout (what a deck repo looks like).** This is the human's layout with three additions:

- `slides/`, which the original tree left implicit;
- `budgets/`, for the time-budgeted versions (Q4);
- `package.json`, for the Playwright export (Q5).

```
<deck>/
  build.js              slides/*.html + css + js + assets -> one self-contained build/index.html
  export.js             build/index.html -> build/index.pdf, one 16:9 page per slide (Playwright)
  package.json          playwright as the only devDependency
  justfile              build [budget], export [budget], verify
  CLAUDE.md             per-deck facts; points at ~/.claude/guidelines/presentation.md
  docs/roadmap.md       storyline, audience, time budget, chapter order
  docs/brand.md         branding distilled once at /deck-init
  docs/<topic>.md       one speaker's guide per chapter (source of truth)
  slides/<topic>.html   one HTML chunk per docs/<topic>.md
  css/style.css         shared styling; --brand-* tokens
  js/deck.js            the runtime (from the scaffold)
  js/interactions/      named, reusable interaction/animation code (Q11)
  assets/               images
  budgets/<N>min/       budget.md, drop list, trimmed chunk overrides
  test/                 node --test suites for build and export
  .branding-resources/  (gitignored)
  build/                (gitignored)
```

**The scaffold** ships as `templates/deck/`. `/deck-init` copies it into each deck (Q1). It is
written from the requirements in this plan. The human's work-in-progress deck,
"The Geometry of Meaning" in `~/presentation-example.zip`, is a **reference, not a requirement**
(Q2). These patterns from it are worth adopting:

- `build.js` inlines everything into one file. A strict Content-Security-Policy
  (`default-src 'none'`, `data:` only) makes the deck offline by construction, not just by policy.
- `export.js` fails loudly, and writes nothing, when:
  - a slide overflows or clips its 1920×1080 box;
  - the page throws or logs a console error;
  - the page tries any network request;
  - the PDF doesn't have exactly one page per slide.
- The interaction hooks are `init / enter / leave / step`. Next and Previous first call
  `step(slide, ±1)`, so a clicker drives in-slide builds before it moves to the next slide.
- One reusable `build-steps` reveal is used on 33 of the example's slides.
- `node --test` suites cover build, the runtime and export.

The pieces of the scaffold:

- **`js/deck.js`, the runtime.** Vanilla JS with no dependencies. It provides:
  - a 1920×1080 stage scaled to fill the screen;
  - keyboard and clicker navigation;
  - `F` for fullscreen presentation mode;
  - a subtle progress bar;
  - type a number then Enter to jump to that slide;
  - `/` for built-in fuzzy search over slide titles (Q8);
  - a print mode for the PDF, which runs no JS: the authored markup is the final state (Q10);
  - an interaction registry, `Deck.register(name, { init, enter, leave, step })`. In live mode,
    `html.deck--live` CSS hides unrevealed parts by default and JS only adds `.is-revealed`. `enter`
    never changes what is visible, and resets happen on `leave`. This removes the example deck's
    flash of full content when switching slides (Q10).
- **`css/style.css`.** The structural base (stage, light theme, a 16:9 `@page` for print) plus a
  `--brand-*` token block that `/deck-init` fills in from the distilled branding (Q7).
- **`build.js`.** Node built-ins only. It produces a single self-contained `build/index.html` (Q9).
  `build.js <budget>` applies `budgets/<N>min/` on top of the base and writes
  `build/<N>min/index.html` (Q4).
- **`export.js`.** Uses Playwright and its bundled Chromium (Q5). This is the one approved network
  exception, and it only applies at install time. Chromium downloads once per machine into
  Playwright's shared cache. `npm install` runs once per deck. Exporting itself runs offline.
- **Starter files.**
  - `justfile`;
  - the deck `CLAUDE.md`, based on `templates/project-claude.md`;
  - `.gitignore` covering `build/`, `node_modules/` and `.branding-resources/`;
  - starter `docs/roadmap.md`, `docs/<topic>.md` and `budgets/<N>min/budget.md`.

**Skills** (Q3). Each has `disable-model-invocation: true` and chains into nothing. They follow
the `skills/runbook/SKILL.md` precedent: instantiate into the target repo and write no project code.

- **`/deck-init`**
  - Copies the scaffold.
  - Asks for the audience and the time budget if they weren't stated.
  - Writes the deck's `CLAUDE.md` and `docs/goal.md` (purpose, audience, time budget, non-goals).
  - **Branding:** distills `.branding-resources/` into `docs/brand.md` and the `--brand-*` tokens,
    which the human reviews once (Q7). It stops and asks if `.branding-resources/` is missing and
    no guide was given.
- **`/deck-roadmap`**
  - Holds the careful storyline interview and writes `docs/roadmap.md`.
  - Once the human accepts the roadmap, it writes `docs/features/<deck>/plan.md` and `tasks.md`
    from `templates/`. The task rows are:
    - `-md` and `-slides` per chapter, where each `-slides` row is blocked on its `-md` row being
      approved;
    - one row per time budget;
    - the final-check row.
  - The human then loops `/implement <ID>` and `/commit-task` exactly as in any other repo. The
    human approval gates live in the row Notes, not in a changed `/implement`.

**Guideline** (Q6).

- `guidelines/presentation.md` is filled in like `guidelines/research.md`. It covers:
  - stack and conventions;
  - what goes in a chapter md versus on a slide;
  - the interaction contract;
  - offline rules (Playwright is the only standing exception, and anything else is asked about
    first);
  - light theme only, and no speaker notes unless asked;
  - how to do a time-budget row and a final-check row.
- It explicitly overrides `guidelines/frontend.md`'s pnpm/TS/React default.
- It gets one row in the Guidelines table in `CLAUDE.md`. The trigger is "the repo has
  `docs/roadmap.md` and `build.js`", so `frontend.md` doesn't match a deck by mistake.
- The deck's own `CLAUDE.md` points at it and holds the per-deck facts. That file is what
  `/implement` actually loads.

**Verification.**

- **The deck's `just verify`** runs `node --test`, then checks that:
  - the build succeeds;
  - every `docs/<topic>.md` listed in the roadmap has a matching `slides/<topic>.html`;
  - each chunk is fresh. A chunk records `<!-- source: docs/<topic>.md sha256:… -->`, and verify
    fails when the md has changed since the chunk was written. This enforces "if the md changes,
    the slides must be updated."
- **`~/.claude`'s own `justfile`** gains a `node` recipe in `verify`. It runs `node --check` over
  `templates/deck/**/*.js` and the scaffold's own build tests in a temp dir.

**Reused:**

- `templates/plan.md` and `templates/tasks.md` for the deck's feature docs;
- `templates/project-claude.md` as the base of the deck `CLAUDE.md`;
- `templates/justfile`'s shape;
- the instantiate/.gitignore pattern from `skills/runbook/SKILL.md`;
- the bundled-assets layout of `skills/diagram-design/`;
- the shipping order of `docs/features/runbook-bundle/`.

**Build contract.**

- `docs/roadmap.md` has a `## Chapters` section; its first ordered list sets the chapter order,
  one `[Title](<topic>.md)` link per item. Its `# ` heading is the deck's `<title>`. The starter
  roadmap (-07) and `/deck-roadmap` (-10) write this exact shape.
- A listed chapter with no `slides/<topic>.html` yet is skipped with a warning, so verify stays
  green between a chapter's `-md` and `-slides` rows. The check fails only on a chunk without its
  md or a stale chunk; `--complete`, run by the final-check row, also fails on any missing chapter.
- Local `src`, `href` and CSS `url()` resolve against the deck root, so a chunk copied into
  `budgets/<N>min/slides/` needs no edits. External URLs and paths outside the root fail the build.

**Runtime contract.**

- Slides are the `main.deck > section` elements. `deck.js` defines `window.Deck` immediately and boots
  on `DOMContentLoaded`, because the interaction files are bundled after it in the same `<script>`.
- `build.js`'s shell sets `html.deck--live` from a one-line script in `<head>`. The runtime's
  `<script>` sits at the end of a multi-MB body, and Chrome can paint the stacked slides before it runs.
- Every live-only style hangs off `html.deck--live`, so the PDF is the page with JavaScript off.
  `export.js` (-06) loads it that way, because `init` sets start states.
- `deck.js` keeps its pure logic (key map, number-jump buffer, scale maths, step-before-advance)
  free of the DOM, so `test/deck.test.js` can cover it. `~/.claude`'s `node` recipe runs that test too.

## Open Questions

### Q12: What does a slide with builds show when you navigate back into it?

- [x] Its finished state (recommended): while the slide is still hidden, `deck.js` calls `step(+1)` until it returns false, with transitions off, and then shows it. This matches PowerPoint and reveal.js, and no hook changes.
- [ ] Its start state: reset on `leave` and nothing more. This is simpler, but re-showing a point means clicking through the build again, live.

## Resolved

### Q10: How does an interactive or animated slide show its final state in the PDF?

- [ ] Static markup is the final state, start state applied on `enter` — the example deck's current approach. **Rejected by the human: the full content flashes before it disappears when switching slides.** Root cause, found in the example: `init` leaves every slide fully built, and `enter` adds `.is-pending` only once the slide is already becoming visible. `[data-reveal]` has an opacity transition, so the parts visibly fade *out* while the slide fades in.
- [x] Static markup is the final state, live start state driven by CSS (recommended) — the authored HTML is still the fully built slide, so print and no-JS views are correct by construction. In live mode, `html.deck--live [data-reveal]:not(.is-revealed) { opacity: 0 }` hides unrevealed parts *by default*, before any slide is ever shown, and JS only adds `.is-revealed` step by step. Resetting a slide happens on `leave`, after it is hidden. Contract rule: `enter` never changes what is visible. Custom JS-drawn interactions set their start state in `init`, at startup, for every slide. A scaffold test asserts that no `[data-reveal]` part is visible on the frame a slide becomes current.
- [ ] A `final()` hook per slide — the slide is authored in its start state and print mode calls every `final()`. No flash and natural for animations, but a missing or buggy `final()` silently ships an incomplete PDF page.

### Q11: How is interaction JS organized?

- [x] Named, reusable interactions (recommended) — `js/interactions/<name>.js` registers `Deck.register('<name>', hooks)`, and a slide opts in with `data-interactive="<name>"`. Shared builds like `build-steps` are written once and reused (33 slides in the example). The scaffold ships `build-steps` as the first one.
- [ ] One JS file per chapter (`js/<topic>.js`), as in the original layout sketch — mirrors the md ↔ chunk pairing, but the same reveal logic gets copied from chapter to chapter.

### Q1: How does the runtime/build/export code reach each deck?

- [x] Copy a scaffold from `templates/deck/` into each deck via `/deck-init` (recommended) — each deck is self-contained, offline and portable, and a finished deck never breaks when the scaffold changes. Cost: copies drift, so a scaffold fix has to be re-applied to older decks by hand.
- [ ] Shared library referenced by path from `~/.claude` — one fix updates every deck, but decks break when moved to another machine and builds stop being reproducible.
- [ ] Local npm package (`npm link` / file dependency) — versioned sharing, but adds packaging work and is close to the "no distribution" Non-Goal for little gain over copying.

### Q2: Where does the scaffold's runtime come from?

- [ ] Extract it from an existing deck of yours that you like (recommended) — it keeps the keyboard map, look and feel you already use. Needs the path to that deck.
- [ ] Write it fresh from the requirements above — no input needed, but it invents conventions you may then correct deck by deck.
- [x] Write it from the requirements, using the WIP deck in `~/presentation-example.zip` as a reference, not a requirement — the human's answer: the process is still being figured out, and suggestions are welcome. Patterns worth keeping are listed under Approach.

### Q3: Which commands do you type, and which steps are /implement task rows?

- [x] `/deck-init` + `/deck-roadmap` as skills; chapter md, chapter slides, time budget and final check are task rows run through `/implement` (recommended) — matches your "two implement invocations per chapter, then commit" and reuses the generic skills untouched. The guideline carries the per-step rules.
- [ ] One skill per phase (`/deck-init`, `/deck-roadmap`, `/deck-chapter`, `/deck-slides`, `/deck-budget`, `/deck-review`) — each phase is explicit and tailored, but it is a parallel workflow next to `/implement` and `/commit-task`, with six skills to maintain.
- [ ] Guideline + scaffold only; use `/feature-plan` for the roadmap — fewest new files, but `/feature-plan`'s explorer and 4-turn protocol are built for code changes, not storyline interviews.

### Q4: How are time-budgeted versions stored?

- [x] An overlay per budget (recommended) — `budgets/<minutes>min/budget.md` holds the minutes per chapter, what was cut and why, plus a drop list of slide ids. `budgets/<minutes>min/slides/<topic>.html` overrides only the chunks whose content was trimmed. `just build 20min` → `build/20min/index.html` (+ PDF). The base stays the source of truth, and unchanged chunks are shared.
- [ ] Full copy of `slides/` per budget — simplest to reason about, but every chunk is duplicated and drifts from the base when an md changes.
- [ ] `data-budget="cut-20"` attributes inside the base chunks — no duplication, but it can only drop slides or elements, not rewrite a slide shorter, and it clutters the base.
- [ ] A git branch per budget — isolated, but the versions can't be built side by side and merges from the base get painful.

### Q5: Which tool exports the PDF?

- [ ] Headless Google Chrome from the command line (`--headless --print-to-pdf` on `index.html?print`), driven by `export.js` (recommended) — Chrome is installed on this Mac, nothing needs to be downloaded, and the deck stays fully offline with zero npm dependencies. Cost: less control over waiting for fonts/animations (`--virtual-time-budget` covers it).
- [ ] `puppeteer-core` driving the installed Chrome — finer control (wait for fonts, call `final()` explicitly, screenshot fallback), but needs one `npm install` with network access per deck.
- [x] Playwright with its own downloaded Chromium — most robust, but it's a large download and a network exception on every deck. The human's pick. The Chromium download lands in Playwright's shared per-machine cache, so in practice the cost is one browser download per machine plus `npm install` per deck. This is the deck's one standing network exception, and it only applies at install time.

### Q6: Where do the deck-wide rules live?

- [x] Both: `guidelines/presentation.md` holds the rules, and the deck `CLAUDE.md` points at it with the per-deck facts (audience, budget, brand) (recommended) — one place to improve the rules, and `/implement` is guaranteed to see them through the auto-loaded `CLAUDE.md`.
- [ ] Only the scaffold's deck `CLAUDE.md` — fully self-contained, but rule improvements never reach existing decks and are copied N times.
- [ ] Only the guideline + global table row — no per-deck file, but relies on the table trigger firing and gives no place for per-deck facts.

### Q7: How is branding applied?

- [x] Distill once at `/deck-init` into the `--brand-*` tokens in `css/style.css` plus a short `docs/brand.md` (fonts, colours, logo use, do/don't) (recommended) — every chapter reads one small, consistent source. You review the distilled version once.
- [ ] Read `.branding-resources/` fresh on every slides task — always matches the source, but costs context every time and different chapters may interpret it differently.

### Q8: Is the fuzzy slide search in the first version?

- [x] Yes, a small built-in subsequence match over slide titles on `/` (recommended) — about 50 lines with no library, and useful for long decks during Q&A.
- [ ] No, number jump only for now — less code, and fuzzy search can be added later to the scaffold.

### Q9: What does `build/index.html` look like?

- [x] A single self-contained file with CSS, JS and images inlined (recommended) — opens anywhere offline and can be handed over or emailed as one file. Cost: larger file, and images are base64.
- [ ] `index.html` next to copied `css/`, `js/` and `assets/` folders in `build/` — smaller, easier to debug, but it is a folder, not a file, to share.

## Out of Scope

- Changes to `/feature-plan`, `/implement`, `/commit-task` or `/project-init`. Presentation behaviour layers on top.
- Dark theme.
- Speaker notes, unless a specific deck asks for them.
- CDN fonts, libraries or any network dependency other than the Playwright install. Further exceptions are asked per deck.
- Claude artifacts as the deck's home. Decks live in local files.
- PowerPoint/Keynote export.
- Publishing the scaffold as a package or sharing it beyond this machine (`docs/goal.md` Non-Goal: no distribution).
- Client or brand content in `~/.claude`. The repo is public, so brand material stays in each deck's gitignored `.branding-resources/`, and nothing from the example deck's brand assets is copied into the scaffold.
- More than one deck per repo. A deck is its own git repo, since the commit guard and `docs/features/` are per repo.
- Back-porting scaffold fixes to existing decks automatically (a consequence of Q1).
