#!/usr/bin/env node
/**
 * Gate 4c — SEO extensions (beyond upstream).
 *
 *   node tests/seo/extensions.mjs
 *
 * Builds `tests/fixtures/seo-ext` — a multilingual site (en, es, rtl ar) with
 * every opt-in SEO switch on — and asserts the features the Jekyll original
 * does not have:
 *
 *   · hreflang alternates and x-default;
 *   · `dir="rtl"` for the right-to-left language;
 *   · `noindex` for hidden posts and for `noindex: true` pages;
 *   · feed autodiscovery;
 *   · BreadcrumbList structured data;
 *   · the character cap of the description;
 *   · the JSON-LD image fallback;
 *   · article section/tag/author;
 *   · og:image type and dimensions read from the asset;
 *   · the sitemap limit warning.
 *
 * It finishes by running the standards gate over the same build, so the new
 * JSON-LD and card metadata are validated, not only asserted.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SITE = path.join(ROOT, 'tests/fixtures/seo-ext');
const OUT = path.join(ROOT, '.out/seo-ext');
const HUGO = process.env.HUGO ?? 'hugo';

let checks = 0;
let failures = 0;
const ok = (label) => {
  checks += 1;
  console.log(`  ok    ${label}`);
};
const fail = (label, detail = '') => {
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` (${detail})` : ''}`);
};
const expect = (label, condition, detail = '') => {
  if (condition) ok(label);
  else fail(label, detail);
};

fs.rmSync(OUT, { recursive: true, force: true });
const build = spawnSync(
  HUGO,
  [
    '-s',
    SITE,
    '--themesDir',
    path.dirname(ROOT),
    '--theme',
    path.basename(ROOT),
    '--baseURL',
    'http://127.0.0.1:4100/',
    '-d',
    OUT,
  ],
  { encoding: 'utf8' },
);
if (build.status !== 0) {
  console.error(build.stderr || build.stdout);
  process.exit(1);
}

const warnings = build.stderr.split('\n').filter((line) => line.includes('WARN'));
const sitemap = warnings.filter((line) => line.includes('sitemap.xml has'));
const other = warnings.filter((line) => !line.includes('sitemap.xml has'));
expect('build has no unexpected warnings', other.length === 0, other[0]);
expect('sitemap limit warning fires', sitemap.length >= 1, `${sitemap.length} warning(s)`);

const page = (rel) => {
  const file = path.join(OUT, rel, 'index.html');
  if (!fs.existsSync(file)) {
    fail(`missing page ${rel}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
};
const has = (label, html, pattern) => expect(label, typeof pattern === 'string' ? html.includes(pattern) : pattern.test(html));

/* hreflang + x-default */
for (const rel of ['posts/hello', 'es/posts/hello', 'ar/posts/hello']) {
  const html = page(rel);
  for (const [lang, url] of [
    ['en', 'http://127.0.0.1:4100/posts/hello/'],
    ['es', 'http://127.0.0.1:4100/es/posts/hello/'],
    ['ar', 'http://127.0.0.1:4100/ar/posts/hello/'],
  ]) {
    has(`${rel}: hreflang=${lang}`, html, `<link rel="alternate" hreflang="${lang}" href="${url}"`);
  }
  has(`${rel}: x-default`, html, 'hreflang="x-default" href="http://127.0.0.1:4100/posts/hello/"');
}

/* dir */
has('ar page sets dir=rtl', page('ar/posts/hello'), '<html lang="ar" dir="rtl"');
expect('en page has no dir', !/<html lang="en"[^>]* dir=/.test(page('posts/hello')));

/* noindex */
has('hidden post is noindex', page('posts/secret'), '<meta name="robots" content="noindex, follow, max-image-preview:large"');
has('noindex front matter is honoured', page('secret'), '<meta name="robots" content="noindex, follow, max-image-preview:large"');
expect(
  'normal post is indexable and Discover-ready',
  !page('posts/hello').includes('noindex') && page('posts/hello').includes('max-image-preview:large'),
);

