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
 *
 * Usage: node build.js                      build the deck
 *        node build.js --check [--complete] check chunks are fresh against their md; writes nothing
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
 * Read the deck title and chapter order from docs/roadmap.md.
 *
 * Title: the first `# ` heading. Chapters: the first ordered list under `## Chapters`,
 * one `[Title](<topic>.md)` link per item. Headings inside ``` fences are ignored.
 *
 * @returns {{title: string, chapters: {title: string, topic: string}[], errors: string[]}}
 */
function parseRoadmap(text, label = 'docs/roadmap.md') {
  const errors = [];
  let title = '';
  let inFence = false;
  let section = null; // the current `## ` heading's text
  let listState = 'before'; // before → in → after: only the first list counts
  let foundSection = false;
  const chapters = [];

  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;

    // A closing `#` run only counts after a space, so "Intro to C#" keeps its '#'.
    const heading = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
    if (heading) {
      if (heading[1] === '#' && !title) title = heading[2];
      if (heading[1].length <= 2) section = heading[1] === '##' ? heading[2] : null;
      if (section !== null && /^chapters$/i.test(section)) foundSection = true;
      continue;
    }
    if (section === null || !/^chapters$/i.test(section) || listState === 'after') continue;

    const item = /^\d+[.)]\s+(.*)$/.exec(line);
    if (item) {
      listState = 'in';
      const link = /\[([^\]]+)\]\(\s*(?:\.\/)?([^)\s]+)\.md\s*\)/.exec(item[1]);
      if (!link) {
        errors.push(`${label}:${i + 1}: chapter item needs a [Title](<topic>.md) link`);
      } else if (!TOPIC_RE.test(link[2])) {
        errors.push(`${label}:${i + 1}: chapter topic "${link[2]}" must be lowercase kebab-case`);
      } else if (chapters.some((c) => c.topic === link[2])) {
        errors.push(`${label}:${i + 1}: chapter "${link[2]}" is listed twice`);
      } else {
        chapters.push({ title: link[1].trim(), topic: link[2] });
      }
    } else if (listState === 'in' && line.trim() !== '' && !/^\s/.test(line)) {
      listState = 'after'; // a non-indented, non-item line ends the list
    }
  }

  if (!title) errors.push(`${label}: no "# " title heading`);
  if (!foundSection) errors.push(`${label}: no "## Chapters" section`);
  else if (chapters.length === 0 && errors.length === 0) {
    errors.push(`${label}: the "## Chapters" section has no ordered list of [Title](<topic>.md) links`);
  }
  return { title, chapters, errors };
}

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
 * Assemble the standalone deck.
 * @param {object} [options]
 * @param {string} [options.root] deck root (defaults to the folder holding this file)
 * @param {string} [options.outFile] output path (defaults to <root>/build/index.html)
 * @param {(message: string) => void} [options.warn] receives non-fatal warnings
 * @returns {{outFile: string, chapters: string[], skipped: string[], bytes: number, warnings: string[]}}
 * @throws {BuildError} listing every error; nothing is written in that case
 */
