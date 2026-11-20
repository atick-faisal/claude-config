# Presentation

<!-- when: the repo has `docs/roadmap.md` and `build.js` (an HTML deck) -->

This overrides `frontend.md`. A deck has a `package.json` and ships a UI, but none of
`frontend.md`'s pnpm, TypeScript, React or Astro defaults apply. The deck's own `CLAUDE.md`
holds the per-deck facts (audience, minutes, budgets, brand); this file holds the rules for
every deck.

## Stack & tooling

- **Vanilla HTML, CSS and JavaScript on the scaffold `/deck-init` copied from
  `~/.claude/templates/deck/`.** No framework, no bundler, no TypeScript, no CSS
  preprocessor. `build.js` uses Node built-ins only.
- **Playwright is the only dependency**, a devDependency pinned to an exact version, used by
  `export.js` and the browser tests. Do not add another npm package. Keep `package.json`
  CommonJS; it has no `"type": "module"`.
- **Commands.** `just verify` runs everything: the freshness check plus `node --test`, which
  includes a live browser walk of the deck and of every budget. `just build [<N>min]` and
  `just export [<N>min]` produce `build/[<N>min/]index.html` and its PDF.
  `just check --complete` is the final check.
- **The scaffold code is the deck's own copy.** That covers `build.js`, `export.js`,
  `js/deck.js` and `test/`. Change it only when a task needs it, and say so in the closing
  block. A fix made here never reaches `~/.claude/templates/deck/` or other decks on its own.

## Conventions

### Offline

- **The deck runs with no network, by construction.** `build.js` inlines everything into one
  file under a `default-src 'none'` Content-Security-Policy. It fails on any external `src`,
  `href` or `url()`.
- **Playwright is the only standing exception, and only at install time.** That means
  `npm install` once per deck, plus Chromium downloaded once per machine. Exporting and
  presenting stay offline.
- **Anything else that needs the network is asked about first, per deck.** That includes a CDN
  library, a web font, a remote image, an embed or a `fetch`. A yes is recorded in the deck's
  `CLAUDE.md`. Fonts become local `@font-face` rules on `assets/fonts/…`.

### Look

- **Light theme only.** No dark mode and no `prefers-color-scheme` styles.
- **Branding comes from `docs/brand.md` and the `--brand-*` tokens in `css/style.css`**, never
  from hard-coded colours or fonts in a chunk. Do not reread `.branding-resources/` per task;
  it was distilled once at `/deck-init`. If the brand does not cover something, ask.
- **Sizes are px on the 1920×1080 stage.** The base body text is 40px. A slide that overflows
  or clips its box fails the export, so design for the box rather than scrolling.
- **No speaker notes unless this deck asked for them.** The chapter md is the speaker's guide.

### Chapter md versus slides

- **`docs/<topic>.md` is the source of truth.** It holds the full script, everything the
  speaker says, with a reference for every claim. Write it with no thought for time; budgets
  cut later. Its starter is `~/.claude/templates/deck-starters/chapter.md`.
- **A slide shows what the audience sees, not what the speaker says.** That means one idea per
  slide, a headline that states the point, and a diagram, figure, quote or a few words. Never
  paste the script onto a slide.
- **Nothing appears on a slide that is not in its md.** If a slide needs something new, add it
  to the md first. That is the same edit that makes the chunk stale.

### Chunks

- **`slides/<topic>.html` starts with
  `<!-- source: docs/<topic>.md sha256:<hash> -->`.** Take the hash from
  `shasum -a 256 docs/<topic>.md`. The rest of the file is top-level `<section>` elements,
  one per slide, in order.
- **Every `<section>` has a unique, stable `id`**, e.g. `<topic>-<what-it-shows>`. Budgets drop
  slides by id, so once a budget names an id, do not rename it.
- **A slide's search title is its first `h1`–`h3`**, or `data-title` when there is no heading
  or it would read badly in a list.
- **Local paths are relative to the deck root** (`assets/figure.png`), so the chunk works
  unchanged when copied into a budget. Do not put `<script>` in a chunk; behaviour lives in
  `js/interactions/`.

