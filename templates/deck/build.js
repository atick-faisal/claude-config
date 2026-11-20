'use strict';
/**
 * Deck build: docs/roadmap.md + slides/<topic>.html + css/style.css + js/deck.js
 * + js/interactions/*.js + assets -> ONE self-contained, offline build/index.html.
 *
 * - Chapter order comes from the `## Chapters` list in docs/roadmap.md, not from file names.
 * - A listed chapter with no slides/<topic>.html yet is skipped with a warning, so a deck
 *   that is half written still builds.
 * - Every local src/href/url() resolves against the deck root (`assets/x.png`), so a chunk
 *   reads the same wherever it lives.
 * - Every error is collected and reported at once; nothing is written unless all pass.
 * - A time budget is an overlay on the base, never a copy: budgets/<N>min/budget.md drops
 *   slides by id, and budgets/<N>min/slides/<topic>.html replaces only the chunks it trims.
 *
 * Usage: node build.js                      build the deck
 *        node build.js <N>min               build budgets/<N>min/ over the base into build/<N>min/
 *        node build.js --check [--complete] check chunks (and budget overrides) are fresh
 *                                           against their md; writes nothing
 * Runtime: Node built-ins only.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Offline by construction: the deck may load nothing but itself. 'unsafe-inline' is needed
// because the CSS and JS are inlined; default-src 'none' still blocks every request.
const CSP = [
  "default-src 'none'",
  'img-src data:',
  'font-src data:',
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const TOPIC_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BUDGET_RE = /^[1-9][0-9]*min$/;
const SLIDE_ID_RE = /^[A-Za-z][\w.:-]*$/;

const IMAGE_MIME = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
});

const CSS_ASSET_MIME = Object.freeze({
  ...IMAGE_MIME,
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
});

// Attributes that load a resource. `href` on <a>/<area> is a link, not a load, and may be external.
const RESOURCE_ATTRS = new Set(['src', 'srcset', 'poster', 'href', 'xlink:href', 'data', 'background']);

class BuildError extends Error {
  constructor(errors, what = 'Build') {
    super(`${what} failed with ${errors.length} error(s):\n  - ${errors.join('\n  - ')}`);
    this.name = 'BuildError';
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** HTML comments, or a start tag <name attrs…> whose quoted values may contain '>'. */
function commentOrStartTagRe() {
  return /<!--[\s\S]*?-->|<([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
}

const ATTR_RE = /(^|\s)([^\s"'<>/=]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g;
const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi;

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
}

function isInside(dir, file) {
  return file === dir || file.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);
}

function unquote(raw) {
  return raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
}

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** True for anything that would need the network (or another origin) at presentation time. */
function isExternalUrl(value) {
  const v = value.trim();
  if (v === '' || v.startsWith('#') || /^data:/i.test(v)) return false;
  return v.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(v);
}

/** Keep a stray "</script" inside the JS from ending the inlined <script> block early. */
function escapeInlineScript(js) {
  return js.replace(/<\/(script)/gi, '<\\/$1');
}

function writeFileAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

/**
 * Walk Markdown the way the deck reads its docs: lines inside ``` fences are skipped, the
 * first `# ` heading is the title, and only the first list under the `## ` heading matching
 * `sectionRe` is collected. A `###` inside the section does not end it; a non-indented,
 * non-item line ends the list.
 *
 * @returns {{title: string, found: boolean, items: {lineNo: number, text: string}[]}}
 */
function readSectionList(text, sectionRe, itemRe) {
  let title = '';
  let inFence = false;
  let inSection = false;
  let found = false;
  let listState = 'before'; // before → in → after: only the first list counts
  const items = [];

  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;

    // A closing `#` run only counts after a space, so "Intro to C#" keeps its '#'.
    const heading = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
    if (heading) {
      if (heading[1] === '#' && !title) title = heading[2];
      if (heading[1].length <= 2) inSection = heading[1] === '##' && sectionRe.test(heading[2]);
      if (inSection) found = true;
      continue;
    }
    if (!inSection || listState === 'after') continue;

    const item = itemRe.exec(line);
    if (item) {
      listState = 'in';
      items.push({ lineNo: i + 1, text: item[1] });
    } else if (listState === 'in' && line.trim() !== '' && !/^\s/.test(line)) {
      listState = 'after';
    }
  }
  return { title, found, items };
}

/**
 * Read the deck title and chapter order from docs/roadmap.md.
 *
 * Title: the first `# ` heading. Chapters: the first ordered list under `## Chapters`,
 * one `[Title](<topic>.md)` link per item. Headings inside ``` fences are ignored.
 *
 * @returns {{title: string, chapters: {title: string, topic: string}[], errors: string[]}}
 */
function parseRoadmap(text, label = 'docs/roadmap.md') {
  const errors = [];
  const chapters = [];
  const { title, found, items } = readSectionList(text, /^chapters$/i, /^\d+[.)]\s+(.*)$/);

  for (const { lineNo, text: item } of items) {
    const link = /\[([^\]]+)\]\(\s*(?:\.\/)?([^)\s]+)\.md\s*\)/.exec(item);
    if (!link) {
      errors.push(`${label}:${lineNo}: chapter item needs a [Title](<topic>.md) link`);
    } else if (!TOPIC_RE.test(link[2])) {
      errors.push(`${label}:${lineNo}: chapter topic "${link[2]}" must be lowercase kebab-case`);
    } else if (chapters.some((c) => c.topic === link[2])) {
      errors.push(`${label}:${lineNo}: chapter "${link[2]}" is listed twice`);
    } else {
      chapters.push({ title: link[1].trim(), topic: link[2] });
    }
  }

  if (!title) errors.push(`${label}: no "# " title heading`);
  if (!found) errors.push(`${label}: no "## Chapters" section`);
  else if (chapters.length === 0 && errors.length === 0) {
    errors.push(`${label}: the "## Chapters" section has no ordered list of [Title](<topic>.md) links`);
  }
  return { title, chapters, errors };
}

