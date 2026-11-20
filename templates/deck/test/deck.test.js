'use strict';
// Runtime tests: Node built-ins only. They cover deck.js's DOM-free core and build-steps
// with stand-in slides; what needs a real browser (scaling on screen, the no-flash frame)
// is covered by the Playwright tests that run in a deck's own `just verify`.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  actionForKey,
  parseJump,
  fitStage,
  progressOf,
  indexForHash,
  createController,
  createKeyHandler,
} = require('../js/deck.js');
const buildSteps = require('../js/interactions/build-steps.js');
const { build } = require('../build.js');

const SCAFFOLD = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Stand-ins
// ---------------------------------------------------------------------------

/** A slide handle as the controller sees it. */
const slide = (interactive = '') => ({ dataset: interactive ? { interactive } : {} });

/** A controller over `slides`, recording every show, hook call and report in `log`. */
function harness(slides, interactions = new Map()) {
  const log = [];
  const reports = [];
  const controller = createController({
    slides,
    interactions,
    show: (to, from) => log.push(`show ${to} from ${from}`),
    report: (message) => reports.push(message),
  });
  return { controller, log, reports };
}

/** An interaction with `steps` builds that logs each hook against its slide's index. */
function counter(slides, log, steps = 2) {
  const state = new Map();
  const at = (s) => slides.indexOf(s);
  return {
    init: (s) => {
      state.set(s, 0);
      log.push(`init ${at(s)}`);
    },
    enter: (s, { direction }) => log.push(`enter ${at(s)} ${direction}`),
    leave: (s) => {
      state.set(s, 0);
      log.push(`leave ${at(s)}`);
    },
    step: (s, direction, { instant }) => {
      const n = state.get(s) + direction;
      if (n < 0 || n > steps) return false;
      state.set(s, n);
      log.push(`step ${at(s)} ${direction}${instant ? ' instant' : ''}`);
      return true;
    },
    built: (s) => state.get(s),
  };
}

