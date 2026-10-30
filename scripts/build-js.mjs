#!/usr/bin/env node
/**
 * Publish the JavaScript bundles where the browser expects them.
 *
 * Jekyll publishes everything under `assets/` verbatim, and `app.min.js` and
 * `sw.min.js` carry front matter (`permalink: /:basename`) so they land at the
 * site root. Hugo does not publish `assets/` — it is the pipeline source dir —
 * so the bundles have to be materialised under `static/`.
 *
 *   node scripts/build-js.mjs
 *
 * Sources: `assets/js/dist/*.min.js` (from the published gem, D-10).
 * Output:  `static/assets/js/dist/*.min.js` plus `static/app.min.js` and
 *          `static/sw.min.js`, with the Jekyll front matter removed.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'assets/js/dist');
const OUT = path.join(ROOT, 'static');

const FRONT_MATTER = /^---\r?\n(?:[\s\S]*?)\r?\n---\r?\n/;
const ROOT_BUNDLES = new Set(['app.min.js', 'sw.min.js']);

// Upstream's worker is cache-first for every request, navigations included, and
// never calls skipWaiting. After a deploy the browser keeps serving the previous
// HTML and bundles until every tab is closed, so a fixed site looks broken.
// This wrapper (D-23) activates immediately, claims the clients, reloads them
// once, and sends navigations to the network first.
const SW_PATCH = `/* chirpy-hugo: update policy (D-23) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.some((key) => key !== swconf.cacheName);
    await self.clients.claim();
    if (!stale) return; // first install: nothing to recover from
    const windows = await self.clients.matchAll({ type: 'window' });
    for (const client of windows) client.navigate(client.url).catch(() => {});
  })());
});
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      const cache = await caches.open(swconf.cacheName);
      cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      return (await caches.match(event.request)) || Response.error();
    }
  })());
});
`;

async function main() {
  const files = (await fs.readdir(SRC)).filter((f) => f.endsWith('.js')).sort();
  let written = 0;

  for (const file of files) {
    let code = await fs.readFile(path.join(SRC, file), 'utf8');
    const hadFrontMatter = FRONT_MATTER.test(code);
    if (hadFrontMatter) code = code.replace(FRONT_MATTER, '');

    const targets = [path.join(OUT, 'assets/js/dist', file)];
    if (ROOT_BUNDLES.has(file)) targets.push(path.join(OUT, file));

    for (const target of targets) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      // Only the published service worker is patched; the gem artifact under
      // assets/js/dist/ stays byte-identical to upstream.
      const output = file === 'sw.min.js' && target === path.join(OUT, 'sw.min.js') ? SW_PATCH + code : code;
      const current = existsSync(target) ? await fs.readFile(target, 'utf8') : null;
      if (current !== output) {
        await fs.writeFile(target, output);
        written += 1;
      }
    }
    if (hadFrontMatter) console.log(`  ${file}: front matter removed`);
  }

  // `assets/js/data/mathjax.js` configures MathJax. Upstream's copy is a Jekyll
  // asset: it carries front matter and Liquid comments, so it has to be rendered
  // before the browser sees it.
  const dataDir = path.join(SRC, '../data');
  for (const file of (await fs.readdir(dataDir)).sort()) {
    if (!file.endsWith('.js')) continue;
    const target = path.join(OUT, 'assets/js/data', file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    let content = await fs.readFile(path.join(dataDir, file), 'utf8');
    content = content
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
      .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '');
    const current = existsSync(target) ? await fs.readFile(target, 'utf8') : null;
    if (current !== content) {
      await fs.writeFile(target, content);
      written += 1;
    }
  }

  console.log(`bundles: ${files.length} source(s), ${written} file(s) written`);
  const expected = ['assets/js/dist/theme.min.js', 'app.min.js', 'sw.min.js', 'assets/js/data/mathjax.js'];
  for (const rel of expected) {
    if (!existsSync(path.join(OUT, rel))) {
      console.error(`error: ${rel} was not produced`);
      process.exit(1);
    }
  }
  console.log('required bundles present: theme.min.js, app.min.js, sw.min.js');
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exit(2);
});
