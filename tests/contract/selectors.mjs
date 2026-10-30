#!/usr/bin/env node
/**
 * Gate 3 — DOM ↔ JavaScript contract.
 *
 *   node tests/contract/selectors.mjs [build-dir]
 *
 * Upstream's JavaScript ships unmodified, so it addresses the page through a
 * fixed set of ids, classes and attributes. Renaming one of them does not fail
 * Gate 4 (Jekyll would have the same name) — it fails here, which is the point.
 *
 * The selector list lives in `tests/contract/selectors.yml` and was derived
 * from the bundles (`getElementById`, `getElementsByClassName`,
 * `querySelector`). The matcher implements the small subset documented there;
 * it is not a CSS engine.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'parse5';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BUILD = path.resolve(ROOT, process.argv[2] ?? '.out/hugo');
const CONTRACT = path.join(ROOT, 'tests/contract/selectors.yml');

// --- YAML (the tiny subset this file uses) ---------------------------------

function readContract(source) {
  const pages = {};
  let current = null;
  for (const line of source.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const page = /^  (\/\S*):\s*$/.exec(line);
    if (page) {
      current = page[1];
      pages[current] = [];
      continue;
    }
    const item = /^    - "?(.+?)"?\s*$/.exec(line);
    if (item && current) pages[current].push(item[1].replace(/\\"/g, '"'));
  }
  return pages;
}

// --- selector matcher ------------------------------------------------------

function parseCompound(text) {
  const compound = { tag: null, id: null, classes: [], attrs: [] };
  const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]|(\*)/g;
  let match;
  let consumed = 0;
  while ((match = re.exec(text))) {
    if (match.index !== consumed) throw new Error(`bad selector: ${text}`);
    consumed = re.lastIndex;
    if (match[1]) compound.tag = match[1].toLowerCase();
    else if (match[2]) compound.id = match[2];
    else if (match[3]) compound.classes.push(match[3]);
    else if (match[4]) compound.attrs.push({ name: match[4], value: match[5] });
    else if (match[6]) compound.tag = null;
  }
  if (consumed !== text.length) throw new Error(`bad selector: ${text}`);
  return compound;
}

function parseSelector(selector) {
  const parts = [];
  const tokens = selector.replace(/\s*>\s*/g, ' > ').split(/\s+/).filter(Boolean);
  let combinator = ' ';
  for (const token of tokens) {
    if (token === '>') {
      combinator = '>';
      continue;
    }
    parts.push({ compound: parseCompound(token), combinator });
    combinator = ' ';
  }
  return parts;
}

const attrOf = (node, name) => node.attrs?.find((a) => a.name === name)?.value;

function matches(node, compound) {
  if (!node.tagName) return false;
  if (compound.tag && node.tagName !== compound.tag) return false;
  if (compound.id && attrOf(node, 'id') !== compound.id) return false;
  const classes = (attrOf(node, 'class') ?? '').split(/\s+/).filter(Boolean);
  if (compound.classes.some((c) => !classes.includes(c))) return false;
  for (const { name, value } of compound.attrs) {
    const actual = attrOf(node, name);
    if (actual === undefined) return false;
    if (value !== undefined && actual !== value) return false;
  }
  return true;
}

function elements(root) {
  const out = [];
  const walk = (node) => {
    if (node.tagName) out.push(node);
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(root);
  return out;
}

function matchesSelector(root, selector) {
  const parts = parseSelector(selector);
  const last = parts.at(-1).compound;
  const parents = (node) => {
    const chain = [];
    let current = node.parentNode;
    while (current) {
      if (current.tagName) chain.push(current);
      current = current.parentNode;
    }
    return chain;
  };
  return elements(root).some((node) => {
    if (!matches(node, last)) return false;
    let ancestors = parents(node);
    for (let i = parts.length - 2; i >= 0; i -= 1) {
      // The combinator lives on the part to the right; the compound to match
      // is the part to the left.
      const { combinator } = parts[i + 1];
      const target = parts[i].compound;
      if (combinator === '>') {
        if (!ancestors.length || !matches(ancestors[0], target)) return false;
        ancestors = ancestors.slice(1);
      } else {
        const index = ancestors.findIndex((a) => matches(a, target));
        if (index < 0) return false;
        ancestors = ancestors.slice(index + 1);
      }
    }
    return true;
  });
}

// --- run -------------------------------------------------------------------

if (!fs.existsSync(BUILD)) {
  console.error(`missing build in ${BUILD}: build the fixture site first`);
  process.exit(2);
}

const pages = readContract(fs.readFileSync(CONTRACT, 'utf8'));
let failures = 0;

for (const [url, selectors] of Object.entries(pages)) {
  const file = path.join(BUILD, url === '/' ? 'index.html' : `${url.replace(/^\//, '').replace(/\/$/, '')}/index.html`);
  if (!fs.existsSync(file)) {
    console.error(`  FAIL  ${url}: page not built (${path.relative(ROOT, file)})`);
    failures += 1;
    continue;
  }
  const document = parse(fs.readFileSync(file, 'utf8'));
  const missing = selectors.filter((selector) => !matchesSelector(document, selector));
  if (missing.length) {
    failures += missing.length;
    for (const selector of missing) console.error(`  FAIL  ${url} does not match "${selector}"`);
  } else {
    console.log(`  ok    ${url} (${selectors.length} selectors)`);
  }
}

console.log(failures ? `\n${failures} contract failure(s)` : '\nDOM contract satisfied');
process.exit(failures ? 1 : 0);

