'use strict';
/**
 * Deck export: build/[<N>min/]index.html -> build/[<N>min/]index.pdf, one 1920×1080 page
 * per slide, with Playwright's bundled Chromium.
 *
 * - The page loads with JavaScript OFF. The authored markup is every slide's final state
 *   (the Runtime contract), so no interaction's init() can change what gets printed.
 * - The page loads offline. Any request other than the page itself fails the export.
 * - Every problem is collected and reported at once, and nothing is written unless all pass:
 *   a slide that overflows its box, an element that clips its content or reaches past the
 *   slide's edge, a console or page error, any network request, or a page count that is not
 *   one page per slide.
 *
 * Usage: node export.js          export build/index.html
 *        node export.js <N>min   export build/<N>min/index.html
 * Runtime: Playwright (devDependency), the deck's one network exception, at install time only.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { BuildError, BUDGET_RE, writeFileAtomic } = require('./build.js');

const PAGE = Object.freeze({ width: 1920, height: 1080 });

/** Loaded on first use, so a missing install gets a clear message instead of a stack trace. */
function loadPlaywright() {
  try {
    return require('playwright');
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
    throw new BuildError(['Playwright is not installed; run `npm install` in the deck'], 'Export');
  }
}

/** A headless Chromium. Callers that export many times can share one via options.browser. */
function launchBrowser() {
  return loadPlaywright().chromium.launch();
}

/**
 * The number of pages in a PDF. Chromium's PDFs keep every page object uncompressed, and
 * each is a dictionary with `/Type /Page` (the page tree's nodes are `/Type /Pages`).
 */
function countPdfPages(pdf) {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
}

/**
 * Runs in the page: every slide is exactly 1920×1080, nothing overflows or reaches past its
 * edges, and nothing inside it clips its own content. Returns the slide count and problems.
 */
