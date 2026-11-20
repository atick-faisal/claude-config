'use strict';
// Browser tests: they need Playwright and its Chromium (`npm install`), so they run in the
// deck's own `just verify`, not in ~/.claude's.
//
// Two subjects, each against a small fixture deck and against THIS deck's own build:
// - export.js: the PDF, and every reason it refuses to write one;
// - the live runtime, JavaScript on: a walk through every slide, forward and back, that fails
//   on any console or page error and holds the no-flash rule on the frame a slide appears.

const { test, describe, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { build, listBudgets, BuildError } = require('../build.js');
const { exportPdf, launchBrowser, countPdfPages } = require('../export.js');

const DECK = path.join(__dirname, '..');
const SCAFFOLD_FILES = ['css/style.css', 'js/deck.js', 'js/interactions/build-steps.js'];

const ROADMAP = '# Fixture Deck\n\n## Chapters\n\n1. [Opening](opening.md)\n2. [Middle](middle.md)\n';
const OPENING = '<section id="opening-1"><h1>Opening</h1></section>\n';
const MIDDLE = [
  '<section id="middle-1" data-interactive="build-steps">',
  '  <h2>Builds</h2>',
  '  <ul><li data-reveal>First</li><li data-reveal="pair">Second</li><li data-reveal="pair">Also second</li></ul>',
  '</section>',
  '<section id="middle-2"><h2>Closing</h2></section>',
  '',
].join('\n');

let browser;
const tempDirs = [];

before(async () => {
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
});
afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A fixture deck on the real stylesheet, runtime and build-steps; `files` adds or replaces. */
function makeDeck(files = {}) {
  const root = tempDir('deck-browser-');
  const all = {
    'docs/roadmap.md': ROADMAP,
    'slides/opening.html': OPENING,
    'slides/middle.html': MIDDLE,
    ...files,
  };
  for (const rel of SCAFFOLD_FILES) all[rel] ??= fs.readFileSync(path.join(DECK, rel));
  for (const [rel, content] of Object.entries(all)) {
    const file = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

/** Build a fixture deck, then let `edit` rewrite its html, e.g. to add what build.js refuses. */
function builtDeck(files = {}, edit = (html) => html) {
  const root = makeDeck(files);
  const { outFile } = build({ root, warn: () => {} });
  fs.writeFileSync(outFile, edit(fs.readFileSync(outFile, 'utf8')));
  return root;
}

/** Export, expecting failure; returns the error list. */
async function exportErrors(options) {
  try {
    await exportPdf({ browser, ...options });
  } catch (err) {
    assert.ok(err instanceof BuildError, `expected a BuildError, got ${err}`);
    return err.errors;
  }
  assert.fail('expected the export to fail');
}

function assertSomeMatch(list, re) {
  assert.ok(list.some((m) => re.test(m)), `no message matches ${re}:\n  ${list.join('\n  ')}`);
}

/** Add `extra` to the end of the slide with this id, in the built html. */
const intoSlide = (id, extra) => (html) => html.replace(new RegExp(`(<section id="${id}"[^]*?)</section>`), `$1${extra}</section>`);

// ---------------------------------------------------------------------------
// The live walk
// ---------------------------------------------------------------------------

/**
 * Runs in the page before any of its scripts. Each time a slide becomes current, record its
 * [data-reveal] parts as the first frame will paint them: the observer fires in the microtask
 * right after the key handler, after enter() and leave(), before the browser paints.
 */
function recordEntries() {
  window.__deckEntries = [];
  new MutationObserver((records) => {
    for (const { target, oldValue } of records) {
      if (!target.matches('main.deck > section') || !target.classList.contains('is-current')) continue;
      if ((oldValue ?? '').split(/\s+/).includes('is-current')) continue;
      window.__deckEntries.push({
        index: [...target.parentElement.children].indexOf(target),
        parts: [...target.querySelectorAll('[data-reveal]')].map((part) => {
          const style = getComputedStyle(part);
          return {
            hidden: style.visibility === 'hidden' || Number(style.opacity) === 0,
            shown: style.visibility === 'visible' && Number(style.opacity) === 1,
            animating: part.getAnimations().length > 0,
          };
        }),
      });
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
}

// A step() may consume many presses; deck.js gives up on a catch-up after 500.
const MAX_PRESSES_PER_SLIDE = 500;

/**
 * Walk a built deck with JavaScript on: → through every slide and build to the last slide,
 * then ← back to the first. Returns every problem found, plus the slide order of each pass.
 */
async function walk(file) {
  const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 720 } });
  const problems = [];
  try {
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
    await page.addInitScript(recordEntries);
    await page.goto(pathToFileURL(file).href);

    const where = () =>
      page.evaluate(() => {
        const slides = [...document.querySelectorAll('main.deck > section')];
        return { count: slides.length, current: slides.findIndex((s) => s.classList.contains('is-current')) };
      });
    const takeEntries = () => page.evaluate(() => window.__deckEntries.splice(0));

    let { count, current } = await where();
    if (current === -1) {
      problems.push(count === 0 ? 'no slides' : 'the deck never showed a slide');
      return { problems, forward: [], backward: [] };
    }

    async function pressUntil(key, target) {
      let presses = 0;
      while (current !== target) {
        await page.keyboard.press(key);
        const now = (await where()).current;
        presses = now === current ? presses + 1 : 0;
        current = now;
        if (presses > MAX_PRESSES_PER_SLIDE) {
          problems.push(`slide ${current + 1}: ${MAX_PRESSES_PER_SLIDE} presses of ${key} never left it`);
          return;
        }
      }
    }

    await pressUntil('ArrowRight', count - 1);
    const forward = await takeEntries();
    await pressUntil('ArrowLeft', 0);
    const backward = await takeEntries();

    for (const { index, parts } of forward) {
      if (parts.some((p) => !p.hidden)) {
        problems.push(`slide ${index + 1}: a [data-reveal] part is visible on the frame the slide appears (going forward)`);
      }
    }
    for (const { index, parts } of backward) {
      if (parts.some((p) => !p.shown || p.animating)) {
        problems.push(`slide ${index + 1}: going back, not every [data-reveal] part is shown finished on the first frame`);
      }
    }
    return { problems, forward: forward.map((e) => e.index), backward: backward.map((e) => e.index) };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// export.js
// ---------------------------------------------------------------------------

describe('export.js', () => {
  test('prints one 1920×1080 page per slide next to the built deck', async () => {
    const root = builtDeck();
    const result = await exportPdf({ root, browser });
    assert.equal(result.outFile, path.join(root, 'build', 'index.pdf'));
    assert.equal(result.pages, 3);
    const pdf = fs.readFileSync(result.outFile);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal(countPdfPages(pdf), 3);
    // 1920×1080 CSS px is 1440×810 pt.
    assert.match(pdf.toString('latin1'), /\/MediaBox \[0 0 1440 810\]/);
  });

  test("runs with JavaScript off: an interaction's init cannot change the PDF", async () => {
    const root = builtDeck({
      'js/interactions/stretch.js': "Deck.register('stretch', { init(slide) { slide.style.height = '5000px'; } });\n",
      'slides/opening.html': '<section id="opening-1" data-interactive="stretch"><h1>Opening</h1></section>\n',
    });
    assert.equal((await exportPdf({ root, browser })).pages, 3);
  });

  test('exports a time budget from build/<N>min/', async () => {
    const root = makeDeck({ 'budgets/20min/budget.md': '# 20 minutes\n\n## Drop\n\n- `middle-2` — no time\n' });
    build({ root, budget: '20min', warn: () => {} });
    const result = await exportPdf({ root, budget: '20min', browser });
    assert.equal(result.outFile, path.join(root, 'build', '20min', 'index.pdf'));
    assert.equal(result.pages, 2);
  });

  describe('fails and writes nothing', () => {
    /** Export a deck with an old PDF in place; the old PDF must survive the failure. */
    async function failingExport(root) {
      const pdf = path.join(root, 'build', 'index.pdf');
      fs.writeFileSync(pdf, 'old');
      const errors = await exportErrors({ root });
      assert.equal(fs.readFileSync(pdf, 'utf8'), 'old');
      return errors;
    }

    test('when a slide overflows its box', async () => {
      const errors = await failingExport(builtDeck({ 'slides/opening.html': '<section id="opening-1"><div style="height: 2000px; flex: none">tall</div></section>\n' }));
      assertSomeMatch(errors, /^slide 1 \(#opening-1\) overflows its 1920×1080 box by \d+px$/);
      assertSomeMatch(errors, /^slide 1 \(#opening-1\): <div> reaches past the slide's bottom edge$/);
    });

    test('when an element clips its content', async () => {
      const clipped = '<p class="note" style="height: 40px; overflow: hidden">one<br>two<br>three</p>';
      const errors = await failingExport(builtDeck({ 'slides/opening.html': `<section id="opening-1">${clipped}</section>\n` }));
      assert.deepEqual(errors, ['slide 1 (#opening-1): <p.note> clips its content']);
    });

    test("when an element reaches past the slide's edge, naming only the outermost", async () => {
      const off = '<div id="off" style="position: absolute; left: -50px; top: 0; width: 100px; height: 100px"><span>in it</span></div>';
      const errors = await failingExport(builtDeck({ 'slides/middle.html': `<section id="middle-1">${off}</section>\n` }));
      assert.deepEqual(errors, ["slide 2 (#middle-1): <div#off> reaches past the slide's left edge"]);
    });

    test('when a slide is not 1920×1080', async () => {
      const errors = await failingExport(builtDeck({ 'slides/opening.html': '<section id="opening-1" style="height: 900px"><h1>Short</h1></section>\n' }));
      assert.deepEqual(errors, ['slide 1 (#opening-1) is 1920×900, not 1920×1080']);
    });

    test('on any network request, and the console error it causes', async () => {
      const errors = await failingExport(builtDeck({}, intoSlide('opening-1', '<img src="https://example.invalid/x.png">')));
      assertSomeMatch(errors, /^network request: https:\/\/example\.invalid\/x\.png/);
      assertSomeMatch(errors, /^console error: /);
    });

    test('when something outside the slides takes up a page', async () => {
      const errors = await failingExport(builtDeck({}, (html) => html.replace('</main>', '</main><div style="height: 200px">stray</div>')));
      assert.deepEqual(errors, ['the PDF has 4 page(s) for 3 slide(s); something outside the slides takes up a page']);
    });

    test('when the deck has no slides', async () => {
      const errors = await failingExport(builtDeck({}, (html) => html.replace(/<main class="deck">[^]*<\/main>/, '<main class="deck"></main>')));
      assertSomeMatch(errors, /^no slides/);
    });
  });

  test('asks for a build when there is none', async () => {
    const root = makeDeck();
    assert.deepEqual(await exportErrors({ root }), [
      `${path.relative(process.cwd(), path.join(root, 'build', 'index.html'))} is missing; run \`just build\` first`,
    ]);
    assertSomeMatch(await exportErrors({ root, budget: '20min' }), /run `just build 20min` first$/);
  });
});

// ---------------------------------------------------------------------------
// The live runtime
// ---------------------------------------------------------------------------

describe('live runtime', () => {
  test('walks every slide both ways with no flash and no errors', async () => {
    const root = builtDeck();
    const { problems, forward, backward } = await walk(path.join(root, 'build', 'index.html'));
    assert.deepEqual(problems, []);
    assert.deepEqual(forward, [0, 1, 2]);
    assert.deepEqual(backward, [1, 0]);
  });

  test('catches an interaction that shows its parts on enter', async () => {
    const root = builtDeck({
      'js/interactions/eager.js':
        "Deck.register('eager', { enter(slide) { slide.querySelectorAll('[data-reveal]').forEach((p) => p.classList.add('is-revealed')); } });\n",
      'slides/middle.html': MIDDLE.replace('data-interactive="build-steps"', 'data-interactive="build-steps eager"'),
    });
    const { problems } = await walk(path.join(root, 'build', 'index.html'));
    assert.deepEqual(problems, ['slide 2: a [data-reveal] part is visible on the frame the slide appears (going forward)']);
  });

  test('catches an interaction that throws', async () => {
    const root = builtDeck({
      'js/interactions/broken.js': "Deck.register('broken', { step() { throw new Error('boom'); } });\n",
      'slides/opening.html': '<section id="opening-1" data-interactive="broken"><h1>Opening</h1></section>\n',
    });
    const { problems } = await walk(path.join(root, 'build', 'index.html'));
    assertSomeMatch(problems, /^console error: deck: slide 1: step\(\) failed/);
  });
});

// ---------------------------------------------------------------------------
// This deck
// ---------------------------------------------------------------------------

describe('this deck', () => {
  // The base deck plus every time budget, each built into a temp folder so build/ is untouched.
  const versions = [null, ...listBudgets(DECK)];

  for (const budget of versions) {
    const label = budget ?? 'base';

    test(`${label}: exports and walks cleanly`, async (t) => {
      if (!fs.existsSync(path.join(DECK, 'docs', 'roadmap.md'))) return t.skip('no docs/roadmap.md yet');
      const out = tempDir('deck-own-');
      const result = build({ root: DECK, budget: budget ?? undefined, outFile: path.join(out, 'index.html'), warn: () => {} });
      if (result.chapters.length === 0) return t.skip('no slides written yet');

      await exportPdf({ inFile: result.outFile, browser });
      const { problems } = await walk(result.outFile);
      assert.deepEqual(problems, []);
    });
  }
});