// ---------------------------------------------------------------------------
// Time budgets
// ---------------------------------------------------------------------------

/**
 * Read the drop list from a budgets/<N>min/budget.md: the first bullet list under `## Drop`,
 * one slide id per item, in backticks or bare, optionally followed by why it was cut:
 *
 *   - `middle-2` — the derivation; the intuition on middle-1 carries it
 *
 * No `## Drop` section means nothing is dropped: a budget may only trim chunks.
 *
 * @returns {{drop: string[], errors: string[]}}
 */
function parseBudget(text, label) {
  const errors = [];
  const drop = [];
  const { items } = readSectionList(text, /^drop$/i, /^[-*+]\s+(.*)$/);
  for (const { lineNo, text: item } of items) {
    const id = (/^`([^`]+)`/.exec(item) ?? /^(\S+)/.exec(item))?.[1];
    if (!id || !SLIDE_ID_RE.test(id)) {
      errors.push(`${label}:${lineNo}: a drop item must start with a slide id, e.g. \`middle-2\``);
    } else if (drop.includes(id)) {
      errors.push(`${label}:${lineNo}: slide "${id}" is dropped twice`);
    } else {
      drop.push(id);
    }
  }
  return { drop, errors };
}

/**
 * budgets/<budget>/slides/*.html, as topic → relative path. An override for a chapter the
 * roadmap does not list is an error: it would silently never be built.
 */
function readOverrides(root, budget, topics, errors) {
  const rel = `budgets/${budget}/slides`;
  let names;
  try {
    names = fs.readdirSync(path.join(root, 'budgets', budget, 'slides'));
  } catch (err) {
    if (err.code === 'ENOENT') return new Map();
    throw err;
  }
  const overrides = new Map();
  for (const name of names.filter((n) => n.endsWith('.html')).sort()) {
    const topic = name.slice(0, -'.html'.length);
    if (topics.has(topic)) overrides.set(topic, `${rel}/${name}`);
    else errors.push(`${rel}/${name} overrides no chapter listed in docs/roadmap.md`);
  }
  return overrides;
}

