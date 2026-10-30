#!/usr/bin/env node
/**
 * Gate 2 — HTML validity, links and anchors.
 *
 *   node tests/html/check.mjs [build-dir] [oracle-dir]
 *
 * Upstream Chirpy does not emit spec-perfect HTML (`<code><table>` for the
 * Rouge gutter, icon-only buttons, lowercase doctype). Demanding a clean
 * validator report would therefore fail on the Jekyll original too, and fixing
 * it would break Gate 4. The gate is comparative instead:
 *
 *   1. every page that exists on both sides may not have *more* validation
 *      violations than Jekyll's version, per rule;
 *   2. every internal link and every fragment must resolve. That is strictly
 *      ours: it catches a renamed id after a render-hook change, which neither
 *      the pixel gate nor the DOM gate can see.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { HtmlValidate } from 'html-validate';
import { parse } from 'parse5';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BUILD = path.resolve(ROOT, process.argv[2] ?? '.out/hugo');
const ORACLE = path.resolve(ROOT, process.argv[3] ?? '.out/oracle');

const htmlvalidate = new HtmlValidate({
  extends: ['html-validate:recommended'],
  // Template formatting only; Gate 4 ignores it, and Jekyll's compressed
  // output has none, so it would always look like a regression.
  rules: {
    'no-trailing-whitespace': 'off',
    // Goldmark's passthrough keeps `&` inside display math verbatim; kramdown
    // writes `&amp;`. The parsed text is identical (Gate 4 proves it) and
    // MathJax reads textContent.
    'no-raw-characters': 'off',
  },
});

const walk = (dir, root = dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, root, acc);
    else if (entry.name.endsWith('.html')) acc.push(path.relative(root, abs));
  }
  return acc;
};

const violations = async (root, page) => {
  const report = await htmlvalidate.validateFile(path.join(root, page));
  const counts = {};
  for (const result of report.results) {
    for (const message of result.messages) {
      counts[message.ruleId] = (counts[message.ruleId] ?? 0) + 1;
    }
  }
  return counts;
};

if (!fs.existsSync(BUILD)) {
  console.error(`missing build in ${BUILD}`);
  process.exit(2);
}

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};

const pages = walk(BUILD).sort();
const oraclePages = fs.existsSync(ORACLE) ? new Set(walk(ORACLE)) : null;

let compared = 0;
let worse = 0;
for (const page of pages) {
  if (!oraclePages || !oraclePages.has(page)) continue;
  compared += 1;
  const [ours, theirs] = await Promise.all([violations(BUILD, page), violations(ORACLE, page)]);
  for (const [rule, count] of Object.entries(ours)) {
    if (count > (theirs[rule] ?? 0)) {
      worse += 1;
      fail(`${page}: ${rule} ${count} time(s), Jekyll ${theirs[rule] ?? 0}`);
    }
  }
}
if (!worse) {
  console.log(`  ok    ${compared} shared pages: no validation rule worse than Jekyll`);
  if (oraclePages && pages.length > compared) {
    console.log(`        ${pages.length - compared} page(s) exist only in Hugo; not compared`);
  }
}

// --- links and anchors -----------------------------------------------------

const exists = (url) => {
  const clean = decodeURIComponent(url.split('?')[0].split('#')[0]);
  const rel = clean.replace(/^\//, '');
  const candidates = [
    path.join(BUILD, rel),
    path.join(BUILD, rel, 'index.html'),
    path.join(BUILD, `${rel}.html`),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
};

const idsOf = (document) => {
  const ids = new Set();
  const visit = (node) => {
    const id = node.attrs?.find((a) => a.name === 'id')?.value;
    if (id) ids.add(id);
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(document);
  return ids;
};

const refsOf = (document) => {
  const refs = [];
  const visit = (node) => {
    for (const attr of node.attrs ?? []) {
      if (attr.name === 'href' || attr.name === 'src') refs.push(attr.value);
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(document);
  return refs;
};

let broken = 0;
for (const page of pages) {
  const document = parse(fs.readFileSync(path.join(BUILD, page), 'utf8'));
  const ids = idsOf(document);
  for (const ref of refsOf(document)) {
    if (!ref || ref.startsWith('http:') || ref.startsWith('https:') || ref.startsWith('//')) continue;
    if (ref.startsWith('mailto:') || ref.startsWith('javascript:') || ref.startsWith('data:')) continue;
    if (ref.startsWith('#')) {
      const id = decodeURIComponent(ref.slice(1));
      if (id && !ids.has(id)) {
        broken += 1;
        fail(`${page}: fragment #${id} does not exist`);
      }
      continue;
    }
    if (ref.startsWith('/') && !exists(ref)) {
      broken += 1;
      fail(`${page}: internal URL ${ref} does not resolve`);
    }
  }
}
if (!broken) console.log('  ok    every internal link and fragment resolves');

console.log(failures ? `\n${failures} HTML failure(s)` : '\nHTML verified');
process.exit(failures ? 1 : 0);