function build(options = {}) {
  const root = path.resolve(options.root ?? __dirname);
  const outFile = path.resolve(options.outFile ?? path.join(root, 'build', 'index.html'));
  const warnings = [];
  const warn = (message) => {
    warnings.push(message);
    (options.warn ?? ((m) => console.warn(`warning: ${m}`)))(message);
  };
  const errors = [];
  const ctx = (label) => ({ root, label, errors });

  // 1. Chapters, in roadmap order. An unwritten chapter is skipped, not an error.
  const roadmapText = readRequired(root, 'docs/roadmap.md', errors);
  const roadmap = roadmapText === null ? { title: '', chapters: [], errors: [] } : parseRoadmap(roadmapText);
  errors.push(...roadmap.errors);
  const built = [];
  const skipped = [];
  const chunks = [];
  for (const { topic } of roadmap.chapters) {
    const label = `slides/${topic}.html`;
    const file = path.join(root, 'slides', `${topic}.html`);
    if (!fs.existsSync(file)) {
      skipped.push(topic);
      warn(`chapter "${topic}" has no ${label} yet; skipped`);
      continue;
    }
    built.push(topic);
    chunks.push(`<!-- ${label} -->\n${inlineHtmlResources(readText(file), ctx(label)).trim()}\n`);
  }

  // 2. Stylesheet, runtime, interactions.
  const css = readRequired(root, 'css/style.css', errors);
  const inlinedCss = css === null ? '' : inlineCssResources(css, ctx('css/style.css'));
  const runtime = readRequired(root, 'js/deck.js', errors) ?? '';
  const js = escapeInlineScript(runtime + readInteractions(root));

  if (errors.length > 0) throw new BuildError(errors);
  const html = renderShell({ title: roadmap.title, css: inlinedCss, slides: chunks.join('\n'), js });
  writeFileAtomic(outFile, html);
  return { outFile, chapters: built, skipped, bytes: Buffer.byteLength(html), warnings };
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
 * Check every roadmap chapter's chunk against its md. Writes nothing.
 *
 * Fails on: a chunk whose md is missing, a chunk with no (or the wrong) source header, and a
 * stale chunk whose md changed since it was written. A chapter whose chunk is not written
 * yet is a warning, so a deck stays green between a chapter's md and slides steps;
 * `complete: true` (the final check) turns any missing md or chunk into an error.
 *
 * @param {object} [options]
 * @param {string} [options.root] deck root (defaults to the folder holding this file)
 * @param {boolean} [options.complete] also fail on any chapter without both files
 * @param {(message: string) => void} [options.warn] receives non-fatal warnings
 * @returns {{fresh: string[], missing: string[], warnings: string[]}}
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
    const relMd = `docs/${topic}.md`;
    const relChunk = `slides/${topic}.html`;
    const md = readBytes(path.join(root, 'docs', `${topic}.md`));
    const chunk = readBytes(path.join(root, 'slides', `${topic}.html`));

    if (chunk === null) {
      missing.push(topic);
      const absent = md === null ? `${relMd} and ${relChunk}` : relChunk;
      if (options.complete) errors.push(`chapter "${topic}" has no ${absent}`);
      else warn(`chapter "${topic}" has no ${absent} yet`);
      continue;
    }
    if (md === null) {
      errors.push(`${relChunk} has no ${relMd}; write the md first, it is the source of truth`);
      continue;
    }

    const expected = sourceHeader(relMd, md);
    const header = SOURCE_HEADER_RE.exec(chunk.toString('utf8'));
    if (!header) {
      errors.push(`${relChunk} has no source header; add ${expected}`);
    } else if (header[1].replace(/^\.\//, '') !== relMd) {
      errors.push(`${relChunk} names source "${header[1]}", expected ${relMd}`);
    } else if (!expected.endsWith(`sha256:${header[2].toLowerCase()} -->`)) {
      errors.push(`${relChunk} is stale: ${relMd} changed since it was written; update the slides, then set ${expected}`);
    } else {
      fresh.push(topic);
    }
  }

  if (errors.length > 0) throw new BuildError(errors, 'Check');
  return { fresh, missing, warnings };
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

const USAGE = 'usage: node build.js | node build.js --check [--complete]';

function main(argv) {
  const unknown = argv.filter((a) => a !== '--check' && a !== '--complete');
  if (unknown.length > 0 || (argv.includes('--complete') && !argv.includes('--check'))) {
    console.error(`${unknown.length ? `unknown argument(s): ${unknown.join(' ')}` : '--complete needs --check'}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (argv.includes('--check')) {
    try {
      const result = check({ complete: argv.includes('--complete') });
      console.log(`Checked: ${result.fresh.length} chunk(s) fresh, ${result.missing.length} chapter(s) not written yet`);
    } catch (err) {
      console.error(err instanceof BuildError ? err.message : err);
      process.exitCode = 1;
    }
    return;
  }
  try {
    const result = build();
    const kib = (result.bytes / 1024).toFixed(1);
    console.log(`Built ${path.relative(process.cwd(), result.outFile)}: ${result.chapters.length} chapter(s), ${kib} KiB`);
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
  inlineHtmlResources,
  inlineCssResources,
  escapeInlineScript,
  isExternalUrl,
  writeFileAtomic,
};
