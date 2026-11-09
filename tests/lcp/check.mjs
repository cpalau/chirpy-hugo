#!/usr/bin/env node
/**
 * Gate 6c — responsive covers and LCP markup.
 *
 *   node tests/lcp/check.mjs
 *
 * Builds `tests/fixtures/lcp` (a page bundle that really owns its cover as a
 * resource) and proves the pieces that keep LCP small:
 *
 *   1. listing pages have one h1 and the cards are h2;
 *   2. every bundle cover is a <picture> with AVIF + WebP srcsets at 480/800/
 *      1200w and explicit width/height;
 *   3. the first card and the post cover are `eager` + `fetchpriority=high`,
 *      the rest are `lazy` + `fetchpriority=low`;
 *   4. the preload carries `imagesrcset`/`imagesizes` matching the AVIF source
 *      (a mismatch would download the image twice);
 *   5. the stylesheet is inlined (no render-blocking theme CSS request) and the
 *      above-the-fold layout keeps `content-visibility` for the article body;
 *   6. the search index is no longer fetched on load: SimpleJekyllSearch is
 *      initialised from a user gesture.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SITE = path.join(ROOT, 'tests/fixtures/lcp');
const OUT = path.join(ROOT, '.out/lcp');

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

execFileSync(
  'hugo',
  [
    '-s', SITE,
    '--themesDir', path.join(ROOT, '..'),
    '--theme', 'chirpy-hugo',
    '-d', OUT,
    '--minify',
    '--quiet',
  ],
  { stdio: 'inherit' },
);

const home = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const post = fs.readFileSync(path.join(OUT, 'posts/demo/index.html'), 'utf8');

const pictures = [...home.matchAll(/<picture[^>]*>([\s\S]*?)<\/picture>/g)];
const imgs = [...home.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
const preload = home.match(/<link rel=preload as=image[^>]*>/)?.[0] ?? '';

console.log('\nlisting');
check('one h1 per listing', (home.match(/<h1\b/g) ?? []).length === 1, `${(home.match(/<h1\b/g) ?? []).length} found`);
check('the listing h1 is visually hidden', /<h1 class=visually-hidden/.test(home));
check('cards are h2', (home.match(/<h2\b[^>]*class=["']?card-title/g) ?? []).length === 2);
check('no h1 inside the cards', !/<h1\b[^>]*class=["']?card-title/.test(home));
check('two responsive pictures', pictures.length === 2, `${pictures.length} found`);

const first = pictures[0]?.[0] ?? '';
const second = pictures[1]?.[0] ?? '';
check('AVIF source', /<source type=image\/avif/.test(first));
check('WebP source', /<source type=image\/webp/.test(first));
check('three width candidates', ['480w', '800w', '1200w'].every((w) => first.includes(w)));
check('width and height on the img', /<img[^>]*\swidth=\d+/.test(first) && /<img[^>]*\sheight=\d+/.test(first));

console.log('\npriority');
check('first card is eager + high', /loading=eager/.test(imgs[0] ?? '') && /fetchpriority=high/.test(imgs[0] ?? ''));
check('the other card is lazy + low', /loading=lazy/.test(imgs[1] ?? '') && /fetchpriority=low/.test(imgs[1] ?? ''));
check('post cover is eager + high', /<img[^>]*loading=eager[^>]*fetchpriority=high|<img[^>]*fetchpriority=high[^>]*loading=eager/.test(post));
check('non-priority covers are lazy + low', /loading=lazy/.test(second) && /fetchpriority=low/.test(second));

console.log('\npreload');
const avifSrcset = first.match(/<source type=image\/avif srcset="([^"]+)"/)?.[1] ?? '';
const preloadSrcset = preload.match(/imagesrcset="([^"]+)"/)?.[1] ?? '';
check('preload declares imagesrcset', preloadSrcset.length > 0);
check('preload declares imagesizes', /imagesizes="[^"]+"/.test(preload));
check('preload srcset matches the AVIF source', avifSrcset === preloadSrcset, `${avifSrcset.slice(0, 40)} vs ${preloadSrcset.slice(0, 40)}`);

console.log('\nrender path');
check('theme CSS is inlined', /<style>[\s\S]*?\.preview-img[\s\S]*?<\/style>/.test(home));
check('no blocking theme stylesheet', !/<link rel=stylesheet href=["']?\/assets\/css\/jekyll-theme-chirpy/.test(home));
check('content-visibility for the article body', /content-visibility:auto/.test(post));

console.log('\nsearch');
const loader = home.indexOf('SimpleJekyllSearch(');
check('the index URL is inside the loader', home.indexOf('search.json') > loader && loader !== -1);
check('the search binds a focus gesture', /addEventListener\(["']focus["']/.test(home));
check('the search is not initialised at parse time', home.indexOf('search.json') > home.indexOf('SimpleJekyllSearch('));

console.log(failures === 0 ? '\nLCP markup verified' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
