'use strict';
// Build tests: Node built-ins only. Every deck is a throwaway fixture under the OS temp dir,
// so running these never writes into the folder that holds build.js.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  build,
  check,
  sourceHeader,
  BuildError,
  CSP,
  parseRoadmap,
  parseBudget,
  dropSlides,
  escapeInlineScript,
  isExternalUrl,
} = require('../build.js');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// A 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const ROADMAP = `# The Deck

Some storyline prose with a list that is not the chapter list:

1. [Not a chapter](ignored.md)

## Chapters

1. [Opening](opening.md) — why this matters
2. [Middle part](./middle.md)
3. [Closing](closing.md)

## References

1. [Also not a chapter](refs.md)
`;

const tempDirs = [];
afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

/** Write a fixture deck. `files` maps a relative path to its content; null leaves it out. */
function makeDeck(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-build-'));
  tempDirs.push(root);
  const defaults = {
    'docs/roadmap.md': ROADMAP,
    'css/style.css': '.slide { color: black; }\n',
    'js/deck.js': 'window.Deck = { register() {} };\n',
    'slides/opening.html': '<section class="slide" id="opening-1"><h1>Opening</h1></section>\n',
    'slides/middle.html': '<section class="slide" id="middle-1"><h2>Middle</h2></section>\n',
    'slides/closing.html': '<section class="slide" id="closing-1"><h2>Closing</h2></section>\n',
  };
  for (const [rel, content] of Object.entries({ ...defaults, ...files })) {
    if (content === null) continue;
    const file = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

/** Build quietly; returns the result plus the output html. */
function buildDeck(root) {
  const result = build({ root, warn: () => {} });
  return { ...result, html: fs.readFileSync(result.outFile, 'utf8') };
}

/** Build, expecting failure; returns the error list. */
function buildErrors(root, options = {}) {
  try {
    build({ root, warn: () => {}, ...options });
  } catch (err) {
    assert.ok(err instanceof BuildError, `expected a BuildError, got ${err}`);
    return err.errors;
  }
  assert.fail('expected the build to fail');
}

function assertSomeMatch(list, re) {
  assert.ok(list.some((m) => re.test(m)), `no message matches ${re}:\n  ${list.join('\n  ')}`);
}

describe('parseRoadmap', () => {
  test('reads the title and the Chapters list in order, ignoring other lists', () => {
    const { title, chapters, errors } = parseRoadmap(ROADMAP);
    assert.deepEqual(errors, []);
    assert.equal(title, 'The Deck');
    assert.deepEqual(chapters, [
      { title: 'Opening', topic: 'opening' },
      { title: 'Middle part', topic: 'middle' },
      { title: 'Closing', topic: 'closing' },
    ]);
  });

  test('keeps a trailing # that is part of the title', () => {
    assert.equal(parseRoadmap('# Intro to C#\n\n## Chapters\n\n1. [A](a.md)\n').title, 'Intro to C#');
  });

  test('only the first ordered list in the section counts', () => {
    const text = '# T\n\n## Chapters\n\n1. [A](a.md)\n2. [B](b.md)\n\nA note.\n\n1. [C](c.md)\n';
    assert.deepEqual(parseRoadmap(text).chapters.map((c) => c.topic), ['a', 'b']);
  });

  test('indented continuation lines do not end the list', () => {
    const text = '# T\n\n## Chapters\n\n1. [A](a.md)\n   more about A\n2. [B](b.md)\n';
    assert.deepEqual(parseRoadmap(text).chapters.map((c) => c.topic), ['a', 'b']);
  });

  test('headings inside code fences are ignored', () => {
    const text = '```bash\n# not the title\n## Chapters\n1. [X](x.md)\n```\n# Real\n\n## Chapters\n\n1. [A](a.md)\n';
    const { title, chapters } = parseRoadmap(text);
    assert.equal(title, 'Real');
    assert.deepEqual(chapters.map((c) => c.topic), ['a']);
  });

  test('a ### heading inside the section does not end it', () => {
    const text = '# T\n\n## Chapters\n\n### Order\n\n1. [A](a.md)\n';
    assert.deepEqual(parseRoadmap(text).chapters.map((c) => c.topic), ['a']);
  });

  test('reports a missing title, section, list, bad link, bad topic and duplicates', () => {
    assertSomeMatch(parseRoadmap('## Chapters\n\n1. [A](a.md)\n').errors, /no "# " title/);
    assertSomeMatch(parseRoadmap('# T\n').errors, /no "## Chapters" section/);
    assertSomeMatch(parseRoadmap('# T\n\n## Chapters\n\nprose only\n').errors, /has no ordered list/);
    assertSomeMatch(parseRoadmap('# T\n\n## Chapters\n\n1. Opening\n').errors, /:5: chapter item needs a \[Title\]/);
    assertSomeMatch(parseRoadmap('# T\n\n## Chapters\n\n1. [A](My_Topic.md)\n').errors, /kebab-case/);
    assertSomeMatch(parseRoadmap('# T\n\n## Chapters\n\n1. [A](a.md)\n2. [A again](a.md)\n').errors, /listed twice/);
  });
});

