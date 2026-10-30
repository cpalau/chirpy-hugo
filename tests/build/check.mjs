#!/usr/bin/env node
/**
 * Gate 1 — build integrity.
 *
 *   node tests/build/check.mjs [build-dir] [oracle-dir]
 *
 * Proves three things about a finished build:
 *
 *   1. every URL the Jekyll original publishes also exists here, except the
 *      declared divergences (the Dart Sass source map, and `/pageN/` which
 *      Hugo emits as `/page/N/`, D-14);
 *   2. nothing unexpected is published outside the declared extras (the two
 *      extra CSS themes from D-13, the JS bundles published under `dist/`, and
 *      the `/posts/` section listing Hugo adds);
 *   3. no published text file still contains Liquid or front matter. That is
 *      the class of bug that shipped `mathjax.js` and `site.webmanifest` as raw
 *      Liquid: the build succeeds, the file is served, and the feature is dead.
 *
 * Warning-free compilation is enforced separately by `--panicOnWarning` in CI.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BUILD = path.resolve(ROOT, process.argv[2] ?? '.out/hugo');
const ORACLE = path.resolve(ROOT, process.argv[3] ?? '.out/oracle');

// Declared divergences, with the D-id that explains them.
const ORACLE_ONLY = [
  { pattern: /^assets\/css\/.+\.css\.map$/, why: 'source map: a Jekyll dev artifact' },
  { pattern: /^page\d+\/index\.html$/, why: 'D-14: Jekyll /pageN/, Hugo /page/N/' },
];
const BUILD_ONLY = [
  { pattern: /^page\/\d+\/index\.html$/, why: 'D-14: Hugo pagination shape' },
  { pattern: /^posts\/index\.html$/, why: 'Hugo section listing; Jekyll has no /posts/ page' },
  { pattern: /^assets\/css\/jekyll-theme-chirpy-(light|dark)\.css$/, why: 'D-13: light/dark variants' },
  { pattern: /^assets\/js\/dist\/(app|sw)\.min\.js$/, why: 'D-10: bundles published under dist/ as well as the root' },
];

// Files the theme must publish, independent of the fixture.
const REQUIRED = [
  'index.html',
  '404.html',
  'feed.xml',
  'sitemap.xml',
  'robots.txt',
  'assets/js/data/search.json',
  'assets/js/data/swconf.js',
  'assets/js/data/mathjax.js',
  'assets/css/jekyll-theme-chirpy.css',
  'assets/img/favicons/favicon.ico',
  'assets/img/favicons/site.webmanifest',
  'sw.min.js',
  'app.min.js',
];

// Text formats where a leftover `{% ... %}` or `{{ ... }}` is always a bug.
const LIQUID_EXTS = new Set(['.html', '.xml', '.json', '.webmanifest', '.txt', '.css', '.js']);

const walk = (root) => {
  const out = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(abs);
      else out.push(path.relative(root, abs));
    }
  };
  visit(root);
  return out;
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

// 1 + 2. File set, compared with the oracle when it is available.

if (fs.existsSync(ORACLE)) {
  const oracle = new Set(walk(ORACLE));
  const build = new Set(walk(BUILD));

  const missing = [...oracle].filter(
    (file) => !build.has(file) && !ORACLE_ONLY.some((rule) => rule.pattern.test(file)),
  );
  const extra = [...build].filter(
    (file) => !oracle.has(file) && !BUILD_ONLY.some((rule) => rule.pattern.test(file)),
  );

  if (missing.length) {
    fail(`${missing.length} URL(s) Jekyll publishes are missing`);
    for (const file of missing.slice(0, 10)) console.error(`          ${file}`);
  } else {
    console.log(`  ok    every Jekyll URL exists (${oracle.size} files)`);
  }

  if (extra.length) {
    fail(`${extra.length} undeclared extra file(s)`);
    for (const file of extra.slice(0, 10)) console.error(`          ${file}`);
  } else {
    console.log(`  ok    no undeclared extra files (${build.size} files)`);
  }
} else {
  console.log('  skip  file-set comparison: no oracle build present');
}

// 3. Required outputs.

const missingRequired = REQUIRED.filter((file) => !fs.existsSync(path.join(BUILD, file)));
if (missingRequired.length) {
  for (const file of missingRequired) fail(`required file missing: ${file}`);
} else {
  console.log(`  ok    ${REQUIRED.length} required outputs present`);
}

// 4. Liquid residue and empty files.

let residue = 0;
let empty = 0;
for (const file of walk(BUILD)) {
  const abs = path.join(BUILD, file);
  const size = fs.statSync(abs).size;
  if (size === 0) {
    empty += 1;
    fail(`empty file: ${file}`);
    continue;
  }
  if (!LIQUID_EXTS.has(path.extname(file))) continue;
  const text = fs.readFileSync(abs, 'utf8');
  if (text.startsWith('---\n') || /\{%-?\s*\w/.test(text) || /\{\{\s*[\w.$]/.test(text)) {
    residue += 1;
    fail(`unprocessed template syntax in ${file}`);
  }
}
if (!residue) console.log('  ok    no Liquid or front matter in published files');
if (!empty) console.log('  ok    no empty files');

console.log(failures ? `\n${failures} build failure(s)` : '\nbuild integrity verified');
process.exit(failures ? 1 : 0);
