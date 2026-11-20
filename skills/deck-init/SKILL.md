---
description: Start an HTML deck in this repo — copy the scaffold from templates/deck/, write the deck CLAUDE.md and docs/goal.md, distill .branding-resources/ into docs/brand.md and the --brand-* tokens, then npm install once the Playwright exception is confirmed.
argument-hint: "[deck title, audience, minutes, shorter budgets, or a branding guide path]"
disable-model-invocation: true
---

# Start a deck

`$ARGUMENTS` is whatever the human said about the deck, in their own words: a title, who it is
for, how long it runs, shorter versions they will need, or where a branding guide lives. Any of it
may be absent.

This skill turns an empty repo into a deck that `/deck-roadmap` can pick up. It copies the
scaffold, writes three per-deck files and the brand tokens, and installs Playwright. It writes no
slides, no chapters and no roadmap. The rules for those live in
`~/.claude/guidelines/presentation.md`; read it once before you start, so the files you write
here agree with it.

## This is a protocol across turns, not a script

Read the whole file, then execute **one turn at a time**. Each **STOP** means: end your turn, say
nothing further, wait for the human.

```
Turn 1  resolve root → survey → ask for anything missing → STOP
        (nothing missing) copy scaffold → CLAUDE.md, docs/goal.md → brand → report
        → ask about the Playwright exception → STOP
Turn 2  yes → npm install + Chromium → just verify → report → STOP (suggest /deck-roadmap)
```

If Turn 1's survey finds nothing missing, it goes straight on to the writes. Everything written
lands in a repo that held no deck a minute ago, so a correction is a cheap edit. The stops are
for facts only the human has and for the network. They are not there to approve a plan.

---

## Turn 1 — survey, ask, write

### Resolve the deck root

Run `git rev-parse --show-toplevel`.

- **It fails: not a git repo.** A deck is its own git repo, because the commit guard and
  `docs/features/` work per repo. Say so, offer `git init` here, and **STOP**. Never init it
  yourself.
- **The root is `~/.claude`: refuse.** The scaffold lives there and the repo is public. Brand
  material must never enter it.

### Survey

Every check is independent. A check that cannot be answered is a reported line, not a reason to
stop.

| Check | How | What it decides |
| --- | --- | --- |
| Already a deck | `build.js` and `docs/roadmap.md` both exist | yes → say so, write nothing, **STOP** |
| Collisions | each scaffold path (see Copy), `CLAUDE.md`, `docs/brand.md` | any exists → list them, **STOP** |
| `docs/goal.md` | exists? | present → **write-once, untouched**; absent → write it |
| Branding source | `.branding-resources/` at the root, or a guide named in `$ARGUMENTS` | neither → ask |
| Deck facts | `$ARGUMENTS` and the conversation | anything missing → ask |
| Tools | `command -v node npm just` | absent → say so; the writes still happen |

**Never overwrite or merge into a file this skill did not write.** That includes an existing
`.gitignore` or `justfile`. List every collision and let the human move them out of the way. A
deck repo usually starts out holding only `.git/`, perhaps a `README.md`, and
`.branding-resources/`. None of those collide.

### What to ask

These are the deck facts the files below need. Take each one from `$ARGUMENTS` or the
conversation when it is there. **Never guess one**, because `docs/goal.md` is immutable once
written.

- **Working title.** `/deck-roadmap` may refine it, since the roadmap's `# ` heading is what the
  build uses.
- **Audience.** Who they are and what they already know.
- **Minutes.** The base deck's time budget.
- **Shorter versions.** A list of minutes, or "none yet".
- **Purpose.** Why this talk exists, and what the audience should think or do afterwards.

**Branding.** A guide can be a file, a folder, a URL the human has already saved locally, or text
pasted into the chat. If there is no `.branding-resources/` and no guide, ask with the picker:

- "I'll add `.branding-resources/`" (Recommended);
- "A guide, I'll give its path";
- "No brand: keep the scaffold's neutral defaults".

The last option is the human's call to make. Never take it silently.

Ask each fact you can offer options for, such as minutes or shorter versions, with the
`AskUserQuestion` picker. Free text like the audience goes in a short numbered **Needs your
input** list. Ask everything in one go, then **STOP**.

### Copy the scaffold

Copy the files git sees under `~/.claude/templates/deck/`, keeping their paths relative to that
directory:

```bash
git -C ~/.claude ls-files -z --cached --others --exclude-standard -- templates/deck |
  while IFS= read -r -d '' f; do
    rel=${f#templates/deck/}
    mkdir -p "$(dirname "$rel")" && cp ~/.claude/"$f" "$rel"
  done
```

Run it from the deck root. Using `ls-files` skips any `node_modules/` or `build/` left in the
scaffold from testing, because its own `.gitignore` names both. The scaffold has no
placeholders, so this is a plain `cp`, unlike the starters below.

**Copy before reading any brand material.** The scaffold's `.gitignore` is what keeps
`.branding-resources/` out of git.

### Write the per-deck files

Follow the template rules in `skills/feature-plan/SKILL.md`:

- read the starter from `~/.claude/templates/`;
- Write the destination with the `<!-- TEMPLATE … -->` block removed;
- replace every `<angle-bracket>` placeholder.

Do not `cp` a starter. Each strip-block's last line lists the placeholders left in the body;
use it as your checklist.

**`CLAUDE.md`**, from `templates/deck-starters/deck-claude.md`. The placeholders are:

- `<deck-title>`;
- `<audience>`;
- `<minutes>`;
- `<budgets>`: the shorter versions as `20min, 10min`, or `none yet`.

Its Planning section is fixed text. Do not reword it.

**`docs/goal.md`**, from `templates/goal.md`, and **only if absent.** `<project-name>` is the deck
title.

- **Problem:** the purpose, in the human's words.
- **Success Criteria:** what the audience should think or do afterwards. Then the checkable
  ones:
  - the base deck fits `<minutes>` minutes;
  - each shorter version fits its own budget;
  - `just check --complete`, `just verify` and every export are green.
- **Non-Goals:** take these only from what the human said, otherwise write a `<TODO: …>`.
  Never invent one. The rules every deck shares, such as no dark theme and no speaker notes,
  already live in the guideline, so do not repeat them here. Say out loud that this section
  needs the human.
- **Constraints:**
  - the audience and the minutes;
  - offline, with Playwright the only network exception, and only at install time;
  - light theme only;
  - branding from `docs/brand.md`.

Anything you cannot ground gets a `<TODO: …>` marker, exactly as in `/project-init`.

### Distill the branding

Read all of `.branding-resources/`, or the guide:

- open PDFs with `Read`'s `pages` parameter;
- look at images;
- read CSS, text and Markdown;
- list any font files.

Then write two things that agree token for token.

**`docs/brand.md`**, from `templates/deck-starters/brand.md`.

- `<source>` names the folder or guide. `<date>` is today.
- **Every token row gets a value.** If the brand does not set a token, the row keeps the
  scaffold's default from `css/style.css`, and its Use cell says "scaffold default, brand does
  not specify".
- **A rule the brand did not state is not written.** If Do, Don't or the logo rules have no
  source, write "none stated in the source" rather than plausible advice.
- **The brand's colours must work on a light background.** That is the only theme. If its
  colours assume a dark one, or a text colour fails contrast on `--brand-background`, say so in
  the report. Do not quietly change the colour.

**`css/style.css`.** Edit only the `--brand-*` declarations in its first `:root` block, so they
hold the same values as the table.

- **Fonts are local.** Copy the font files into `assets/fonts/`. Add one `@font-face` rule per
  file above that `:root` block, using `url('assets/fonts/<file>')`. `build.js` inlines them.
  Brand fonts that ship no files fall back to the scaffold's system stack. Say so in the report.
- **Logos** go into `assets/`, and are named in brand.md's Logo section. With no logo, that
  section says "none provided".

These copies into `assets/` will be committed with the deck, unlike `.branding-resources/`. Say
so in the report, since the originals may belong to a client.

**No brand, by the human's choice.** `docs/brand.md` lists the scaffold defaults with
`<source>` set to "no brand: scaffold defaults", and `css/style.css` is left alone.

### Check and report

1. **Check the copy.** Run `node --test test/build.test.js test/deck.test.js`. These are the
   scaffold's Node-only tests, so they need no `npm install` and no roadmap. If they fail, the
   copy is broken: report the output verbatim and **STOP**.
2. **Report:**
   - the files written;
   - the brand tokens as a table;
   - any `<TODO: …>` left in `goal.md`;
   - every brand caveat from above.
3. **Ask with the picker** whether to run the install now. It is the deck's one network
   exception:
   - "Run npm install now" (Recommended): runs `npm install`, plus Playwright's Chromium, which
     downloads once per machine;
   - "Not now".

**STOP.**

---

## Turn 2 — install, after a yes

On "Not now", say that `just verify` cannot run the browser tests or the export until the human
runs `npm install` and `npx playwright install chromium` themselves. Then **STOP**.

On yes, from the deck root:

1. `npm install`
2. `npx playwright install chromium`. The `playwright` package does not always fetch its browser
   on install. This command does nothing if the pinned Chromium is already cached.
3. `just verify`. **On a fresh deck, it is expected to fail only in `check`, with
   "docs/roadmap.md is missing".** `test` should pass, and the deck's own browser walk is
   skipped until a roadmap exists. If anything else fails, report it verbatim. Do not repair the
   scaffold here; that is a `~/.claude` task.

### Report

End with the closing block (`CLAUDE.md`, "How I like answers"). In plain words, the Summary
says:

- what was copied and written;
- which brand source was used, and anything it left unspecified;
- whether the install ran;
- that verify's only red is the missing roadmap.

Put any `<TODO: …>` in `goal.md` to the human as a closing question.

The writes are the human's to commit. A fresh deck has no `docs/features/*/tasks.md` yet, so the
commit guard does not apply to this first commit.

**STOP**, and suggest `/deck-roadmap`. Suggest it; never invoke it.

---

## Guardrails

- **Never overwrite, merge into or delete a file this skill did not write.** That includes an
  existing `docs/goal.md`, which is write-once.
- **Never guess a deck fact or a brand rule.** Ask, or write a `<TODO: …>` or "none stated in
  the source".
- **No network except the confirmed install**, and nothing installed beyond `package.json` and
  Playwright's Chromium.
- **Brand material stays in the deck.** Never copy any of it into `~/.claude`, and never edit
  the scaffold or the starters from here.
- **Never write `docs/roadmap.md`, `docs/features/`, `docs/<topic>.md` or `slides/`.**
  `/deck-roadmap` and the task rows own those.
- **Never `git init`, stage or commit**, and never chain into `/deck-roadmap`.
- **Every strip-block deleted, every placeholder filled**, except `goal.md`'s deliberate
  `<TODO: …>` markers. Check before you finish the turn.