function inspectSlides({ width, height }) {
  const TOLERANCE = 1; // subpixel layout rounding
  const slides = [...document.querySelectorAll('main.deck > section')];
  const problems = [];

  const describe = (el) => {
    const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    return `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${classes.map((c) => `.${c}`).join('')}>`;
  };

  slides.forEach((slide, i) => {
    const name = `slide ${i + 1}${slide.id ? ` (#${slide.id})` : ''}`;
    const box = slide.getBoundingClientRect();
    if (Math.abs(box.width - width) > TOLERANCE || Math.abs(box.height - height) > TOLERANCE) {
      problems.push(`${name} is ${Math.round(box.width)}×${Math.round(box.height)}, not ${width}×${height}`);
      return;
    }
    const overflow = Math.max(slide.scrollWidth - slide.clientWidth, slide.scrollHeight - slide.clientHeight);
    if (overflow > TOLERANCE) problems.push(`${name} overflows its ${width}×${height} box by ${overflow}px`);

    // Only the outermost offender is named: its children would repeat the same problem.
    const reported = [];
    for (const el of slide.querySelectorAll('*')) {
      // SVG shapes are clipped by their own <svg>, so only HTML elements and <svg> roots count.
      const isHtml = el instanceof HTMLElement;
      if (!isHtml && !(el instanceof SVGSVGElement)) continue;
      if (el.getClientRects().length === 0 || reported.some((r) => r.contains(el))) continue;

      const r = el.getBoundingClientRect();
      const edges = [
        r.top < box.top - TOLERANCE && 'top',
        r.right > box.right + TOLERANCE && 'right',
        r.bottom > box.bottom + TOLERANCE && 'bottom',
        r.left < box.left - TOLERANCE && 'left',
      ].filter(Boolean);
      if (edges.length > 0 && r.width > 0 && r.height > 0) {
        problems.push(`${name}: ${describe(el)} reaches past the slide's ${edges.join(' and ')} edge`);
        reported.push(el);
        continue;
      }

      if (!isHtml) continue;
      const style = getComputedStyle(el);
      const clips = (value) => value !== 'visible';
      if (
        (clips(style.overflowX) && el.scrollWidth - el.clientWidth > TOLERANCE) ||
        (clips(style.overflowY) && el.scrollHeight - el.clientHeight > TOLERANCE)
      ) {
        problems.push(`${name}: ${describe(el)} clips its content`);
        reported.push(el);
      }
    }
  });
  return { count: slides.length, problems };
}

/**
 * Print a built deck to a PDF.
 * @param {object} [options]
 * @param {string} [options.root] deck root (defaults to the folder holding this file)
 * @param {string} [options.budget] e.g. '20min': export build/20min/index.html
 * @param {string} [options.inFile] the built deck (defaults to <root>/build/[<budget>/]index.html)
 * @param {string} [options.outFile] the PDF (defaults to inFile with a .pdf extension)
 * @param {import('playwright').Browser} [options.browser] reuse a browser; otherwise one is launched
 * @returns {Promise<{outFile: string, pages: number, bytes: number}>}
 * @throws {BuildError} listing every problem; nothing is written in that case
 */
async function exportPdf(options = {}) {
  const root = path.resolve(options.root ?? __dirname);
  const budget = options.budget ?? null;
  if (budget !== null && !BUDGET_RE.test(budget)) {
    throw new BuildError([`budget "${budget}" must be a number of minutes, e.g. 20min`], 'Export');
  }
  const inFile = path.resolve(options.inFile ?? path.join(root, 'build', ...(budget ? [budget] : []), 'index.html'));
  const outFile = path.resolve(options.outFile ?? inFile.replace(/\.html?$/i, '') + '.pdf');
  if (!fs.existsSync(inFile)) {
    const rel = path.relative(process.cwd(), inFile);
    throw new BuildError([`${rel} is missing; run \`just build${budget ? ` ${budget}` : ''}\` first`], 'Export');
  }

  const browser = options.browser ?? (await launchBrowser());
  const context = await browser.newContext({ javaScriptEnabled: false, offline: true, viewport: PAGE });
  try {
    const page = await context.newPage();
    const url = pathToFileURL(inFile).href;
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console error: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));
    page.on('request', (request) => {
      // data: URIs never leave the machine; build.js inlines every asset as one.
      if (request.url() !== url && !request.url().startsWith('data:')) {
        errors.push(`network request: ${request.url()} (the deck must be offline)`);
      }
    });

    // Measure under print media, the same layout the PDF gets. page.evaluate still works
    // with the page's own JavaScript off.
    await page.emulateMedia({ media: 'print' });
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const { count, problems } = await page.evaluate(inspectSlides, PAGE);
    errors.push(...problems);
    if (count === 0) errors.push('no slides: expected <section> elements inside <main class="deck">');
    if (errors.length > 0) throw new BuildError(errors, 'Export');

    const pdf = await page.pdf({
      width: `${PAGE.width}px`,
      height: `${PAGE.height}px`,
      preferCSSPageSize: true,
      printBackground: true,
    });
    const pages = countPdfPages(pdf);
    if (pages !== count) errors.push(`the PDF has ${pages} page(s) for ${count} slide(s); something outside the slides takes up a page`);
    if (errors.length > 0) throw new BuildError(errors, 'Export');

    writeFileAtomic(outFile, pdf);
    return { outFile, pages, bytes: pdf.length };
  } finally {
    await context.close();
    if (!options.browser) await browser.close();
  }
}

const USAGE = 'usage: node export.js [<N>min]';

async function main(argv) {
  if (argv.length > 1 || (argv.length === 1 && !BUDGET_RE.test(argv[0]))) {
    console.error(`unknown argument(s): ${argv.join(' ')}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  try {
    const result = await exportPdf({ budget: argv[0] });
    const kib = (result.bytes / 1024).toFixed(1);
    console.log(`Exported ${path.relative(process.cwd(), result.outFile)}: ${result.pages} page(s), ${kib} KiB`);
  } catch (err) {
    console.error(err instanceof BuildError ? err.message : err);
    process.exitCode = 1;
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { exportPdf, launchBrowser, countPdfPages, PAGE };
