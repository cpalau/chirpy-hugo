#!/usr/bin/env node
/**
 * Gate for the non-HTML outputs (F6): feed, sitemap, service-worker config and
 * PWA manifest.
 *
 *   node tests/outputs/check.mjs
 *
 * Needs both builds (see docs/TESTING.md §6):
 *
 *   bash tests/oracle/build.sh
 *   hugo -s tests/fixtures/hugo --themesDir ../.. --theme chirpy-hugo -d .out/hugo
 *
 * The comparison is semantic, not byte-for-byte: the feed carries a build
 * timestamp and a generator line that must say Hugo, and the sitemap uses
 * Hugo's pagination URLs (D-14). Everything a consumer depends on — entry set,
 * order, summaries, categories, URLs, manifest fields — is compared.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ORACLE = path.join(ROOT, '.out/oracle');
const HUGO = path.join(ROOT, '.out/hugo');

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};
const ok = (message) => console.log(`  ok    ${message}`);

const read = (side, file) => fs.readFileSync(path.join(side, file), 'utf8');
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');

// --- feed ------------------------------------------------------------------

function feedEntries(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, body]) => ({
    title: decode(/<title>([\s\S]*?)<\/title>/.exec(body)?.[1] ?? ''),
    summary: decode(/<summary>([\s\S]*?)<\/summary>/.exec(body)?.[1] ?? ''),
    categories: [...body.matchAll(/<category term="([^"]*)"/g)].map((m) => m[1]),
    id: /<id>([\s\S]*?)<\/id>/.exec(body)?.[1] ?? '',
  }));
}

function checkFeed() {
  const oracle = feedEntries(read(ORACLE, 'feed.xml'));
  const hugo = feedEntries(read(HUGO, 'feed.xml'));

  if (hugo.length !== 5) fail(`feed: ${hugo.length} entries, expected 5`);
  else ok(`feed: 5 entries`);

  if (oracle.length !== hugo.length) {
    fail(`feed: oracle has ${oracle.length} entries, Hugo ${hugo.length}`);
    return;
  }
  const keys = ['title', 'summary', 'id'];
  for (const [i, a] of oracle.entries()) {
    for (const key of keys) {
      if (a[key] !== hugo[i][key]) fail(`feed: entry ${i} ${key} differs`);
    }
    if (a.categories.join(',') !== hugo[i].categories.join(',')) {
      fail(`feed: entry ${i} categories differ (${a.categories} vs ${hugo[i].categories})`);
    }
  }

  const generator = read(HUGO, 'feed.xml').match(/<generator[^>]*>([^<]*)<\/generator>/)?.[1];
  if (generator !== 'Hugo') fail(`feed: generator is "${generator}", expected "Hugo"`);
  else ok('feed: generator credits Hugo');

  const self = read(HUGO, 'feed.xml').match(/<link rel="self"[^>]*href="([^"]*)"/)?.[1] ?? '';
  if (!self.endsWith('/feed.xml')) fail(`feed: self link is "${self}"`);
  else ok('feed: self link resolves');
}

// --- sitemap ---------------------------------------------------------------

const normalizePagination = (url) => url.replace(/\/page(\d+)\/$/, '/page/$1/').replace(/\/page\/(\d+)\/$/, '/page/$1/');

function sitemapUrls(side) {
  return [...read(side, 'sitemap.xml').matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
}

function checkSitemap() {
  const oracle = new Set(sitemapUrls(ORACLE).map(normalizePagination));
  const hugo = new Set(sitemapUrls(HUGO).map(normalizePagination));

  const missing = [...oracle].filter((url) => !hugo.has(url));
  const extra = [...hugo].filter((url) => !oracle.has(url));

  if (missing.length) fail(`sitemap: ${missing.length} missing, e.g. ${missing[0]}`);
  if (extra.length) fail(`sitemap: ${extra.length} unexpected, e.g. ${extra[0]}`);
  if (!missing.length && !extra.length) ok(`sitemap: ${hugo.size} URLs, same set as Jekyll`);
}

// --- search index ----------------------------------------------------------

function checkSearch() {
  const file = 'assets/js/data/search.json';
  const oracle = JSON.parse(read(ORACLE, file));
  const hugo = JSON.parse(read(HUGO, file));

  if (oracle.length !== hugo.length) {
    fail(`search: ${hugo.length} entries, Jekyll has ${oracle.length}`);
    return;
  }
  const byUrl = (list) => [...list].sort((a, b) => (a.url < b.url ? -1 : 1));
  const oracleSorted = byUrl(oracle);
  const hugoSorted = byUrl(hugo);
  let differences = 0;
  for (const [i, a] of oracleSorted.entries()) {
    const b = hugoSorted[i];
    for (const key of ['title', 'url', 'categories', 'tags', 'date']) {
      if (a[key] !== b[key]) {
        differences += 1;
        fail(`search: "${a.url}" ${key} differs`);
      }
    }
    // The index is consumed by a tokenizer: character references and runs of
    // whitespace are equivalent, and kramdown unescapes LaTeX delimiters.
    const normalize = (text) => decode(text).replace(/\s+/g, ' ').trim();
    if (normalize(a.content) !== normalize(b.content)) {
      differences += 1;
      fail(`search: "${a.url}" content differs`);
    }
  }
  if (!differences) ok(`search: ${hugo.length} entries, same schema and text`);
}

// --- service worker config -------------------------------------------------

function checkSwconf() {
  const file = path.join(HUGO, 'assets/js/data/swconf.js');
  if (!fs.existsSync(file)) {
    fail('swconf: assets/js/data/swconf.js is missing');
    return;
  }
  const source = fs.readFileSync(file, 'utf8');
  if (!/purge:\s*true/.test(source)) fail('swconf: cache disabled but purge is not true');
  else ok('swconf: emitted at the URL the service worker imports');
}

// --- PWA manifest ----------------------------------------------------------

function checkManifest() {
  const oraclePath = path.join(ORACLE, 'assets/img/favicons/site.webmanifest');
  const hugoPath = path.join(HUGO, 'assets/img/favicons/site.webmanifest');
  for (const [side, file] of [['oracle', oraclePath], ['Hugo', hugoPath]]) {
    try {
      JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      fail(`manifest: ${side} is not valid JSON (${error.message})`);
      return;
    }
  }
  const strip = (value) => {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, strip(value[key])]));
    }
    return value;
  };
  const oracle = JSON.stringify(strip(JSON.parse(fs.readFileSync(oraclePath, 'utf8'))));
  const hugo = JSON.stringify(strip(JSON.parse(fs.readFileSync(hugoPath, 'utf8'))));
  if (oracle !== hugo) fail('manifest: fields differ from Jekyll');
  else ok('manifest: valid JSON, same fields as Jekyll');
}

function main() {
  for (const [side, dir] of [['oracle', ORACLE], ['Hugo', HUGO]]) {
    if (!fs.existsSync(dir)) {
      console.error(`missing ${side} build in ${dir}: build both sides first`);
      process.exit(2);
    }
  }
  checkFeed();
  checkSitemap();
  checkSearch();
  checkSwconf();
  checkManifest();
  console.log(failures ? `\n${failures} output failure(s)` : '\nall outputs match');
  process.exit(failures ? 1 : 0);
}

main();
