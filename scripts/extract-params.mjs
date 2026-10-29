#!/usr/bin/env node
/**
 * Extract every `site.*` and `page.*` read from the pinned upstream templates
 * and check that the configuration surface is documented.
 *
 *   node scripts/extract-params.mjs            # write tests/contract/params.json
 *   node scripts/extract-params.mjs --check    # fail on an undocumented root
 *
 * F0 deliverable: the contract must know every parameter the theme reads, so
 * that `docs/CONFIG.md` cannot silently fall behind. Full semantic checking
 * (types, defaults, dead params) belongs to `scripts/check-config.mjs` in F9;
 * this script only guarantees that no *new* root appears unannounced.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST = path.join(ROOT, 'tests/contract/upstream-hashes.json');
const OUT = path.join(ROOT, 'tests/contract/params.json');
const CONFIG_DOC = path.join(ROOT, 'docs/CONFIG.md');

// Objects Jekyll and Liquid provide; they are not user configuration.
const RUNTIME_ROOTS = new Set([
  'posts', 'pages', 'documents', 'collections', 'categories', 'tags', 'tabs',
  'static_files', 'html_pages', 'related_posts', 'time', 'data', 'theme',
  'environment', 'paginator', 'page', 'layout', 'jekyll', 'feed_meta',
  'google_analytics', 'title', 'description', 'url', 'baseurl', 'lang',
]);

async function walk(dir, prefix = '') {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
    else if (entry.name.endsWith('.html') || entry.name.endsWith('.xml') || entry.name.endsWith('.js'))
      out.push(rel);
  }
  return out;
}

function scan(text, prefix) {
  // The lookbehind avoids matching paths such as `{{ x }}/site.webmanifest`.
  const re = new RegExp(
    `(?<![\\w/.\\-])${prefix}\\.[a-zA-Z_][a-zA-Z0-9_]*(?:\\.[a-zA-Z_][a-zA-Z0-9_]*)*`,
    'g',
  );
  return [...text.matchAll(re)].map((m) => m[0].slice(prefix.length + 1));
}

async function main() {
  const argv = new Set(process.argv.slice(2));
  const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  const dir = path.join(ROOT, '.out/upstream', manifest.upstream.sha, 'tag');
  if (!existsSync(dir)) {
    console.error(`missing upstream cache: ${path.relative(ROOT, dir)}`);
    console.error('run: node scripts/fetch-upstream.mjs --generate');
    process.exit(2);
  }

  const files = [
    ...(await walk(path.join(dir, '_layouts'))).map((f) => `_layouts/${f}`),
    ...(await walk(path.join(dir, '_includes'))).map((f) => `_includes/${f}`),
    'assets/feed.xml',
    'assets/404.html',
  ].filter((f) => existsSync(path.join(dir, f)));

  const site = {};
  const page = {};
  for (const rel of files) {
    const text = await fs.readFile(path.join(dir, rel), 'utf8');
    for (const key of scan(text, 'site')) {
      (site[key] ??= new Set()).add(rel);
    }
    for (const key of scan(text, 'page')) {
      (page[key] ??= new Set()).add(rel);
    }
  }

  const serialize = (map) =>
    Object.fromEntries(
      Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, [...v].sort()]),
    );

  const data = {
    upstream: {
      tag: manifest.upstream.tag,
      sha: manifest.upstream.sha,
    },
    site: serialize(site),
    page: serialize(page),
  };

  await fs.writeFile(OUT, `${JSON.stringify(data, null, 2)}\n`);

  const roots = [...new Set(Object.keys(site).map((k) => k.split('.')[0]))].sort();
  const doc = await fs.readFile(CONFIG_DOC, 'utf8');
  const undocumented = roots.filter((r) => {
    if (RUNTIME_ROOTS.has(r)) return false;
    return !new RegExp(`(^|[^a-z_])${r}([^a-z_]|$)`).test(doc);
  });

  console.log(`templates scanned: ${files.length}`);
  console.log(`site roots: ${roots.length} (${roots.join(', ')})`);
  console.log(`page keys:  ${Object.keys(page).length}`);

  if (undocumented.length) {
    console.log(`\nundocumented site roots: ${undocumented.join(', ')}`);
    console.log('Document them in docs/CONFIG.md or add them to RUNTIME_ROOTS.');
    if (argv.has('--check')) process.exit(1);
  } else {
    console.log('\nevery site root is documented');
  }
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exit(2);
});
