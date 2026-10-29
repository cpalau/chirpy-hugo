#!/usr/bin/env node
/**
 * Gate 4 — HTML parity between the Jekyll oracle and the Hugo build.
 *
 *   node tests/parity/diff.mjs                 # whole site
 *   node tests/parity/diff.mjs /posts/full/    # one page
 *   node tests/parity/diff.mjs --verbose       # every difference, not just the first
 *
 * Raw string comparison is useless: whitespace, attribute order, class order and
 * entity encoding differ between the two renderers without any visual
 * consequence. Both trees are parsed with parse5 and compared structurally.
 *
 * Rules (docs/TESTING.md §6.2):
 *   · comments are dropped;
 *   · whitespace-only text nodes are dropped, runs of whitespace collapse to one
 *     space, and leading/trailing space is trimmed — except inside pre/code;
 *   · attributes are sorted by name, boolean attributes normalized, class token
 *     order normalized;
 *   · entities are decoded by the parser, so both sides compare as characters;
 *   · exemptions live in tests/parity/ignore.yml and must cite a D-xx.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'parse5';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ORACLE = path.join(ROOT, '.out/oracle');
const HUGO = path.join(ROOT, '.out/hugo');
const IGNORE_FILE = path.join(ROOT, 'tests/parity/ignore.yml');

const PRESERVE = new Set(['pre', 'code', 'textarea', 'title']);
const BOOLEAN = new Set(['allowfullscreen', 'async', 'autofocus', 'checked', 'controls', 'defer', 'disabled', 'hidden', 'loop', 'multiple', 'muted', 'nomodule', 'novalidate', 'open', 'readonly', 'required', 'reversed', 'selected']);

// --- ignore.yml (the same deliberately minimal YAML subset used elsewhere) ---

function readIgnore() {
  if (!fs.existsSync(IGNORE_FILE)) return { selectors: [], attributes: [] };
  const lines = fs.readFileSync(IGNORE_FILE, 'utf8').split('\n');
  const out = { selectors: [], attributes: [], tokenClasses: false };
  let section = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line || line.trimStart().startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      if (line === 'selectors:') section = 'selectors';
      else if (line === 'attributes:') section = 'attributes';
      else section = null;
      continue;
    }
    if (/^token_classes:\s*true/.test(line)) {
      out.tokenClasses = true;
      continue;
    }
    if (!section) continue;
    const m = line.match(/^\s+-\s+(.+?)\s*$/);
    if (!m) continue;
    const value = m[1].replace(/^["']|["']$/g, '');
    if (section === 'selectors') {
      // "selector | D-xx | reason"
      const [selector, id, ...rest] = value.split('|').map((s) => s.trim());
      out.selectors.push({ selector, id, reason: rest.join(' | ') });
    } else {
      const [name, id, ...rest] = value.split('|').map((s) => s.trim());
      out.attributes.push({ name, id, reason: rest.join(' | ') });
    }
  }
  return out;
}

/** Tiny selector matcher: tag, #id, .class, [attr], [attr=value], and compounds. */
function matches(node, selector) {
  const parts = selector.split(/\s+(?![^\[]*\])/);
  if (parts.length > 1) {
    if (!matches(node, parts[parts.length - 1])) return false;
    let parent = node.parentNode;
    let i = parts.length - 2;
    while (parent && i >= 0) {
      if (matches(parent, parts[i])) i -= 1;
      parent = parent.parentNode;
    }
    return i < 0;
  }
  const nth = selector.match(/:nth-of-type\((\d+)\)/);
  if (nth) {
    const wanted = Number(nth[1]);
    const parent = node.parentNode;
    if (!parent) return false;
    const sameTag = (parent.childNodes || []).filter((n) => n.tagName === node.tagName);
    if (sameTag.indexOf(node) + 1 !== wanted) return false;
    selector = selector.replace(/:nth-of-type\(\d+\)/, '');
  }
  const compound = selector.split(/(?=[.[#])/);
  return compound.every((part) => {
    if (part.startsWith('#')) return attr(node, 'id') === part.slice(1);
    if (part.startsWith('.')) return (attr(node, 'class') || '').split(/\s+/).includes(part.slice(1));
    if (part.startsWith('[')) {
      const m = part.match(/^\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]$/);
      if (!m) return false;
      const value = attr(node, m[1]);
      return m[2] === undefined ? value !== null : value === m[2];
    }
    return node.tagName === part;
  });
}

function attr(node, name) {
  const a = node.attrs?.find((x) => x.name === name);
  return a ? a.value : null;
}

// --- canonicalization ---

function canonicalize(node, ignore, inherited = false, inRougeCode = false) {
  const tag = node.tagName;
  const preserve = inherited || PRESERVE.has(tag);
  const rouge = inRougeCode || (attr(node, 'class') || '').split(/\s+/).includes('rouge-code');

  if (node.nodeName === '#comment') return null;

  if (node.nodeName === '#text') {
    let value = node.value;
    value = preserve ? value : value.replace(/\s+/g, ' ');
    if (!preserve) value = value.trim();
    if (!value) return null;
    return { text: value };
  }

  if (node.nodeName !== 'html' && node.nodeName !== '#document' && !tag) {
    const children = (node.childNodes || []).map((c) => canonicalize(c, ignore, preserve)).filter(Boolean);
    return { tag: node.nodeName, attrs: [], children, preserve };
  }

  if (tag && ignore.selectors.some((s) => matches(node, s.selector))) return null;

  const attrs = (node.attrs || [])
    .filter((a) => !ignore.attributes.some((x) => x.name === a.name))
    .filter((a) => !(ignore.tokenClasses && rouge && tag === 'span' && a.name === 'class'))
    .map((a) => {
      let value = a.value;
      if (a.name === 'class') value = value.split(/\s+/).filter(Boolean).sort().join(' ');
      if (BOOLEAN.has(a.name)) value = '';
      return [a.name, value];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  let children = (node.childNodes || [])
    .map((c) => canonicalize(c, ignore, preserve, rouge))
    .filter(Boolean);

  // Go's html/template escapes JS strings (\/, \u003c, \u0022 …). Those are
  // the same JavaScript value, so script and style text is compared semantically.
  if (tag === 'script' || tag === 'style') {
    children = children.map((c) => {
      if (c.text === undefined) return c;
      let v = c.text
        .replace(/\\\//g, '/')
        .replace(/\\u003c/gi, '<')
        .replace(/\\u003e/gi, '>')
        .replace(/\\u0022/gi, '"')
        .replace(/\\u0026/gi, '&')
        .replace(/\\u0027/gi, "'")
        .replace(/\\'/g, "'");
      return { text: v.replace(/\s+/g, ' ').trim() };
    });
  }

  return { tag: tag || node.nodeName, attrs, children, preserve };
}

// --- diff ---

function signature(node) {
  if (node.text !== undefined) return `text(${JSON.stringify(node.text.slice(0, 60))})`;
  const attrs = node.attrs.map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(' ');
  return attrs ? `${node.tag} ${attrs}` : node.tag;
}

function diffNodes(a, b, pathLabel, out, limit) {
  if (out.length >= limit) return;
  if (Boolean(a.text) !== Boolean(b.text)) {
    out.push({ path: pathLabel, kind: 'node-type', oracle: signature(a), hugo: signature(b) });
    return;
  }
  if (a.text !== undefined) {
    if (a.text !== b.text) out.push({ path: pathLabel, kind: 'text', oracle: a.text, hugo: b.text });
    return;
  }
  if (a.tag !== b.tag) {
    out.push({ path: pathLabel, kind: 'tag', oracle: a.tag, hugo: b.tag });
    return;
  }
  const attrsA = new Map(a.attrs);
  const attrsB = new Map(b.attrs);
  for (const [name, value] of attrsA) {
    if (!attrsB.has(name)) out.push({ path: `${pathLabel}@${name}`, kind: 'attr-missing', oracle: `${name}="${value}"`, hugo: '—' });
    else if (attrsB.get(name) !== value) out.push({ path: `${pathLabel}@${name}`, kind: 'attr-value', oracle: value, hugo: attrsB.get(name) });
  }
  for (const [name, value] of attrsB) {
    if (!attrsA.has(name)) out.push({ path: `${pathLabel}@${name}`, kind: 'attr-extra', oracle: '—', hugo: `${name}="${value}"` });
  }

  const max = Math.max(a.children.length, b.children.length);
  for (let i = 0; i < max; i += 1) {
    const childA = a.children[i];
    const childB = b.children[i];
    const label = `${pathLabel} > ${childA ? signature(childA) : childB ? signature(childB) : '?'}[${i}]`;
    if (!childA) {
      out.push({ path: label, kind: 'extra', oracle: '—', hugo: signature(childB) });
    } else if (!childB) {
      out.push({ path: label, kind: 'missing', oracle: signature(childA), hugo: '—' });
    } else {
      diffNodes(childA, childB, label, out, limit);
    }
    if (out.length >= limit) return;
  }
}

// --- site walking ---

function pages(dir) {
  const out = [];
  const walk = (current, rel = '') => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(current, entry.name), next);
      else if (entry.name === 'index.html') out.push(next === 'index.html' ? '/' : `/${rel}/`);
    }
  };
  walk(dir);
  return out.sort();
}

const fileFor = (root, url) => path.join(root, url.replace(/^\//, ''), 'index.html');

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const only = args.filter((a) => !a.startsWith('--'));
  const ignore = readIgnore();

  if (!fs.existsSync(ORACLE) || !fs.existsSync(HUGO)) {
    console.error('missing builds; run tests/oracle/build.sh and the Hugo build first');
    process.exit(2);
  }

  // Pagination URL shapes differ (D-13): map oracle /pageN/ to Hugo /page/N/.
  const mapHugo = (url) => url.replace(/^\/page(\d+)\//, '/page/$1/');

  const oraclePages = pages(ORACLE).filter((u) => !only.length || only.includes(u));
  const hugoSet = new Set(pages(HUGO).map(mapHugo));

  let withDiffs = 0;
  let totalDiffs = 0;
  const summary = [];

  for (const url of oraclePages) {
    const hugoURL = mapHugo(url);
    const file = fileFor(HUGO, hugoURL);
    if (!hugoSet.has(hugoURL) || !fs.existsSync(file)) {
      summary.push({ url, diffs: -1, note: 'missing in the Hugo build' });
      withDiffs += 1;
      continue;
    }

    const treeA = canonicalize(parse(fs.readFileSync(fileFor(ORACLE, url), 'utf8')), ignore);
    const treeB = canonicalize(parse(fs.readFileSync(file, 'utf8')), ignore);

    const out = [];
    diffNodes(treeA, treeB, url, out, verbose ? 10_000 : 6);
    if (out.length) {
      withDiffs += 1;
      totalDiffs += out.length;
      summary.push({ url, diffs: out.length, details: out });
    } else {
      summary.push({ url, diffs: 0 });
    }
  }

  for (const row of summary) {
    if (row.diffs === 0) {
      console.log(`  ok    ${row.url}`);
      continue;
    }
    console.log(`  DIFF  ${row.url}  ${row.diffs < 0 ? row.note : `${row.diffs} difference(s)`}`);
    for (const d of row.details ?? []) {
      console.log(`          ${d.kind.padEnd(12)} ${d.path}`);
      console.log(`            oracle: ${String(d.oracle).slice(0, 160)}`);
      console.log(`            hugo:   ${String(d.hugo).slice(0, 160)}`);
    }
  }

  console.log(`\n${summary.length} page(s): ${summary.length - withDiffs} identical, ${withDiffs} with differences`);
  if (ignore.selectors.length || ignore.attributes.length) {
    for (const s of ignore.selectors) console.log(`  ignore selector ${s.selector} (${s.id})`);
    for (const a of ignore.attributes) console.log(`  ignore attribute ${a.name} (${a.id})`);
  }
  process.exit(withDiffs === 0 ? 0 : 1);
}

main();