/** A stand-in DOM element: just enough for build-steps. */
function part(reveal = '') {
  const classes = new Set();
  return {
    getAttribute: (name) => (name === 'data-reveal' ? reveal : null),
    classList: {
      contains: (c) => classes.has(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    get revealed() {
      return classes.has('is-revealed');
    },
  };
}

const fakeSlide = (parts) => ({ querySelectorAll: () => parts });

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('actionForKey', () => {
  const key = (k, extra = {}) => actionForKey({ key: k, ...extra });

  test('maps keyboard and clicker keys to deck actions', () => {
    for (const k of ['ArrowRight', 'ArrowDown', 'PageDown', ' ']) assert.equal(key(k), 'next', k);
    for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp']) assert.equal(key(k), 'prev', k);
    assert.equal(key(' ', { shiftKey: true }), 'prev');
    assert.equal(key('Home'), 'first');
    assert.equal(key('End'), 'last');
    assert.equal(key('f'), 'fullscreen');
    assert.equal(key('F', { shiftKey: true }), 'fullscreen');
    assert.equal(key('7'), '7');
  });

  test('leaves browser chords, IME input and unknown keys alone', () => {
    assert.equal(key('ArrowRight', { metaKey: true }), null);
    assert.equal(key('p', { ctrlKey: true }), null);
    assert.equal(key('f', { altKey: true }), null);
    assert.equal(key('ArrowRight', { isComposing: true }), null);
    assert.equal(key('/'), null, '/ stays free for the slide search');
    assert.equal(key('x'), null);
  });
});

describe('parseJump', () => {
  test('turns a 1-based slide number into an index, clamped to the deck', () => {
    assert.equal(parseJump('1', 10), 0);
    assert.equal(parseJump('12', 20), 11);
    assert.equal(parseJump('99', 10), 9);
  });

  test('ignores zero, nothing, and an empty deck', () => {
    assert.equal(parseJump('0', 10), null);
    assert.equal(parseJump('', 10), null);
    assert.equal(parseJump('3', 0), null);
  });
});

describe('fitStage', () => {
  test('a 16:9 window fills exactly', () => {
    assert.deepEqual(fitStage(1920, 1080), { scale: 1, x: 0, y: 0 });
    assert.deepEqual(fitStage(3840, 2160), { scale: 2, x: 0, y: 0 });
  });

  test('a taller window letterboxes top and bottom, a wider one left and right', () => {
    assert.deepEqual(fitStage(1920, 1200), { scale: 1, x: 0, y: 60 });
    assert.deepEqual(fitStage(2400, 1080), { scale: 1, x: 240, y: 0 });
    assert.deepEqual(fitStage(960, 1080), { scale: 0.5, x: 0, y: 270 });
  });

  test('a zero-sized window does not produce NaN', () => {
    assert.deepEqual(fitStage(0, 0), { scale: 1, x: 0, y: 0 });
  });
});

test('progressOf reaches 1 on the last slide', () => {
  assert.equal(progressOf(0, 4), 0.25);
  assert.equal(progressOf(3, 4), 1);
  assert.equal(progressOf(0, 0), 0);
});

describe('indexForHash', () => {
  const ids = ['opening-1', 'middle-1', 'closing-1'];

  test('reads a slide number or a slide id', () => {
    assert.equal(indexForHash('#2', ids), 1);
    assert.equal(indexForHash('#99', ids), 2);
    assert.equal(indexForHash('#closing-1', ids), 2);
  });

  test('anything else points nowhere', () => {
    assert.equal(indexForHash('', ids), null);
    assert.equal(indexForHash('#', ids), null);
    assert.equal(indexForHash('#nope', ids), null);
    assert.equal(indexForHash('#0', ids), null);
    assert.equal(indexForHash('#%E2', ids), null, 'malformed escapes must not throw');
  });
});

// ---------------------------------------------------------------------------
// Controller: navigation and the interaction lifecycle
// ---------------------------------------------------------------------------

describe('createController', () => {
  test('start runs every init before showing the first slide', () => {
    const slides = [slide('c'), slide('c')];
    const log = [];
    const controller = createController({
      slides,
      interactions: new Map([['c', counter(slides, log)]]),
      show: (to, from) => log.push(`show ${to} from ${from}`),
      report: assert.fail,
    });
    controller.next(); // before start: nothing to do, nothing to break
    assert.equal(controller.current, -1);
    controller.start();
    assert.deepEqual(log, ['init 0', 'init 1', 'show 0 from -1', 'enter 0 1']);
  });

  test('next steps through the builds before it changes slide', () => {
    const slides = [slide('c'), slide()];
    const log = [];
    const interactions = new Map([['c', counter(slides, log, 2)]]);
    const { controller, log: shows } = harness(slides, interactions);
    controller.start();
    controller.next();
    controller.next();
    assert.equal(controller.current, 0, 'two builds, still on slide 1');
    controller.next();
    assert.equal(controller.current, 1);
    assert.deepEqual(shows, ['show 0 from -1', 'show 1 from 0']);
    assert.deepEqual(log, ['init 0', 'enter 0 1', 'step 0 1', 'step 0 1', 'leave 0']);
  });

  test('enter runs after the slide is shown, leave after the old one is hidden', () => {
    const slides = [slide('c'), slide('c')];
    const log = [];
    const interactions = new Map([['c', counter(slides, log, 0)]]);
    const controller = createController({
      slides,
      interactions,
      show: (to, from) => log.push(`show ${to} from ${from}`),
      report: assert.fail,
    });
    controller.start();
    controller.next();
    assert.deepEqual(log.slice(2), ['show 0 from -1', 'enter 0 1', 'show 1 from 0', 'enter 1 1', 'leave 0']);
  });

  test('going back into a slide shows it finished, built while still hidden', () => {
    const slides = [slide('c'), slide()];
    const log = [];
    const c = counter(slides, log, 3);
    const controller = createController({
      slides,
      interactions: new Map([['c', c]]),
      show: (to, from) => log.push(`show ${to} from ${from}`),
      report: assert.fail,
    });
    controller.start();
    controller.goTo(1); // slide 0 left at its start state
    log.length = 0;
    controller.prev();
    assert.equal(controller.current, 0);
    assert.equal(c.built(slides[0]), 3);
    assert.deepEqual(log, [
      'step 0 1 instant',
      'step 0 1 instant',
      'step 0 1 instant',
      'show 0 from 1',
      'enter 0 -1',
    ]);
  });

  test('prev on a built slide steps back before it changes slide', () => {
    const slides = [slide(), slide('c')];
    const log = [];
    const c = counter(slides, log, 1);
    const { controller } = harness(slides, new Map([['c', c]]));
    controller.start(1);
    controller.next();
    assert.equal(c.built(slides[1]), 1);
    controller.prev();
    assert.equal(controller.current, 1);
    assert.equal(c.built(slides[1]), 0);
    controller.prev();
    assert.equal(controller.current, 0);
  });

  test('goTo clamps to the deck, and the current slide is a no-op', () => {
    const { controller, log } = harness([slide(), slide(), slide()]);
    controller.start();
    assert.equal(controller.goTo(0), false);
    controller.goTo(99);
    assert.equal(controller.current, 2);
    controller.next();
    controller.goTo(-5);
    assert.equal(controller.current, 0);
    assert.deepEqual(log, ['show 0 from -1', 'show 2 from 0', 'show 0 from 2']);
  });

  test('several interactions on one slide: forward in order, back in reverse', () => {
    const slides = [slide('a b')];
    const log = [];
    const a = counter(slides, [], 1);
    const b = counter(slides, [], 1);
    const tag = (name, h) => ({ ...h, step: (s, d, x) => h.step(s, d, x) && log.push(`${name} ${d}`) > 0 });
    const { controller } = harness(slides, new Map([['a', tag('a', a)], ['b', tag('b', b)]]));
    controller.start();
    controller.next();
    controller.next();
    controller.prev();
    controller.prev();
    assert.deepEqual(log, ['a 1', 'b 1', 'b -1', 'a -1']);
  });

  test('an unknown interaction and a throwing hook are reported, never fatal', () => {
    const slides = [slide('missing'), slide('broken')];
    const broken = {
      enter() {
        throw new Error('boom');
      },
      step() {
        throw new Error('bang');
      },
    };
    const { controller, reports } = harness(slides, new Map([['broken', broken]]));
    controller.start();
    controller.next();
    controller.next(); // step throws: treated as "not consumed", nowhere further to go
    assert.equal(controller.current, 1);
    assert.equal(reports.length, 3);
    assert.match(reports[0], /slide 1: no interaction named "missing"/);
    assert.match(reports[1], /slide 2: enter\(\) failed/);
    assert.match(reports[2], /slide 2: step\(\) failed/);
  });

  test('a step() that never finishes cannot hang the catch-up', () => {
    const slides = [slide('runaway'), slide()];
    const { controller, reports } = harness(slides, new Map([['runaway', { step: (s, d, x) => x.instant }]]));
    controller.start();
    controller.goTo(1);
    controller.prev();
    assert.equal(controller.current, 0);
    assert.match(reports[0], /slide 1: step\(\) still returned true after \d+ steps/);
  });

  test('an empty deck does nothing', () => {
    const { controller, log } = harness([]);
    controller.start();
    controller.next();
    controller.prev();
    assert.deepEqual(log, []);
  });
});

// ---------------------------------------------------------------------------
// Keys and the number + Enter jump
// ---------------------------------------------------------------------------

describe('createKeyHandler', () => {
  function keys(count = 20) {
    const calls = [];
    const shown = [];
    const controller = {
      count,
      next: () => calls.push('next'),
      prev: () => calls.push('prev'),
      goTo: (i) => calls.push(`goTo ${i}`),
    };
    const handle = createKeyHandler({
      controller,
      toggleFullscreen: () => calls.push('fullscreen'),
      showDigits: (d) => shown.push(d),
    });
    const press = (...list) => list.map((k) => handle({ key: k }));
    return { calls, shown, press };
  }

  test('number then Enter jumps to that slide', () => {
    const { calls, shown, press } = keys();
    assert.deepEqual(press('1', '2', 'Enter'), [true, true, true]);
    assert.deepEqual(calls, ['goTo 11']);
    assert.deepEqual(shown, ['1', '12', '']);
  });

  test('Enter, Escape and Backspace are the browser\'s when no number is typed', () => {
    const { calls, press } = keys();
    assert.deepEqual(press('Enter', 'Escape', 'Backspace'), [false, false, false]);
    assert.deepEqual(calls, []);
  });

  test('Backspace edits the number and Escape drops it', () => {
    const { calls, shown, press } = keys();
    press('4', '5', 'Backspace', 'Enter');
    press('7', 'Escape', 'Enter');
    assert.deepEqual(calls, ['goTo 3']);
    assert.deepEqual(shown, ['4', '45', '4', '', '7', '']);
  });

  test('a navigation key drops a half-typed number', () => {
    const { calls, shown, press } = keys();
    press('3', 'ArrowRight', 'Enter');
    assert.deepEqual(calls, ['next']);
    assert.deepEqual(shown, ['3', '']);
  });

  test('the number is capped, and 0 jumps nowhere', () => {
    const { calls, shown, press } = keys();
    press('1', '2', '3', '4', '5');
    assert.equal(shown.at(-1), '1234');
    press('Escape', '0', 'Enter');
    assert.deepEqual(calls, []);
  });

  test('navigation and fullscreen keys reach the controller', () => {
    const { calls, press } = keys(5);
    press('PageDown', 'PageUp', 'Home', 'End', 'f');
    assert.deepEqual(calls, ['next', 'prev', 'goTo 0', 'goTo 4', 'fullscreen']);
  });
});

// ---------------------------------------------------------------------------
// build-steps
// ---------------------------------------------------------------------------

describe('build-steps', () => {
  test('reveals one part per step in order, then lets the deck move on', () => {
    const parts = [part(), part(), part()];
    const s = fakeSlide(parts);
    assert.equal(buildSteps.step(s, +1), true);
    assert.deepEqual(parts.map((p) => p.revealed), [true, false, false]);
    buildSteps.step(s, +1);
    buildSteps.step(s, +1);
    assert.equal(buildSteps.step(s, +1), false);
    assert.ok(parts.every((p) => p.revealed));
  });

  test('parts sharing a name reveal together, at the first one\'s place', () => {
    const parts = [part('chart'), part(), part('chart')];
    const s = fakeSlide(parts);
    buildSteps.step(s, +1);
    assert.deepEqual(parts.map((p) => p.revealed), [true, false, true]);
    buildSteps.step(s, +1);
    assert.equal(buildSteps.step(s, +1), false);
  });

  test('stepping back hides the last revealed step, then lets the deck move on', () => {
    const parts = [part(), part()];
    const s = fakeSlide(parts);
    buildSteps.step(s, +1);
    buildSteps.step(s, +1);
    assert.equal(buildSteps.step(s, -1), true);
    assert.deepEqual(parts.map((p) => p.revealed), [true, false]);
    buildSteps.step(s, -1);
    assert.equal(buildSteps.step(s, -1), false);
  });

  test('leave resets every part to hidden', () => {
    const parts = [part(), part('x')];
    const s = fakeSlide(parts);
    buildSteps.step(s, +1);
    buildSteps.step(s, +1);
    buildSteps.leave(s);
    assert.ok(parts.every((p) => !p.revealed));
  });

  test('a slide with nothing to reveal never holds the clicker', () => {
    assert.equal(buildSteps.step(fakeSlide([]), +1), false);
    assert.equal(buildSteps.step(fakeSlide([]), -1), false);
  });
});

// ---------------------------------------------------------------------------
// The scaffold's own files go through build.js
// ---------------------------------------------------------------------------

describe('scaffold files', () => {
  const tempDirs = [];
  afterEach(() => {
    while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  });

  test('the real stylesheet, runtime and build-steps build into one deck', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-runtime-'));
    tempDirs.push(root);
    for (const rel of ['css/style.css', 'js/deck.js', 'js/interactions/build-steps.js']) {
      fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
      fs.copyFileSync(path.join(SCAFFOLD, rel), path.join(root, rel));
    }
    fs.mkdirSync(path.join(root, 'docs'));
    fs.mkdirSync(path.join(root, 'slides'));
    fs.writeFileSync(path.join(root, 'docs', 'roadmap.md'), '# Deck\n\n## Chapters\n\n1. [One](one.md)\n');
    fs.writeFileSync(
      path.join(root, 'slides', 'one.html'),
      '<section id="one-1" data-interactive="build-steps"><h1>One</h1><p data-reveal>later</p></section>\n',
    );

    const result = build({ root, warn: () => {} });
    const html = fs.readFileSync(result.outFile, 'utf8');
    assert.ok(html.includes('window.Deck = Object.freeze('));
    assert.ok(html.includes("Deck.register('build-steps', buildSteps)"));
    assert.ok(html.includes('@page'));
  });

  test('the stylesheet keeps every live-only rule out of print', () => {
    const css = fs.readFileSync(path.join(SCAFFOLD, 'css', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // Outside @media blocks, nothing may depend on live mode or hide a reveal.
    const topLevel = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    assert.ok(!/deck--live|is-current|is-revealed/.test(topLevel), 'a live-only rule escaped @media screen');
    assert.match(css, /@page\s*\{\s*size:\s*1920px 1080px;/);
    assert.match(css, /--brand-primary:/);
  });
});