describe('build', () => {
  test('joins chunks in roadmap order, not file-name order', () => {
    const { html, chapters, skipped } = buildDeck(makeDeck());
    assert.deepEqual(chapters, ['opening', 'middle', 'closing']);
    assert.deepEqual(skipped, []);
    const at = (id) => html.indexOf(`id="${id}"`);
    assert.ok(at('opening-1') < at('middle-1') && at('middle-1') < at('closing-1'));
  });

  test('writes one self-contained file with the strict CSP, title, CSS and JS inlined', () => {
    const { html, outFile } = buildDeck(makeDeck());
    assert.equal(path.basename(outFile), 'index.html');
    assert.equal(path.basename(path.dirname(outFile)), 'build');
    assert.ok(CSP.startsWith("default-src 'none'"));
    assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`));
    assert.ok(html.includes('<title>The Deck</title>'));
    assert.ok(html.includes('.slide { color: black; }'));
    assert.ok(html.includes('window.Deck = { register() {} };'));
    assert.ok(!/<link rel="stylesheet"|<script src=/.test(html), 'nothing may be loaded from outside the file');
  });

  test('switches to live mode in <head>, before any slide can paint', () => {
    const { html } = buildDeck(makeDeck());
    const live = html.indexOf("<script>document.documentElement.classList.add('deck--live')</script>");
    assert.ok(live !== -1, 'the live-mode line is missing');
    assert.ok(live > html.indexOf('Content-Security-Policy'), 'it must come after the CSP so the CSP covers it');
    assert.ok(live < html.indexOf('</head>'));
  });

  test('escapes the title for HTML', () => {
    const { html } = buildDeck(makeDeck({ 'docs/roadmap.md': '# A <b> & "c"\n\n## Chapters\n\n1. [O](opening.md)\n' }));
    assert.ok(html.includes('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>'));
  });

  test('skips an unwritten chapter with a warning instead of failing', () => {
    const root = makeDeck({ 'slides/middle.html': null });
    const messages = [];
    const result = build({ root, warn: (m) => messages.push(m) });
    assert.deepEqual(result.chapters, ['opening', 'closing']);
    assert.deepEqual(result.skipped, ['middle']);
    assertSomeMatch(messages, /"middle" has no slides\/middle\.html yet; skipped/);
  });

  test('ignores a chunk that the roadmap does not list', () => {
    const { html } = buildDeck(makeDeck({ 'slides/extra.html': '<section id="extra-1"></section>' }));
    assert.ok(!html.includes('extra-1'));
  });

  test('bundles interactions sorted by name, each in its own strict scope', () => {
    const { html } = buildDeck(
      makeDeck({
        'js/interactions/zoom.js': "const name = 'zoom';\n",
        'js/interactions/build-steps.js': "const name = 'build-steps';\n",
        'js/interactions/README.md': 'not code',
      }),
    );
    const steps = html.indexOf('// js/interactions/build-steps.js');
    const zoom = html.indexOf('// js/interactions/zoom.js');
    assert.ok(steps !== -1 && zoom !== -1 && steps < zoom);
    assert.ok(html.includes(";(() => {\n'use strict';\nconst name = 'build-steps';\n})();"));
    assert.ok(!html.includes('not code'));
  });

  test('a deck with no interactions folder still builds', () => {
    assert.doesNotThrow(() => buildDeck(makeDeck()));
  });

  test('inlines chunk images and CSS url()s, resolved from the deck root', () => {
    const { html } = buildDeck(
      makeDeck({
        'assets/dot.png': PNG,
        'assets/fonts/brand.woff2': 'font-bytes',
        'slides/opening.html': '<section id="opening-1"><img src="assets/dot.png" alt=""></section>',
        'css/style.css': "@font-face { src: url('assets/fonts/brand.woff2') format('woff2'); }\n",
      }),
    );
    assert.ok(html.includes(`src="data:image/png;base64,${PNG.toString('base64')}"`));
    assert.ok(html.includes(`url("data:font/woff2;base64,${Buffer.from('font-bytes').toString('base64')}")`));
    assert.ok(!html.includes('assets/dot.png'));
  });

  test('keeps external links, fragments and HTML comments as they are', () => {
    const chunk =
      '<!-- source: docs/opening.md sha256:abc <img src="gone.png"> -->\n' +
      '<section id="opening-1"><a href="https://example.org/paper">paper</a><a href="#closing-1">jump</a></section>';
    const { html } = buildDeck(makeDeck({ 'slides/opening.html': chunk }));
    assert.ok(html.includes('<a href="https://example.org/paper">'));
    assert.ok(html.includes('<a href="#closing-1">'));
    assert.ok(html.includes('<!-- source: docs/opening.md sha256:abc <img src="gone.png"> -->'));
  });

  test('a `$&` in a slide or script is copied literally', () => {
    const { html } = buildDeck(
      makeDeck({
        'slides/opening.html': '<section id="opening-1"><p>costs $& more</p></section>',
        'js/deck.js': "const price = '$&';\n",
      }),
    );
    assert.ok(html.includes('<p>costs $& more</p>'));
    assert.ok(html.includes("const price = '$&';"));
  });

  test('a "</script" inside the JS cannot end the inlined script block', () => {
    const { html } = buildDeck(makeDeck({ 'js/deck.js': "const end = '</script>';\n" }));
    assert.ok(html.includes("const end = '<\\/script>';"));
    assert.equal(escapeInlineScript('a</SCRIPT>b'), 'a<\\/SCRIPT>b');
  });

  test('reports every offline and path error at once, and writes nothing', () => {
    const root = makeDeck({
      'slides/opening.html':
        '<section id="opening-1">' +
        '<img src="https://cdn.example.org/x.png">' +
        '<img src="assets/missing.png">' +
        '<img src="../outside.png">' +
        '<img src="/abs.png">' +
        '<img srcset="assets/a.png 2x">' +
        '</section>',
      'css/style.css': "@import 'other.css';\nbody { background: url(//cdn.example.org/bg.png); }\n",
      'js/deck.js': null,
    });
    const errors = buildErrors(root);
    assertSomeMatch(errors, /slides\/opening\.html: external resource "https:\/\/cdn\.example\.org\/x\.png"/);
    assertSomeMatch(errors, /missing asset "assets\/missing\.png"/);
    assertSomeMatch(errors, /"\.\.\/outside\.png" .* resolves outside the deck root/);
    assertSomeMatch(errors, /absolute asset path "\/abs\.png"/);
    assertSomeMatch(errors, /srcset .* not supported/);
    assertSomeMatch(errors, /css\/style\.css: @import is not allowed/);
    assertSomeMatch(errors, /css\/style\.css: external resource "\/\/cdn\.example\.org\/bg\.png"/);
    assertSomeMatch(errors, /js\/deck\.js is missing/);
    assert.ok(!fs.existsSync(path.join(root, 'build')), 'a failed build must write nothing');
  });

  test('a failed build leaves the previous output intact', () => {
    const root = makeDeck();
    const { outFile } = buildDeck(root);
    const before = fs.readFileSync(outFile, 'utf8');
    fs.writeFileSync(path.join(root, 'slides', 'opening.html'), '<img src="assets/missing.png">');
    buildErrors(root);
    assert.equal(fs.readFileSync(outFile, 'utf8'), before);
  });

  test('reports a missing roadmap and a missing stylesheet', () => {
    const errors = buildErrors(makeDeck({ 'docs/roadmap.md': null, 'css/style.css': null }));
    assertSomeMatch(errors, /docs\/roadmap\.md is missing/);
    assertSomeMatch(errors, /css\/style\.css is missing/);
  });

  test('rejects an asset type it cannot inline', () => {
    const errors = buildErrors(
      makeDeck({ 'assets/clip.mp4': 'x', 'slides/opening.html': '<video src="assets/clip.mp4"></video>' }),
    );
    assertSomeMatch(errors, /unsupported asset type "\.mp4"/);
  });

  test('a commented-out CSS url() is neither inlined nor reported', () => {
    assert.doesNotThrow(() => buildDeck(makeDeck({ 'css/style.css': '/* url(https://x.org/a.png) */ a { color: red; }' })));
  });
});

describe('parseBudget', () => {
  const LABEL = 'budgets/20min/budget.md';

  test('reads slide ids from the first bullet list under ## Drop, backticked or bare', () => {
    const text =
      '# 20 minutes\n\n- not a drop item\n\n## Drop\n\n' +
      '- `middle-2` — the derivation; middle-1 carries it\n' +
      '* closing-3\n' +
      '  continued reason\n\n' +
      'Prose ends the list.\n\n- `later` is not dropped\n\n## Notes\n\n- `notes-1`\n';
    assert.deepEqual(parseBudget(text, LABEL), { drop: ['middle-2', 'closing-3'], errors: [] });
  });

  test('no ## Drop section drops nothing', () => {
    assert.deepEqual(parseBudget('# 20 minutes\n\n## Minutes\n\n- opening: 5\n', LABEL), { drop: [], errors: [] });
  });

  test('reports a bad slide id and a duplicate, with the line', () => {
    const { errors } = parseBudget('## Drop\n\n- "middle 2"\n- `a`\n- `a`\n', LABEL);
    assertSomeMatch(errors, /budget\.md:3: a drop item must start with a slide id/);
    assertSomeMatch(errors, /budget\.md:5: slide "a" is dropped twice/);
  });
});

test('dropSlides cuts top-level sections by id and leaves nested ones and comments alone', () => {
  const html =
    '<!-- <section id="a"> -->\n<section class="slide" id="a"><section id="inner"></section></section>\n' +
    "<section id='b'><p>keep</p></section>\n";
  const dropped = new Set();
  const errors = [];
  const out = dropSlides(html, new Set(['a', 'inner']), dropped, 'slides/x.html', errors);
  assert.deepEqual(errors, []);
  assert.deepEqual([...dropped], ['a']);
  assert.equal(out, "<!-- <section id=\"a\"> -->\n\n<section id='b'><p>keep</p></section>\n");
  dropSlides('<section id="a">', new Set(['a']), dropped, 'slides/x.html', errors);
  assertSomeMatch(errors, /slides\/x\.html: a <section> is never closed/);
});

describe('build with a time budget', () => {
  const BUDGET = '# 20 minutes\n\n## Drop\n\n- `middle-2` — too deep for 20 minutes\n- `closing-1`\n';

  /** A base deck where middle has two slides, plus a 20min overlay and any overrides. */
  function budgetDeck(files = {}) {
    return makeDeck({
      'slides/middle.html': '<section id="middle-1"><h2>Middle</h2></section>\n<section id="middle-2"><h2>Deep</h2></section>\n',
      'slides/closing.html': '<section id="closing-1"></section>\n<section id="closing-2"></section>\n',
      'budgets/20min/budget.md': BUDGET,
      ...files,
    });
  }

  test('drops listed slides and writes build/<N>min/index.html, leaving the base build alone', () => {
    const root = budgetDeck();
    const { outFile, dropped, overridden } = build({ root, budget: '20min', warn: () => {} });
    const html = fs.readFileSync(outFile, 'utf8');
    assert.equal(outFile, path.join(root, 'build', '20min', 'index.html'));
    assert.deepEqual(dropped.sort(), ['closing-1', 'middle-2']);
    assert.deepEqual(overridden, []);
    for (const id of ['opening-1', 'middle-1', 'closing-2']) assert.ok(html.includes(`id="${id}"`), id);
    for (const id of ['middle-2', 'closing-1']) assert.ok(!html.includes(`id="${id}"`), id);
    assert.ok(!fs.existsSync(path.join(root, 'build', 'index.html')), 'a budget build never writes the base output');

    const base = buildDeck(root).html;
    assert.ok(base.includes('id="middle-2"') && base.includes('id="closing-1"'), 'the base keeps every slide');
  });

  test('an override chunk replaces only its chapter, and resolves assets from the deck root', () => {
    const root = budgetDeck({
      'assets/dot.png': PNG,
      'budgets/20min/budget.md': '# 20 minutes\n',
      'budgets/20min/slides/middle.html': '<section id="middle-short"><img src="assets/dot.png" alt=""></section>\n',
    });
    const result = build({ root, budget: '20min', warn: () => {} });
    const html = fs.readFileSync(result.outFile, 'utf8');
    assert.deepEqual(result.overridden, ['middle']);
    assert.ok(html.includes('<!-- budgets/20min/slides/middle.html -->'));
    assert.ok(html.includes('id="middle-short"') && !html.includes('id="middle-1"'));
    assert.ok(html.includes('id="opening-1"') && html.includes('id="closing-2"'), 'untrimmed chunks come from the base');
    assert.ok(html.includes(`src="data:image/png;base64,${PNG.toString('base64')}"`));
  });

  test('drops apply to an override chunk too', () => {
    const root = budgetDeck({
      'budgets/20min/slides/middle.html': '<section id="middle-1"></section><section id="middle-2"></section>',
    });
    const html = fs.readFileSync(build({ root, budget: '20min', warn: () => {} }).outFile, 'utf8');
    assert.ok(html.includes('id="middle-1"') && !html.includes('id="middle-2"'));
  });

  test('reports a stale drop id, a stray override and a bad drop item at once, and writes nothing', () => {
    const root = budgetDeck({
      'budgets/20min/budget.md': '# 20 minutes\n\n## Drop\n\n- `middle-9`\n- "bad id"\n',
      'budgets/20min/slides/gone.html': '<section id="gone-1"></section>',
    });
    const errors = buildErrors(root, { budget: '20min' });
    assertSomeMatch(errors, /budgets\/20min\/budget\.md: dropped slide "middle-9" matches no slide in the deck/);
    assertSomeMatch(errors, /budgets\/20min\/slides\/gone\.html overrides no chapter listed in docs\/roadmap\.md/);
    assertSomeMatch(errors, /budget\.md:6: a drop item must start with a slide id/);
    assert.ok(!fs.existsSync(path.join(root, 'build')));
  });

  test('a missing budget folder and a malformed budget name fail', () => {
    assertSomeMatch(buildErrors(makeDeck(), { budget: '45min' }), /budgets\/45min\/budget\.md is missing/);
    assertSomeMatch(buildErrors(makeDeck(), { budget: '../20min' }), /must be a number of minutes/);
  });
});

describe('check', () => {
  const MD = { opening: '# Opening\n\nWhy this matters.\n', middle: '# Middle\n', closing: '# Closing\n' };

  /** A chunk carrying a fresh header for `md`. */
  const chunkFor = (topic, md = MD[topic]) => `${sourceHeader(`docs/${topic}.md`, md)}\n<section id="${topic}-1"></section>\n`;

  /** A deck whose three chapters all have an md and a fresh chunk, plus overrides. */
  function freshDeck(files = {}) {
    const base = {};
    for (const topic of Object.keys(MD)) {
      base[`docs/${topic}.md`] = MD[topic];
      base[`slides/${topic}.html`] = chunkFor(topic);
    }
    return makeDeck({ ...base, ...files });
  }

  function checkErrors(root, options = {}) {
    try {
      check({ root, warn: () => {}, ...options });
    } catch (err) {
      assert.ok(err instanceof BuildError, `expected a BuildError, got ${err}`);
      assert.match(err.message, /^Check failed/);
      return err.errors;
    }
    assert.fail('expected the check to fail');
  }

  test('passes when every chunk matches its md, and writes nothing', () => {
    const root = freshDeck();
    const result = check({ root, warn: () => {} });
    assert.deepEqual(result.fresh, ['opening', 'middle', 'closing']);
    assert.deepEqual(result.missing, []);
    assert.ok(!fs.existsSync(path.join(root, 'build')));
  });

  test('the header hash is what shasum -a 256 prints for the md', () => {
    const hex = crypto.createHash('sha256').update(MD.opening).digest('hex');
    assert.equal(sourceHeader('docs/opening.md', Buffer.from(MD.opening)), `<!-- source: docs/opening.md sha256:${hex} -->`);
  });

  test('fails naming the stale chunk when its md changed', () => {
    const errors = checkErrors(freshDeck({ 'docs/middle.md': '# Middle, rewritten\n' }));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^slides\/middle\.html is stale: docs\/middle\.md changed/);
    assert.ok(errors[0].includes(sourceHeader('docs/middle.md', '# Middle, rewritten\n')), 'tells the fix');
  });

  test('a chunk without its md fails', () => {
    assertSomeMatch(checkErrors(freshDeck({ 'docs/closing.md': null })), /slides\/closing\.html has no docs\/closing\.md/);
  });

  test('a chunk with no header, or a header naming another md, fails', () => {
    const errors = checkErrors(
      freshDeck({
        'slides/opening.html': '<section id="opening-1"></section>',
        'slides/middle.html': chunkFor('opening').replace('docs/opening.md', 'docs/other.md'),
      }),
    );
    assertSomeMatch(errors, /slides\/opening\.html has no source header; add <!-- source: docs\/opening\.md sha256:[0-9a-f]{64} -->/);
    assertSomeMatch(errors, /slides\/middle\.html names source "docs\/other\.md", expected docs\/middle\.md/);
  });

  test('accepts ./ in the source path and an uppercase hash', () => {
    const header = sourceHeader('docs/opening.md', MD.opening);
    const loose = header.replace('docs/', './docs/').replace(/[0-9a-f]{64}/, (h) => h.toUpperCase());
    assert.doesNotThrow(() => check({ root: freshDeck({ 'slides/opening.html': `${loose}\n<section></section>` }), warn: () => {} }));
  });

  test('an unwritten chunk is a warning, so verify stays green between md and slides', () => {
    const messages = [];
    const root = freshDeck({ 'slides/middle.html': null, 'docs/closing.md': null, 'slides/closing.html': null });
    const result = check({ root, warn: (m) => messages.push(m) });
    assert.deepEqual(result.fresh, ['opening']);
    assert.deepEqual(result.missing, ['middle', 'closing']);
    assertSomeMatch(messages, /"middle" has no slides\/middle\.html yet/);
    assertSomeMatch(messages, /"closing" has no docs\/closing\.md and slides\/closing\.html yet/);
  });

  test('--complete turns every missing md or chunk into an error', () => {
    const root = freshDeck({ 'slides/middle.html': null, 'docs/closing.md': null, 'slides/closing.html': null });
    const errors = checkErrors(root, { complete: true });
    assertSomeMatch(errors, /chapter "middle" has no slides\/middle\.html$/);
    assertSomeMatch(errors, /chapter "closing" has no docs\/closing\.md and slides\/closing\.html$/);
  });

  test('reports roadmap errors', () => {
    assertSomeMatch(checkErrors(freshDeck({ 'docs/roadmap.md': null })), /docs\/roadmap\.md is missing/);
  });

  test('covers every budget override: fresh ones pass, stale or stray ones fail', () => {
    const fresh = freshDeck({
      'budgets/20min/budget.md': '# 20\n',
      'budgets/20min/slides/middle.html': chunkFor('middle'),
      'budgets/5min/slides/opening.html': chunkFor('opening'),
      'budgets/drafts/slides/closing.html': 'not a budget folder, not checked',
    });
    const result = check({ root: fresh, warn: () => {} });
    assert.deepEqual(result.overrides, ['budgets/5min/slides/opening.html', 'budgets/20min/slides/middle.html']);

    const errors = checkErrors(
      freshDeck({
        'budgets/20min/slides/middle.html': chunkFor('middle', '# Older middle\n'),
        'budgets/20min/slides/opening.html': '<section id="opening-short"></section>',
        'budgets/20min/slides/gone.html': chunkFor('opening'),
      }),
    );
    assertSomeMatch(errors, /^budgets\/20min\/slides\/middle\.html is stale: docs\/middle\.md changed/);
    assertSomeMatch(errors, /^budgets\/20min\/slides\/opening\.html has no source header/);
    assertSomeMatch(errors, /^budgets\/20min\/slides\/gone\.html overrides no chapter/);
  });

  test('the CLI exits 1 on a stale chunk and 0 when fresh', () => {
    const stale = freshDeck({ 'docs/opening.md': '# Changed\n' });
    fs.copyFileSync(path.join(__dirname, '..', 'build.js'), path.join(stale, 'build.js'));
    const run = (...args) => {
      try {
        execFileSync(process.execPath, ['build.js', ...args], { cwd: stale, stdio: 'pipe' });
        return 0;
      } catch (err) {
        return err.status;
      }
    };
    assert.equal(run('--check'), 1);
    assert.equal(run('--complete'), 2, '--complete alone is a usage error');
    fs.writeFileSync(path.join(stale, 'docs', 'opening.md'), MD.opening);
    assert.equal(run('--check', '--complete'), 0);
  });

  test('the CLI builds a budget given as <N>min, and rejects bad combinations', () => {
    const root = freshDeck({ 'budgets/20min/budget.md': '# 20\n\n## Drop\n\n- `closing-1`\n' });
    fs.copyFileSync(path.join(__dirname, '..', 'build.js'), path.join(root, 'build.js'));
    const run = (...args) => {
      try {
        execFileSync(process.execPath, ['build.js', ...args], { cwd: root, stdio: 'pipe' });
        return 0;
      } catch (err) {
        return err.status;
      }
    };
    assert.equal(run('20min'), 0);
    assert.ok(!fs.readFileSync(path.join(root, 'build', '20min', 'index.html'), 'utf8').includes('closing-1'));
    assert.equal(run('--check', '20min'), 2, '--check covers every budget already');
    assert.equal(run('20min', '5min'), 2);
    assert.equal(run('twenty'), 2);
  });
});

test('isExternalUrl tells local paths from anything needing the network', () => {
  for (const v of ['https://x.org', '//x.org/a', 'mailto:a@b.c', 'file:///etc']) assert.ok(isExternalUrl(v), v);
  for (const v of ['assets/a.png', '#id', 'data:image/png;base64,AA', '']) assert.ok(!isExternalUrl(v), v);
});
