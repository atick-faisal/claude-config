/**
 * Deck runtime: a 1920×1080 stage scaled to the screen, keyboard and clicker navigation,
 * `F` for fullscreen, a subtle progress bar, number + Enter to jump, and the interaction
 * registry. Vanilla JS, no dependencies.
 *
 * Slides are the <section> children of <main class="deck">. The authored markup is each
 * slide's FINAL state: print and the PDF export run with JavaScript off and show exactly
 * that. Live mode is `html.deck--live` (set by build.js in <head>); style.css hides
 * unrevealed parts by default there, and JavaScript only ever reveals.
 *
 * Interactions, one file each in js/interactions/:
 *
 *   Deck.register('<name>', {
 *     init(slide)                  once at startup, for every slide: set any start state
 *     enter(slide, { direction })  after the slide is shown; must NOT change what is visible
 *     leave(slide, { direction })  after the slide is hidden; reset it to its start state
 *     step(slide, direction, { instant }) → true if it consumed the press, false to move on
 *   });
 *
 * A slide opts in with data-interactive="<name>" (several names, space-separated).
 * Next/Previous call step(±1) first, so a clicker drives builds before it changes slide.
 * Moving backwards into a slide shows it finished: while it is still hidden, step(+1) runs
 * with { instant: true } until it returns false.
 *
 * The core below is DOM-free so `node --test` can cover it; the browser part is at the end.
 */
