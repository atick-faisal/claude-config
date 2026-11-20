'use strict';
// Build tests: Node built-ins only. Every deck is a throwaway fixture under the OS temp dir,
// so running these never writes into the folder that holds build.js.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { build, BuildError, CSP, parseRoadmap, escapeInlineScript, isExternalUrl } = require('../build.js');

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
function buildErrors(root) {
  try {
    build({ root, warn: () => {} });
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

test('isExternalUrl tells local paths from anything needing the network', () => {
  for (const v of ['https://x.org', '//x.org/a', 'mailto:a@b.c', 'file:///etc']) assert.ok(isExternalUrl(v), v);
  for (const v of ['assets/a.png', '#id', 'data:image/png;base64,AA', '']) assert.ok(!isExternalUrl(v), v);
});
