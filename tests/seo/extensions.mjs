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
 *   · the sitemap limit warning;
 *   · schema.org ImageObject, noindex on 404, zoomable viewport and the
 *     search.json content cap.
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

/* title suffix */
{
  const title = page('posts/hello').match(/<title>(.*?)<\/title>/)?.[1] ?? '';
  expect('title omits the site suffix when disabled', title === 'Hello SEO', title);
  const home = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  expect('home page keeps the site title', home.includes('<title>My Site</title>'));
}

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

/* RSS feeds (params.feeds) */
{
  const read = (rel) => {
    const file = path.join(OUT, rel);
    if (!fs.existsSync(file)) {
      fail(`missing feed ${rel}`);
      return '';
    }
    return fs.readFileSync(file, 'utf8');
  };
  const term = read('tags/alpha/index.xml');
  has('term feed: title from params.feeds.term_title', term, '<title>alpha · My Site</title>');
  has('term feed: self link', term, '<atom:link href="http://127.0.0.1:4100/tags/alpha/index.xml" rel="self" type="application/rss+xml" />');
  has('term feed: lists a post of the term', term, '<title>Hello SEO</title>');
  has('term feed: keeps hidden posts of the term', term, '<title>Hidden post</title>');
  expect('term feed: pages are not items', !term.includes('Unlisted page'));
  expect('term feed: no English "on" title', !/ on My Site</.test(term));
  const home = read('index.xml');
  has('home feed: titled with the site title', home, '<title>My Site</title>');
  has('home feed: lists posts', home, '<title>Hello SEO</title>');
  expect('home feed: skips hidden posts', !home.includes('Hidden post'));
  expect('home feed: skips pages', !home.includes('Unlisted page'));
  has(
    'term page advertises its feed',
    page('tags/alpha'),
    '<link rel="alternate" type="application/rss+xml" href="http://127.0.0.1:4100/tags/alpha/index.xml" title="alpha · My Site" />',
  );
  has('taxonomy page within taxonomy_max: one feed per term', page('categories'), 'href="http://127.0.0.1:4100/categories/guides/index.xml"');
  has('taxonomy page over taxonomy_max: the home feed', page('tags'), 'href="http://127.0.0.1:4100/index.xml" title="My Site"');
  expect('taxonomy page over taxonomy_max: no per-term feeds', !page('tags').includes('tags/beta/index.xml'));
  const listed = page('secret');
  has('front matter feeds: term feed', listed, 'href="http://127.0.0.1:4100/tags/alpha/index.xml" title="alpha · My Site"');
  has('front matter feeds: home feed', listed, 'href="http://127.0.0.1:4100/index.xml" title="My Site"');
  expect('a post without feeds advertises no RSS', !page('posts/hello').includes('application/rss+xml'));
}

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

/* schema.org ImageObject */
const posting = [...page('posts/hello').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1]))
  .find((ld) => ld['@type'] === 'BlogPosting');
expect('JSON-LD image is an ImageObject', posting?.image?.['@type'] === 'ImageObject', posting?.image?.['@type']);
expect('ImageObject carries the alt as caption', posting?.image?.caption === 'Cover', posting?.image?.caption);
expect('ImageObject has no alt or lqip', posting?.image && !('alt' in posting.image) && !('lqip' in posting.image));

/* 404 noindex */
const notFoundFile = path.join(OUT, '404.html');
const notFound = fs.existsSync(notFoundFile) ? fs.readFileSync(notFoundFile, 'utf8') : '';
has('404 page is noindex', notFound, /<meta name="robots" content="noindex, follow/);

/* viewport allows zoom */
const viewport = /<meta\s+name="viewport"\s+content="([^"]*)"/.exec(page('posts/hello'))?.[1] ?? '';
expect('viewport does not block zoom', viewport !== '' && !viewport.includes('user-scalable'), viewport);
expect('viewport keeps initial-scale', viewport.includes('initial-scale=1'), viewport);

