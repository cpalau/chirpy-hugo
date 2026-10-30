#!/usr/bin/env node
/**
 * Configuration contract check.
 *
 *   node scripts/check-config.mjs
 *
 * Proves the two things a theme user depends on:
 *
 *   1. every `params.*` the templates read has a default in
 *      `config/_default/params.toml` (Hugo deep-merges `params`, so a site with
 *      an empty table must still work);
 *   2. the settings Hugo does **not** merge are declared by the theme and
 *      documented: `markup` (unsafe, attribute lists, classes), the five home
 *      outputs, and the minimum Hugo version.
 *
 * The TOML reader is deliberately small: the theme's own files, not arbitrary
 * user input.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONFIG = path.join(ROOT, 'config/_default');

function readToml(file) {
  const data = {};
  let table = data;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section) {
      table = data;
      for (const key of section[1].split('.')) {
        const clean = key.replaceAll('"', '');
        table[clean] ??= {};
        table = table[clean];
      }
      continue;
    }
    const pair = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line);
    if (!pair) continue;
    const value = pair[2].replace(/\s+#.*$/, '').trim();
    if (value === '{}' || value === '') {
      table[pair[1]] ??= {};
    } else {
      table[pair[1]] = value;
    }
  }
  return data;
}

function layoutFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) layoutFiles(abs, acc);
    else if (entry.name.endsWith('.html')) acc.push(abs);
  }
  return acc;
}

const params = readToml(path.join(CONFIG, 'params.toml'));
const hugo = readToml(path.join(CONFIG, 'hugo.toml'));
const markup = readToml(path.join(CONFIG, 'markup.toml'));

const has = (object, dotted) =>
  dotted.split('.').every((key) => {
    if (object == null || typeof object !== 'object') return false;
    object = object[key];
    return object !== undefined;
  });

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};

// 1. Every params path read by a template has a default.
const used = new Set();
for (const file of layoutFiles(path.join(ROOT, 'layouts'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\.Site\.Params\.([A-Za-z0-9_.]+)/g)) {
    used.add(match[1].replace(/\.$/, ''));
  }
  for (const match of source.matchAll(/\$params\.([A-Za-z0-9_.]+)/g)) {
    used.add(match[1].replace(/\.$/, ''));
  }
}

const missing = [...used].filter((key) => !has(params, key) && !has(params, key.split('.')[0]));
if (missing.length) {
  for (const key of missing.sort()) fail(`no default for "${key}" in config/_default/params.toml`);
} else {
  console.log(`  ok    ${used.size} parameter path(s) read by templates have a default`);
}

// 2. Mandatory settings that do not merge from a theme (D-07).
const mandatory = [
  ['markup.goldmark.renderer.unsafe', markup, 'markup.toml'],
  ['markup.goldmark.parser.attribute.block', markup, 'markup.toml'],
  ['markup.highlight.noClasses', markup, 'markup.toml'],
  ['outputs.home', hugo, 'hugo.toml'],
  ['outputFormats.search', hugo, 'hugo.toml'],
  ['outputFormats.feed', hugo, 'hugo.toml'],
  ['outputFormats.swconf', hugo, 'hugo.toml'],
  ['outputFormats.manifest', hugo, 'hugo.toml'],
  ['module.hugoVersion.min', hugo, 'module.toml'],
];

let missingMandatory = 0;
for (const [key, tree, file] of mandatory) {
  const found =
    has(tree, key) ||
    has(readToml(path.join(CONFIG, 'module.toml')), key) ||
    has(readToml(path.join(CONFIG, file)), key);
  if (!found) {
    missingMandatory += 1;
    fail(`mandatory setting "${key}" is not declared`);
  }
}
if (!missingMandatory) console.log(`  ok    ${mandatory.length} mandatory settings declared`);

// 3. Documented.
const doc = fs.readFileSync(path.join(ROOT, 'docs/CONFIG.md'), 'utf8');
const undocumented = [];
for (const key of used) {
  const segments = key.split('.');
  const root = segments[0];
  const leaf = segments.at(-1);
  const documented =
    doc.includes(key) ||
    doc.includes(`params.${key}`) ||
    // CONFIG uses tables per section (`params.comments` + `disqus.shortname`),
    // so a leaf mentioned under its root counts as documented.
    (doc.includes(`params.${root}`) && doc.includes(leaf));
  if (!documented) undocumented.push(key);
}
if (undocumented.length) {
  for (const key of undocumented.sort()) fail(`"${key}" is read but not documented in docs/CONFIG.md`);
} else {
  console.log(`  ok    every parameter read by templates is documented`);
}

// 4. Every partial a template names exists. A literal name is checked directly;
//    the providers dispatched from configuration (`analytics/<name>.html`,
//    `comments/<provider>.html`) are checked against the defaults, because a
//    missing one only fails when a user enables that provider.
const partials = new Set(
  layoutFiles(path.join(ROOT, 'layouts/_partials')).map((abs) =>
    path.relative(path.join(ROOT, 'layouts/_partials'), abs).split(path.sep).join('/'),
  ),
);
let unknown = 0;
for (const file of layoutFiles(path.join(ROOT, 'layouts'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/partial(?:Cached)? "([\w./-]+\.html)"/g)) {
    if (!partials.has(match[1])) {
      unknown += 1;
      fail(`${path.relative(ROOT, file)} calls "partial ${match[1]}", which does not exist`);
    }
  }
}
for (const platform of Object.keys(params.analytics ?? {})) {
  if (!partials.has(`analytics/${platform}.html`)) {
    unknown += 1;
    fail(`analytics provider "${platform}" has no layouts/_partials/analytics/${platform}.html`);
  }
}
for (const provider of Object.keys(params.comments ?? {}).filter((key) => key !== 'provider')) {
  if (!partials.has(`comments/${provider}.html`)) {
    unknown += 1;
    fail(`comment provider "${provider}" has no layouts/_partials/comments/${provider}.html`);
  }
}
if (!unknown) console.log(`  ok    every partial named by a template exists (${partials.size} available)`);

// 5. Every configuration this repository ships declares the mandatory settings.
// A user copies `starter/hugo.toml` or the demo, so a missing key there teaches
// the wrong configuration and triggers the theme's build warning.
const shipping = ['starter/hugo.toml', 'exampleSite/hugo.toml', 'tests/fixtures/hugo/hugo.toml'];
let incomplete = 0;
for (const file of shipping) {
  const tree = readToml(path.join(ROOT, file));
  for (const [key] of mandatory) {
    if (!has(tree, key) && !has(readToml(path.join(CONFIG, 'module.toml')), key)) {
      incomplete += 1;
      fail(`${file} does not declare "${key}"`);
    }
  }
  if (!has(tree, 'outputs.home') || !['feed', 'search', 'swconf', 'manifest'].every((name) => String(tree.outputs?.home ?? '').includes(name))) {
    incomplete += 1;
    fail(`${file}: outputs.home must list feed, search, swconf and manifest`);
  }
}
if (!incomplete) console.log(`  ok    ${shipping.length} shipped configuration(s) declare every mandatory setting`);

console.log(failures ? `\n${failures} configuration failure(s)` : '\nconfiguration contract verified');
process.exit(failures ? 1 : 0);
