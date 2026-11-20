/**
 * build-steps: reveal a slide's [data-reveal] parts one clicker press at a time.
 *
 *   <section data-interactive="build-steps">
 *     <li data-reveal>First</li>
 *     <li data-reveal>Second</li>
 *     <img data-reveal="chart" …> <p data-reveal="chart">Both appear together</p>
 *   </section>
 *
 * Each [data-reveal] part is one step, in document order. Parts that share a non-empty
 * value are one step, at the place of the first of them. The authored markup is the
 * final state; style.css hides unrevealed parts in live mode only, so print shows all.
 */

const REVEALED = 'is-revealed';

/** The slide's steps, in order: each one a list of parts that appear together. */
function stepsOf(slide) {
  const groups = new Map();
  let ordinal = 0;
  for (const part of slide.querySelectorAll('[data-reveal]')) {
    const name = part.getAttribute('data-reveal');
    const key = name ? `name:${name}` : `part:${(ordinal += 1)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(part);
  }
  return [...groups.values()];
}

const isRevealed = (parts) => parts.every((part) => part.classList.contains(REVEALED));

const buildSteps = {
  step(slide, direction) {
    const steps = stepsOf(slide);
    const target = direction > 0 ? steps.find((s) => !isRevealed(s)) : steps.findLast(isRevealed);
    if (!target) return false;
    for (const part of target) part.classList.toggle(REVEALED, direction > 0);
    return true;
  },

  // Called once the slide is hidden, so the reset is never seen.
  leave(slide) {
    for (const part of slide.querySelectorAll('[data-reveal]')) part.classList.remove(REVEALED);
  },
};

// Node (the scaffold's tests) gets the hooks; the deck registers them.
if (typeof module === 'object' && module.exports) module.exports = buildSteps;
else Deck.register('build-steps', buildSteps);