;(function () {
  'use strict';

  const STAGE = Object.freeze({ width: 1920, height: 1080 });
  const MAX_JUMP_DIGITS = 4;
  const JUMP_TIMEOUT_MS = 4000;
  // A step() that never returns false would hang the back-navigation catch-up.
  const MAX_CATCH_UP_STEPS = 500;

  const KEY_ACTIONS = Object.freeze({
    ArrowRight: 'next',
    ArrowDown: 'next',
    PageDown: 'next', // most clickers send PageDown / PageUp
    ArrowLeft: 'prev',
    ArrowUp: 'prev',
    PageUp: 'prev',
    Home: 'first',
    End: 'last',
    f: 'fullscreen',
    F: 'fullscreen',
    Enter: 'enter',
    Escape: 'escape',
    Backspace: 'backspace',
  });

  // -------------------------------------------------------------------------
  // Core: pure, DOM-free
  // -------------------------------------------------------------------------

  /**
   * What a keydown means to the deck, or null to leave it to the browser.
   * Returns an action name, or the digit itself ('0'–'9') for number + Enter jumps.
   * Any Ctrl/Cmd/Alt chord is the browser's (reload, print, zoom). '/' is left free for search.
   */
  function actionForKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return null;
    if (event.key === ' ') return event.shiftKey ? 'prev' : 'next';
    if (/^[0-9]$/.test(event.key)) return event.key;
    return KEY_ACTIONS[event.key] ?? null;
  }

  /** "12" → slide index 11, clamped to the last slide; null for nothing or zero. */
  function parseJump(digits, count) {
    const n = Number.parseInt(digits, 10);
    if (!(n >= 1) || count < 1) return null;
    return Math.min(n, count) - 1;
  }

  /** Scale and offset that fit the stage inside the viewport, letterboxed and centred. */
  function fitStage(viewWidth, viewHeight) {
    const scale = Math.min(viewWidth / STAGE.width, viewHeight / STAGE.height);
    if (!(scale > 0)) return { scale: 1, x: 0, y: 0 };
    return {
      scale,
      x: (viewWidth - STAGE.width * scale) / 2,
      y: (viewHeight - STAGE.height * scale) / 2,
    };
  }

  /** Progress through the deck as a fraction: the last slide is 1. */
  function progressOf(index, count) {
    return count > 0 ? (index + 1) / count : 0;
  }

  /**
   * The slide index a URL hash points at, or null: "#12" is slide 12 (clamped),
   * "#closing-1" is the slide with that id.
   */
  function indexForHash(hash, ids) {
    let value;
    try {
      value = decodeURIComponent(hash.replace(/^#/, ''));
    } catch {
      return null;
    }
    if (value === '') return null;
    if (/^[0-9]+$/.test(value)) return parseJump(value, ids.length);
    const index = ids.indexOf(value);
    return index === -1 ? null : index;
  }

  /** The interaction names a slide opts into. */
  function interactionNames(slide) {
    return (slide.dataset.interactive ?? '').split(/\s+/).filter(Boolean);
  }

  /**
   * Navigation and the interaction lifecycle, independent of the DOM.
   *
   * @param {object} options
   * @param {object[]} options.slides slide handles; each needs `dataset.interactive`
   * @param {Map<string, object>} options.interactions name → hooks
   * @param {(to: number, from: number) => void} options.show make slide `to` the visible one
   * @param {(message: string, error?: unknown) => void} options.report problems; never throws
   */
  function createController({ slides, interactions, show, report }) {
    let current = -1;

    const hooks = slides.map((slide, i) =>
      interactionNames(slide)
        .map((name) => {
          const found = interactions.get(name);
          if (!found) report(`slide ${i + 1}: no interaction named "${name}" is registered`);
          return found;
        })
        .filter(Boolean),
    );

    /** Call one hook on every interaction of slide i. A throwing hook is reported, not fatal. */
    function call(i, hook, ...args) {
      for (const h of hooks[i]) {
        if (typeof h[hook] !== 'function') continue;
        try {
          h[hook](slides[i], ...args);
        } catch (error) {
          report(`slide ${i + 1}: ${hook}() failed`, error);
        }
      }
    }

    /** True when one of slide i's interactions consumed the step. Last one first going back. */
    function step(i, direction, context) {
      const ordered = direction > 0 ? hooks[i] : [...hooks[i]].reverse();
      for (const h of ordered) {
        if (typeof h.step !== 'function') continue;
        try {
          if (h.step(slides[i], direction, context) === true) return true;
        } catch (error) {
          report(`slide ${i + 1}: step() failed`, error);
        }
      }
      return false;
    }

    /** Run slide i to its finished state while it is still hidden. */
    function catchUp(i) {
      for (let n = 0; n < MAX_CATCH_UP_STEPS; n += 1) {
        if (!step(i, +1, { instant: true })) return;
      }
      report(`slide ${i + 1}: step() still returned true after ${MAX_CATCH_UP_STEPS} steps`);
    }

    function go(target, direction) {
      const to = Math.max(0, Math.min(slides.length - 1, target));
      if (to === current || slides.length === 0) return false;
      const from = current;
      if (direction < 0) catchUp(to);
      show(to, from);
      current = to;
      call(to, 'enter', { direction });
      if (from !== -1) call(from, 'leave', { direction });
      return true;
    }

    return {
      get current() {
        return current;
      },
      get count() {
        return slides.length;
      },
      /** Every slide's init, once, then show slide `index` in its start state. */
      start(index = 0) {
        slides.forEach((_, i) => call(i, 'init'));
        go(index, +1);
      },
      next() {
        if (current !== -1 && !step(current, +1, { instant: false })) go(current + 1, +1);
      },
      prev() {
        if (current !== -1 && !step(current, -1, { instant: false })) go(current - 1, -1);
      },
      goTo(index) {
        return go(index, Math.sign(index - current));
      },
    };
  }

  /**
   * Keydown handling, including the number + Enter jump buffer.
   * Returns a function(event) → true when the deck handled the key (the caller then
   * prevents the browser default, e.g. Space scrolling).
   *
   * @param {object} options
   * @param {ReturnType<typeof createController>} options.controller
   * @param {() => void} options.toggleFullscreen
   * @param {(digits: string) => void} options.showDigits '' hides the indicator
   */
  function createKeyHandler({ controller, toggleFullscreen, showDigits }) {
    let digits = '';
    const setDigits = (value) => {
      digits = value;
      showDigits(value);
    };

    return function handleKey(event) {
      const action = actionForKey(event);
      if (action === null) return false;

      if (/^[0-9]$/.test(action)) {
        if (digits.length < MAX_JUMP_DIGITS) setDigits(digits + action);
        return true;
      }
      // Enter, Escape and Backspace only mean something while a number is being typed.
      if (action === 'enter' || action === 'escape' || action === 'backspace') {
        if (digits === '') return false;
        if (action === 'enter') {
          const target = parseJump(digits, controller.count);
          setDigits('');
          if (target !== null) controller.goTo(target);
        } else {
          setDigits(action === 'backspace' ? digits.slice(0, -1) : '');
        }
        return true;
      }

      if (digits !== '') setDigits('');
      if (action === 'next') controller.next();
      else if (action === 'prev') controller.prev();
      else if (action === 'first') controller.goTo(0);
      else if (action === 'last') controller.goTo(controller.count - 1);
      else if (action === 'fullscreen') toggleFullscreen();
      return true;
    };
  }

  const core = {
    STAGE,
    actionForKey,
    parseJump,
    fitStage,
    progressOf,
    indexForHash,
    createController,
    createKeyHandler,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = core;
    return;
  }

  // -------------------------------------------------------------------------
  // Browser
  // -------------------------------------------------------------------------

  const interactions = new Map();
  let booted = false;

  function report(message, error) {
    // console.error, not a throw: one broken interaction must not stop the talk. The
    // export's runtime tests fail on any console error, so it is still caught before a deck ships.
    if (error === undefined) console.error(`deck: ${message}`);
    else console.error(`deck: ${message}`, error);
  }

  window.Deck = Object.freeze({
    /** Register an interaction. Call it at load time, from js/interactions/<name>.js. */
    register(name, hooks) {
      if (typeof name !== 'string' || name === '' || hooks === null || typeof hooks !== 'object') {
        throw new TypeError('Deck.register(name, hooks) needs a name and a hooks object');
      }
      if (interactions.has(name)) throw new Error(`Deck.register: "${name}" is already registered`);
      if (booted) report(`interaction "${name}" registered after startup; its slides never got init()`);
      interactions.set(name, hooks);
    },
  });

  function isEditable(target) {
    return Boolean(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)));
  }

  function toggleFullscreen() {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    request?.catch((error) => console.warn('deck: fullscreen is not available here', error));
  }

  function makeOverlay(className) {
    const el = document.createElement('div');
    el.className = className;
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
    return el;
  }

  function boot() {
    booted = true;
    const html = document.documentElement;
    html.classList.add('deck--live'); // normally already set in <head>; harmless twice

    const slides = [...document.querySelectorAll('main.deck > section')];
    if (slides.length === 0) {
      report('no slides: expected <section> elements inside <main class="deck">');
      return;
    }
    slides.forEach((slide, i) => {
      if (!slide.dataset.interactive && slide.querySelector('[data-reveal]')) {
        report(`slide ${i + 1} has [data-reveal] parts but no data-interactive, so they never appear`);
      }
    });

    const progress = makeOverlay('deck-progress');
    const jump = makeOverlay('deck-jump');
    jump.hidden = true;

    const controller = createController({
      slides,
      interactions,
      report,
      show(to, from) {
        if (from !== -1) slides[from].classList.remove('is-current');
        slides[to].classList.add('is-current');
        progress.style.setProperty('--deck-progress', String(progressOf(to, slides.length)));
        try {
          // So a reload after a rebuild lands on the same slide.
          history.replaceState(null, '', `#${to + 1}`);
        } catch {
          // Some file:// contexts refuse history changes; the deck works without it.
        }
      },
    });

    const fit = () => {
      const { scale, x, y } = fitStage(window.innerWidth, window.innerHeight);
      html.style.setProperty('--deck-scale', String(scale));
      html.style.setProperty('--deck-x', `${x}px`);
      html.style.setProperty('--deck-y', `${y}px`);
    };
    fit();
    window.addEventListener('resize', fit);

    let jumpTimer;
    const handleKey = createKeyHandler({
      controller,
      toggleFullscreen,
      showDigits(digits) {
        clearTimeout(jumpTimer);
        jump.textContent = digits;
        jump.hidden = digits === '';
        // A half-typed number should not linger and hijack a later Enter.
        if (digits !== '') jumpTimer = setTimeout(() => handleKey({ key: 'Escape' }), JUMP_TIMEOUT_MS);
      },
    });
    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || isEditable(event.target)) return;
      if (handleKey(event)) event.preventDefault();
    });

    const ids = slides.map((slide) => slide.id);
    // In-slide links like <a href="#closing-1"> navigate the deck instead of scrolling.
    window.addEventListener('hashchange', () => {
      const index = indexForHash(location.hash, ids);
      if (index !== null) controller.goTo(index);
    });

    controller.start(indexForHash(location.hash, ids) ?? 0);
  }

  // Interactions are bundled after this file, so boot once they have all registered.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else queueMicrotask(boot);
})();