/** The <N>min folders under budgets/, shortest first. Other folders are not budgets. */
function listBudgets(root) {
  try {
    return fs
      .readdirSync(path.join(root, 'budgets'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && BUDGET_RE.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/** The value of one attribute in a start tag's attribute text, or null. */
function attrValue(attrSrc, name) {
  for (const m of attrSrc.matchAll(ATTR_RE)) {
    if (m[2].toLowerCase() === name) return decodeEntities(unquote(m[4]));
  }
  return null;
}

/**
 * Cut every top-level <section> whose id is in `drop` out of a chunk. Slides are the
 * top-level sections, so a nested section's id never matches. Each id cut is added to
 * `dropped`, so the caller can report ids that matched nothing.
 */
function dropSlides(html, drop, dropped, label, errors) {
  const tags = /<!--[\s\S]*?-->|<(\/?)section\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let depth = 0;
  let start = 0;
  let id = null;
  let kept = 0; // html before this index has been copied to `out`
  let out = '';
  for (const m of html.matchAll(tags)) {
    if (m[1] === undefined) continue; // an HTML comment
    if (m[1] === '') {
      if (depth === 0) [start, id] = [m.index, attrValue(m[2], 'id')];
      depth += 1;
      continue;
    }
    if (depth === 0) {
      errors.push(`${label}: a </section> has no opening tag`);
      return html;
    }
    depth -= 1;
    if (depth === 0 && id !== null && drop.has(id)) {
      out += html.slice(kept, start);
      kept = m.index + m[0].length;
      dropped.add(id);
    }
  }
  if (depth !== 0) {
    errors.push(`${label}: a <section> is never closed`);
    return html;
  }
  return out + html.slice(kept);
}

/** A budget's drop list and chunk overrides. Errors are collected, not thrown. */
function readOverlay(root, budget, chapters, errors) {
  const label = `budgets/${budget}/budget.md`;
  const text = readRequired(root, label, errors);
  const parsed = text === null ? { drop: [], errors: [] } : parseBudget(text, label);
  errors.push(...parsed.errors);
  const overrides = readOverrides(root, budget, new Set(chapters.map((c) => c.topic)), errors);
  return { label, drop: new Set(parsed.drop), overrides };
}

const NO_OVERLAY = Object.freeze({ label: '', drop: new Set(), overrides: new Map() });

// ---------------------------------------------------------------------------
// Inlining
// ---------------------------------------------------------------------------

/**
 * Turn a local reference into a base64 data URI, resolved against the deck root.
 * Returns undefined (value left as is) for fragments, data URIs and on error.
 */
function toDataUri(rawValue, mimeMap, ctx, where) {
  const { root, label, errors } = ctx;
  const value = rawValue.trim();
  if (value === '' || value.startsWith('#') || /^data:/i.test(value)) return undefined;
  if (isExternalUrl(value)) {
    errors.push(`${label}: external resource "${value}" in ${where} would break offline playback`);
    return undefined;
  }

  const parts = /^([^?#]*)(?:\?[^#]*)?(#.*)?$/.exec(value);
  let relPath;
  try {
    relPath = decodeURIComponent(parts[1]);
  } catch {
    errors.push(`${label}: malformed asset path "${value}" in ${where}`);
    return undefined;
  }
  if (relPath.startsWith('/') || path.isAbsolute(relPath)) {
    errors.push(`${label}: absolute asset path "${value}" in ${where}; use a path from the deck root, e.g. assets/x.png`);
    return undefined;
  }
  const abs = path.resolve(root, relPath);
  if (!isInside(root, abs)) {
    errors.push(`${label}: asset "${value}" in ${where} resolves outside the deck root`);
    return undefined;
  }
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    errors.push(`${label}: missing asset "${value}" in ${where} (paths resolve from the deck root)`);
    return undefined;
  }
  if (!stat.isFile()) {
    errors.push(`${label}: asset "${value}" in ${where} is not a file`);
    return undefined;
  }
  if (!isInside(fs.realpathSync(root), fs.realpathSync(abs))) {
    errors.push(`${label}: asset "${value}" in ${where} resolves outside the deck root (via a symlink)`);
    return undefined;
  }
  const ext = path.extname(abs).toLowerCase();
  const mime = mimeMap[ext];
  if (!mime) {
    errors.push(`${label}: unsupported asset type "${ext || '(none)'}" for "${value}" in ${where} (allowed: ${Object.keys(mimeMap).join(', ')})`);
    return undefined;
  }
  return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}${parts[2] ?? ''}`;
}

/** Inline every local resource an HTML start tag loads; comments are left untouched. */
function inlineHtmlResources(html, ctx) {
  return html.replace(commentOrStartTagRe(), (all, name, attrSrc) => {
    if (name === undefined) return all; // an HTML comment
    const tag = name.toLowerCase();
    const rewritten = attrSrc.replace(ATTR_RE, (attr, pre, attrName, eq, raw) => {
      const key = attrName.toLowerCase();
      if (!RESOURCE_ATTRS.has(key)) return attr;
      if (key === 'href' && (tag === 'a' || tag === 'area')) return attr; // a link, not a load
      const where = `<${tag} ${key}>`;
      if (key === 'srcset') {
        ctx.errors.push(`${ctx.label}: srcset on <${tag}> is not supported; use a single src`);
        return attr;
      }
      const uri = toDataUri(decodeEntities(unquote(raw)), IMAGE_MIME, ctx, where);
      return uri === undefined ? attr : `${pre}${attrName}${eq}"${escapeHtml(uri)}"`;
    });
    return `<${name}${rewritten}>`;
  });
}

/** Inline every local url(...) in a stylesheet; reject @import and anything external. */
function inlineCssResources(css, ctx) {
  if (/<\/style/i.test(css)) {
    ctx.errors.push(`${ctx.label}: contains "</style", which would end the inlined <style> block early`);
  }
  // Comments are blanked so a commented-out url() is neither inlined nor reported.
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@import\b/i.test(code)) ctx.errors.push(`${ctx.label}: @import is not allowed; keep all styles in one file`);
  return code.replace(CSS_URL_RE, (all, dq, sq, bare) => {
    const value = dq ?? sq ?? bare ?? '';
    const uri = toDataUri(value, CSS_ASSET_MIME, ctx, `url(${value})`);
    return uri === undefined ? all : `url("${uri}")`;
  });
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Read a required source file; returns null and records an error when it is missing. */
function readRequired(root, relPath, errors) {
  try {
    return readText(path.join(root, ...relPath.split('/')));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    errors.push(`${relPath} is missing`);
    return null;
  }
}

/** js/interactions/*.js, sorted by name, each wrapped so top-level names never collide. */
function readInteractions(root) {
  const dir = path.join(root, 'js', 'interactions');
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.js')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
  return names
    .map((n) => `\n// js/interactions/${n}\n;(() => {\n'use strict';\n${readText(path.join(dir, n)).trimEnd()}\n})();\n`)
    .join('');
}

/**
 * The HTML shell. Parts are joined by concatenation, never String.replace, so a `$&`
 * in a slide or script is never read as a replacement pattern.
 */
function renderShell({ title, css, slides, js }) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    `<title>${escapeHtml(title)}</title>`,
    // Without this the browser requests /favicon.ico, which the CSP blocks with a console error.
    '<link rel="icon" href="data:,">',
    '<style>',
    css.trim(),
    '</style>',
    '</head>',
    '<body>',
    '<main class="deck">',
    slides,
    '</main>',
    '<script>',
    js.trim(),
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * Assemble the standalone deck, or one time budget of it.
 * @param {object} [options]
 * @param {string} [options.root] deck root (defaults to the folder holding this file)
 * @param {string} [options.budget] e.g. '20min': apply budgets/20min/ over the base
 * @param {string} [options.outFile] output path (defaults to <root>/build/[<budget>/]index.html)
 * @param {(message: string) => void} [options.warn] receives non-fatal warnings
 * @returns {{outFile: string, chapters: string[], skipped: string[], dropped: string[],
 *   overridden: string[], bytes: number, warnings: string[]}}
 * @throws {BuildError} listing every error; nothing is written in that case
 */
function build(options = {}) {
  const root = path.resolve(options.root ?? __dirname);
  const budget = options.budget ?? null;
  if (budget !== null && !BUDGET_RE.test(budget)) {
    throw new BuildError([`budget "${budget}" must be a number of minutes, e.g. 20min`]);
  }
  const outDir = budget === null ? path.join(root, 'build') : path.join(root, 'build', budget);
  const outFile = path.resolve(options.outFile ?? path.join(outDir, 'index.html'));
  const warnings = [];
  const warn = (message) => {
    warnings.push(message);
    (options.warn ?? ((m) => console.warn(`warning: ${m}`)))(message);
  };
  const errors = [];
  const ctx = (label) => ({ root, label, errors });

  // 1. Chapters, in roadmap order. An unwritten chapter is skipped, not an error. A budget
  //    swaps in its trimmed chunks, then cuts its dropped slides from whatever is built.
  const roadmapText = readRequired(root, 'docs/roadmap.md', errors);
  const roadmap = roadmapText === null ? { title: '', chapters: [], errors: [] } : parseRoadmap(roadmapText);
  errors.push(...roadmap.errors);
  const overlay = budget === null ? NO_OVERLAY : readOverlay(root, budget, roadmap.chapters, errors);
  const built = [];
  const skipped = [];
  const overridden = [];
  const dropped = new Set();
  const chunks = [];
  for (const { topic } of roadmap.chapters) {
    const base = `slides/${topic}.html`;
    const label = overlay.overrides.get(topic) ?? base;
    const file = path.join(root, ...label.split('/'));
    if (!fs.existsSync(file)) {
      skipped.push(topic);
      warn(`chapter "${topic}" has no ${base} yet; skipped`);
      continue;
    }
    built.push(topic);
    if (label !== base) overridden.push(topic);
    let chunk = readText(file);
    if (overlay.drop.size > 0) chunk = dropSlides(chunk, overlay.drop, dropped, label, errors);
    chunks.push(`<!-- ${label} -->\n${inlineHtmlResources(chunk, ctx(label)).trim()}\n`);
  }
  for (const id of overlay.drop) {
    if (!dropped.has(id)) errors.push(`${overlay.label}: dropped slide "${id}" matches no slide in the deck`);
  }

  // 2. Stylesheet, runtime, interactions.
  const css = readRequired(root, 'css/style.css', errors);
  const inlinedCss = css === null ? '' : inlineCssResources(css, ctx('css/style.css'));
  const runtime = readRequired(root, 'js/deck.js', errors) ?? '';
  const js = escapeInlineScript(runtime + readInteractions(root));

  if (errors.length > 0) throw new BuildError(errors);
  const html = renderShell({ title: roadmap.title, css: inlinedCss, slides: chunks.join('\n'), js });
  writeFileAtomic(outFile, html);
  return {
    outFile,
    chapters: built,
    skipped,
    dropped: [...dropped],
    overridden,
    bytes: Buffer.byteLength(html),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Freshness check: "the md is the source of truth"
// ---------------------------------------------------------------------------

// A chunk names the md it was written from and that md's hash at the time.
const SOURCE_HEADER_RE = /<!--\s*source:\s*(\S+)\s+sha256:([0-9a-fA-F]*)\s*-->/;

/** The header a chunk must carry. sha256 over the md's raw bytes, so `shasum -a 256` agrees. */
function sourceHeader(relMd, mdBytes) {
  return `<!-- source: ${relMd} sha256:${crypto.createHash('sha256').update(mdBytes).digest('hex')} -->`;
}

/**
 * Check one chunk's source header against its chapter's md; record any problem in `errors`.
 * @returns {boolean} true when the chunk is fresh
 */
function checkChunk(root, topic, relChunk, errors) {
  const relMd = `docs/${topic}.md`;
  const md = readBytes(path.join(root, 'docs', `${topic}.md`));
  if (md === null) {
    errors.push(`${relChunk} has no ${relMd}; write the md first, it is the source of truth`);
    return false;
  }
  const expected = sourceHeader(relMd, md);
  const header = SOURCE_HEADER_RE.exec(readText(path.join(root, ...relChunk.split('/'))));
  if (!header) {
    errors.push(`${relChunk} has no source header; add ${expected}`);
  } else if (header[1].replace(/^\.\//, '') !== relMd) {
    errors.push(`${relChunk} names source "${header[1]}", expected ${relMd}`);
  } else if (!expected.endsWith(`sha256:${header[2].toLowerCase()} -->`)) {
    errors.push(`${relChunk} is stale: ${relMd} changed since it was written; update the slides, then set ${expected}`);
  } else {
    return true;
  }
  return false;
}

/**
 * Check every roadmap chapter's chunk, and every budget's override chunk, against its md.
 * Writes nothing.
 *
 * Fails on: a chunk whose md is missing, a chunk with no (or the wrong) source header, and a
 * stale chunk whose md changed since it was written. A budget override is a trimmed copy of
 * a chapter's chunk, so it carries the same header and goes stale the same way; an override
 * for a chapter the roadmap does not list fails too. A chapter whose chunk is not written
 * yet is a warning, so a deck stays green between a chapter's md and slides steps;
 * `complete: true` (the final check) turns any missing md or chunk into an error.
 *
 * @param {object} [options]
 * @param {string} [options.root] deck root (defaults to the folder holding this file)
 * @param {boolean} [options.complete] also fail on any chapter without both files
 * @param {(message: string) => void} [options.warn] receives non-fatal warnings
 * @returns {{fresh: string[], missing: string[], overrides: string[], warnings: string[]}}
 *   `fresh` holds topics; `overrides` holds the fresh override chunks' relative paths
 * @throws {BuildError} listing every problem at once
 */
function check(options = {}) {
  const root = path.resolve(options.root ?? __dirname);
  const warnings = [];
  const warn = (message) => {
    warnings.push(message);
    (options.warn ?? ((m) => console.warn(`warning: ${m}`)))(message);
  };
  const errors = [];

  const roadmapText = readRequired(root, 'docs/roadmap.md', errors);
  const roadmap = roadmapText === null ? { chapters: [], errors: [] } : parseRoadmap(roadmapText);
  errors.push(...roadmap.errors);

  const fresh = [];
  const missing = [];
  for (const { topic } of roadmap.chapters) {
    const relChunk = `slides/${topic}.html`;
    if (!fs.existsSync(path.join(root, 'slides', `${topic}.html`))) {
      missing.push(topic);
      const relMd = `docs/${topic}.md`;
      const absent = fs.existsSync(path.join(root, 'docs', `${topic}.md`)) ? relChunk : `${relMd} and ${relChunk}`;
      if (options.complete) errors.push(`chapter "${topic}" has no ${absent}`);
      else warn(`chapter "${topic}" has no ${absent} yet`);
      continue;
    }
    if (checkChunk(root, topic, relChunk, errors)) fresh.push(topic);
  }

  const topics = new Set(roadmap.chapters.map((c) => c.topic));
  const overrides = [];
  for (const budget of listBudgets(root)) {
    for (const [topic, relChunk] of readOverrides(root, budget, topics, errors)) {
      if (checkChunk(root, topic, relChunk, errors)) overrides.push(relChunk);
    }
  }

  if (errors.length > 0) throw new BuildError(errors, 'Check');
  return { fresh, missing, overrides, warnings };
}

/** A file's raw bytes, or null when it does not exist. */
function readBytes(file) {
  try {
    return fs.readFileSync(file);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

const USAGE = 'usage: node build.js [<N>min] | node build.js --check [--complete]';

/** The one thing wrong with the command line, or null. */
function usageProblem(argv) {
  const isCheck = argv.includes('--check');
  const budgets = argv.filter((a) => BUDGET_RE.test(a));
  const unknown = argv.filter((a) => a !== '--check' && a !== '--complete' && !BUDGET_RE.test(a));
  if (unknown.length > 0) return `unknown argument(s): ${unknown.join(' ')}`;
  if (argv.includes('--complete') && !isCheck) return '--complete needs --check';
  if (isCheck && budgets.length > 0) return '--check already covers every budget; give no budget';
  if (budgets.length > 1) return 'give at most one budget';
  return null;
}

function main(argv) {
  const problem = usageProblem(argv);
  if (problem) {
    console.error(`${problem}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (argv.includes('--check')) {
    try {
      const result = check({ complete: argv.includes('--complete') });
      console.log(
        `Checked: ${result.fresh.length} chunk(s) fresh, ${result.overrides.length} budget override(s) fresh, ` +
          `${result.missing.length} chapter(s) not written yet`,
      );
    } catch (err) {
      console.error(err instanceof BuildError ? err.message : err);
      process.exitCode = 1;
    }
    return;
  }
  try {
    const budget = argv.find((a) => BUDGET_RE.test(a));
    const result = build({ budget });
    const kib = (result.bytes / 1024).toFixed(1);
    const trimmed = budget ? `, ${result.dropped.length} slide(s) dropped, ${result.overridden.length} chunk(s) trimmed` : '';
    console.log(`Built ${path.relative(process.cwd(), result.outFile)}: ${result.chapters.length} chapter(s)${trimmed}, ${kib} KiB`);
  } catch (err) {
    console.error(err instanceof BuildError ? err.message : err);
    process.exitCode = 1;
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  build,
  check,
  sourceHeader,
  BuildError,
  CSP,
  parseRoadmap,
  parseBudget,
  dropSlides,
  inlineHtmlResources,
  inlineCssResources,
  escapeInlineScript,
  isExternalUrl,
  writeFileAtomic,
};