/* og:locale:alternate */
has('es page lists the other locales', page('es/posts/hello'), '<meta property="og:locale:alternate" content="en"');
has('es page lists the RTL locale', page('es/posts/hello'), '<meta property="og:locale:alternate" content="ar"');
expect('en page has no alternate of itself', !page('posts/hello').includes('og:locale:alternate" content="en"'));

/* image sitemap */
/* A multilingual build publishes one sitemap per language plus an index. */
const sitemapFile = path.join(OUT, 'en/sitemap.xml');
const sitemapXml = fs.existsSync(sitemapFile) ? fs.readFileSync(sitemapFile, 'utf8') : fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
has('sitemap declares the image namespace', sitemapXml, 'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
has('sitemap lists the cover of a post', sitemapXml, '<image:loc>http://127.0.0.1:4100/img/cover.png</image:loc>');

/* llms.txt */
const llmsFile = path.join(OUT, 'llms.txt');
const llms = fs.existsSync(llmsFile) ? fs.readFileSync(llmsFile, 'utf8') : '';
has('llms.txt starts with the site title', llms, '# My Site');
has('llms.txt lists a post', llms, '[Hello SEO](http://127.0.0.1:4100/posts/hello/)');
expect('llms.txt omits hidden posts', !llms.includes('Hidden post'));
expect('llms.txt omits noindex pages', !llms.includes('Unlisted page'));

/* feed discovery */
has(
  'feed autodiscovery',
  page('posts/hello'),
  '<link rel="alternate" type="application/atom+xml" href="http://127.0.0.1:4100/feed.xml"',
);

/* description cap */
const description = /<meta name="description" content="([^"]*)"/.exec(page('posts/hello'))?.[1] ?? '';
expect('description is capped', description.length > 0 && description.length <= 61, `${description.length} chars`);
expect('description ends with an ellipsis', description.endsWith('…'));

/* article metadata */
const article = page('posts/hello');
has('article:section', article, '<meta property="article:section" content="guides"');
has('article:tag alpha', article, '<meta property="article:tag" content="alpha"');
has('article:tag beta', article, '<meta property="article:tag" content="beta"');
has('article:author', article, '<meta property="article:author" content="https://example.com/author"');

/* image metadata, resolved from the asset */
has('og:image:type from the asset', article, '<meta property="og:image:type" content="image/png"');
const width = /<meta property="og:image:width" content="(\d+)"/.exec(article)?.[1];
const height = /<meta property="og:image:height" content="(\d+)"/.exec(article)?.[1];
expect('og:image dimensions from the asset', Number(width) > 0 && Number(height) > 0, `${width}x${height}`);

/* JSON-LD image fallback */
has(
  'JSON-LD image falls back to the social preview',
  page('posts/plain'),
  '"image":"http://127.0.0.1:4100/img/social-preview.png"',
);

/* BreadcrumbList */
const crumbs = [...page('posts/hello').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1]))
  .find((ld) => ld['@type'] === 'BreadcrumbList');
expect('post has a BreadcrumbList', Boolean(crumbs));
if (crumbs) {
  expect('breadcrumb trail: home + post', crumbs.itemListElement.length === 2, `${crumbs.itemListElement.length} items`);
  expect('breadcrumb starts at home', crumbs.itemListElement[0]?.name === 'Home');
  expect('breadcrumb ends at the post', crumbs.itemListElement[1]?.item === 'http://127.0.0.1:4100/posts/hello/');
}
const termCrumbs = [...page('categories/guides').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1]))
  .find((ld) => ld['@type'] === 'BreadcrumbList');
expect('term has a three-level breadcrumb', termCrumbs?.itemListElement?.length === 3, `${termCrumbs?.itemListElement?.length} items`);

/* Standards over the extension build (separate process: it validates all pages) */
const standards = spawnSync(process.execPath, [path.join(ROOT, 'tests/seo/check.mjs'), '--standards', OUT], {
  encoding: 'utf8',
});
if (standards.status !== 0) {
  process.stdout.write(standards.stdout);
  process.stderr.write(standards.stderr);
  fail('standards gate over the extension build');
} else {
  ok('standards gate over the extension build');
}

console.log(`\n${checks} extension checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