/* search.json content cap */
const searchFile = path.join(OUT, 'assets/js/data/search.json');
const search = fs.existsSync(searchFile) ? JSON.parse(fs.readFileSync(searchFile, 'utf8')) : [];
expect('search.json has entries', search.length > 0, `${search.length}`);
expect('search entries are capped', search.every((entry) => [...entry.content].length <= 40), search.map((e) => [...e.content].length).join(','));
expect('search entries end on a whole word', search.every((entry) => !/&[#a-zA-Z0-9]*$/.test(entry.content)));

/* term title and description templates */
const term = page('categories/guides');
has('term <title> uses the template', term, '<title>Posts about guides</title>');
has('term og:title uses the template', term, '<meta property="og:title" content="Posts about guides"');
// The fixture also caps descriptions at 60 characters, so only the start is fixed.
has('term description uses the template', term, '<meta name="description" content="Everything published about guides, from the');
expect('term H1 keeps the bare term', !/<h1[^>]*>\s*Posts about/.test(term));
expect('post <title> is untouched', page('posts/hello').includes('<title>Hello SEO</title>'));

/* Goldmark task lists render like upstream (R3) */
const tasks = page('posts/tasks');
has('task list gets the upstream class', tasks, '<ul class="task-list">');
has('checked item becomes the check icon', tasks, /<li class="task-list-item">\s*<i class="fas fa-check-circle fa-fw checked"><\/i>\s*Done item/);
has('pending item becomes the circle icon', tasks, /<li class="task-list-item">\s*<i class="far fa-circle fa-fw"><\/i>\s*Pending item/);
expect('no bare checkbox is left', !/<input[^>]*type="checkbox"/.test(tasks));
expect('a plain list keeps no task class', /<ul>\s*<li>First<\/li>/.test(tasks));

/* previous/next links name the visible title (WCAG 2.5.3) */
const navLinks = [...(page('posts/tasks').match(/<nav class="post-navigation[\s\S]*?<\/nav>/)?.[0] ?? '')
  .matchAll(/<a [^>]*aria-label="([^"]*)"[^>]*>\s*<p>([^<]*)<\/p>/g)];
expect('post nav has links', navLinks.length > 0, `${navLinks.length}`);
expect('each accessible name ends with the visible title', navLinks.every(([, label, text]) => label.endsWith(`: ${text.trim()}`)),
  navLinks.map(([, l, t]) => `${l} | ${t}`).join(' ; '));

/* icon-only controls get an accessible name (B25) */
const sections = page('posts/headings');
has('TOC button is named', sections, /<button type="button" class="toc-trigger btn me-1" aria-label="Contents">/);
has('heading anchor names its section', sections, /<a href="#first-section" class="anchor text-muted" aria-label="First section">/);
has('anchor name escapes the heading text', sections, /aria-label="Second &amp; last"/);

/* heading anchors stay out of the flow (D-29) */
has(
  'hidden heading anchor is taken out of the flow on hover devices',
  page('posts/hello'),
  '@media (hover:hover){h2>a.anchor,h3>a.anchor,h4>a.anchor,h5>a.anchor{position:absolute}}',
);

/* post actions above the fold (D-30) and print support (D-31) */
const post = page('posts/hello');
has('top action row sits next to the dates', post, /<div class="post-meta-top [^"]*">\s*<div class="post-dates">/);
has('top row has a print button', post, /<div class="post-actions" data-post-actions>\s*<button type="button" class="btn post-action" data-print data-bs-toggle="tooltip"[^>]*aria-label="Print this">/);
has('top row copies the permalink', post, 'data-copy-link="http://127.0.0.1:4100/posts/hello/"');
has('top row has the system share button', post, 'class="btn post-action" data-native-share data-title="Hello SEO"');
has('system share button closes the row, after the links', post, /data-share-net[^]*?<\/a>\s*<button type="button" class="btn post-action" data-native-share[^>]*>\s*<i[^>]*><\/i>\s*<\/button>\s*<\/div>/);
has('top row keeps the network links', post, /<a class="post-action" data-share-net href="https:\/\/twitter\.com\/intent\/tweet\?/);
has('bottom share bar is kept with "both"', post, '<div class="share-wrapper');
// "Hello SEO - My Site": `&`, `#` and `+` would cut a mailto subject, so it is fully encoded.
has('mailto share link encodes the subject', post, 'href="mailto:?subject=Hello%20SEO%20-%20My%20Site&amp;body=http%3A%2F%2F127.0.0.1%3A4100%2Fposts%2Fhello%2F"');
expect('mailto share link opens no blank tab', !/href="mailto:[^"]*" target="_blank"/.test(post));
has('web share links keep the upstream encoding', post, 'href="https://twitter.com/intent/tweet?text=Hello%20SEO%20-%20My%20Site&amp;url=http%3A%2F%2F127.0.0.1%3A4100%2Fposts%2Fhello%2F" target="_blank" rel="noopener"');
has('bottom share bar has a print button', post, /<button type="button" class="btn text-start" data-print data-bs-toggle="tooltip"[^>]*aria-label="Print this">/);
has('print header is hidden on screen', post, /<div class="print-header" hidden/);
has('print header shows the post URL without scheme', post, '<div class="print-url">127.0.0.1:4100/posts/hello</div>');
has('print header logo defaults to the avatar', post, '<img class="print-logo" src="/img/cover.png" alt="My Site"');
has('QR code names its address', post, 'alt="QR 127.0.0.1:4100/posts/hello"');
// html/template writes `+` as `&#43;` inside the attribute; the browser decodes it.
has('QR code is inlined as a PNG data URI', post, /<img class="print-qr" src="data:image\/png;base64,(?:[A-Za-z0-9/=]|&#43;){200,}"/);
has('cover mode is on the article', post, 'data-print-cover="full"');
has('print stylesheet is print-only', post, /<link rel="stylesheet" href="\/chirpy-hugo\/print\.min\.[0-9a-f]+\.css" media="print" integrity="sha256-/);
has('page footers carry the post URL', post, '@page{@bottom-left{content:"127.0.0.1:4100/posts/hello"');
has('post tools script is deferred', post, /<script defer src="\/chirpy-hugo\/post-tools\.[0-9a-f]+\.js" integrity="sha256-/);
expect('pages that are not posts get no print assets', !page('').includes('chirpy-hugo/print'));

/* a tag and a category with the same name keep their own labels */
has('category page shows the category label', page('categories/mixed'), '<title>Posts about Mixed</title>');
has('tag page shows the tag label', page('tags/mixed'), '<title>Posts about mixed</title>');

/* Day.js locale file */
has('es page loads the site es locale', page('es/posts/hello'), /<script defer src="\/assets\/js\/dayjs\/es\.js"><\/script>/);
has('en page loads the site en locale', page('posts/hello'), /<script defer src="\/assets\/js\/dayjs\/en\.js"><\/script>/);
expect('upstream locale path is replaced', !page('es/posts/hello').includes('/assets/lib/dayjs/locale/'));

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