### Interactions

- **The authored markup is the slide's final, fully built state, and that is what the PDF
  prints.** Print and export run with JavaScript off.
- **Prefer `build-steps`.** Use `data-interactive="build-steps"` on the slide and
  `data-reveal` on each part. Parts that share a `data-reveal` value appear together. Check
  `js/interactions/` for an existing interaction before writing a new one.
- **A new interaction is `js/interactions/<name>.js`, named for what it does, not for a
  chapter.** It calls `Deck.register('<name>', { init, enter, leave, step })`. A slide opts in
  with `data-interactive="<name>"`. Use the same dual export as `build-steps.js`, so its logic
  can get a `node --test`.
- **The hook rules:**
  - `init` sets any JavaScript-drawn start state, once, for every slide at startup.
  - `enter` never changes what is visible.
  - `leave` resets the slide, after it is hidden.
  - `step(slide, ±1, { instant })` returns `true` while it consumed the press and `false` when
    there is nothing left. It must reach `false`. With `instant`, it changes state with no
    animation.
- **Live-only styling goes under `html.deck--live`.** Unrevealed parts are hidden by CSS by
  default; JavaScript only reveals them. Turn transitions off under
  `prefers-reduced-motion: reduce`.

### Running each row

Each row is an ordinary `/implement` task. The approval gates are in the row's Notes.

- **A `-md` row.** Read the chapter's entry in `docs/roadmap.md` (its role and minutes). Copy
  the chapter starter and delete its template block. Write `docs/<topic>.md` in full. Do not
  touch `slides/`. Verify stays green with a "no slides yet" warning. The human approves and
  commits the md before the `-slides` row starts.
- **A `-slides` row.** Its `-md` row must be approved and committed first. Read the md and
  `docs/brand.md`, then write `slides/<topic>.html` with its source header, plus any
  interaction. `just verify` walks every slide in a real browser and catches overflow,
  console errors and reveal flashes. If the md has to change, update it and the chunk in the
  same task.
- **A budget row (`<N>min`).** Start it only once the base is done and `just check --complete`
  is green. Copy `~/.claude/templates/deck-starters/budget.md` to `budgets/<N>min/budget.md`
  and fill in the minutes per chapter. To cut a whole slide, add its id to `## Drop`. To
  shorten one, copy its chunk to `budgets/<N>min/slides/<topic>.html` and trim it there; the
  copy keeps the base's source header. Never edit a base chunk or md to fit a budget. Finish
  with `just export <N>min`.
- **The final-check row.** Run `just check --complete`, then `just export` and the export for
  every budget. Read the deck end to end against `docs/roadmap.md` and check:
  - the story flows, and each chapter delivers the role and takeaway the roadmap gave it;
  - terms, numbers, names and brand use are consistent across chapters;
  - every fact and reference is correct, every slide matches its md, and every claim's source
    appears in the md;
  - each budget still tells a whole story.

  Fix small slips in this row, and change the md and the chunk together when you do. Report
  anything that changes the story to the human instead of fixing it. The deck is done when
  nothing is left open and all of the above is green.

## Things that will trip you up

- **A fresh deck's `just verify` is red until `/deck-roadmap` writes `docs/roadmap.md`.** That
  is expected.
- **Any edit to a chapter md makes its chunk stale**, and the budget copies of that chunk as
  well. Verify stays red until each chunk's source header carries the md's new hash, so
  re-hash after the last md edit, not the first.
- **Hidden slides are `display: none` in live mode, so `init` cannot measure layout.**
  Measurements read zero there. Use the stage's fixed px, or measure in `enter`, where reading
  is fine as long as nothing visible changes.
- **Setting a start state in `enter` brings back the flash** that this contract exists to
  prevent: the finished slide shows for a frame, then its parts vanish. Set it in CSS or `init`.
- **A dropped id that matches no slide fails the budget build.** Renaming a section's id breaks
  every budget that names it.
- **Chapter order comes from the `## Chapters` list in the roadmap, not from file names.** A
  chunk the roadmap does not list is never built.
- **`build/` is generated.** Never edit it.
