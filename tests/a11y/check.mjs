#!/usr/bin/env node
/**
 * Gate 6 — accessibility.
 *
 *   node tests/a11y/check.mjs [build-dir]
 *
 * Runs axe-core in Chromium over the representative pages and fails on any
 * `serious` or `critical` violation. Upstream markup is the baseline: a
 * violation that exists in the Jekyll build too is reported as inherited, and
 * only a violation that we introduce fails the gate.
 */

import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';
import { chromiumPath } from '../lib/browser.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BUILD = path.resolve(ROOT, process.argv[2] ?? '.out/hugo');
const PORT = 4044;
const AXE = path.join(ROOT, 'node_modules/axe-core/axe.min.js');

const PAGES = ['/', '/posts/full/', '/posts/code/', '/categories/', '/tags/alpha/', '/404.html'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const serve = (root) =>
  new Promise((resolve) => {
    const server = createServer((request, response) => {
      let file = path.join(root, decodeURIComponent(request.url.split('?')[0]));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(response);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });

async function audit(browser, root, pages) {
  const server = await serve(root);
  const context = await browser.newContext();
  await context.route('**', (route) =>
    route.request().url().startsWith(`http://127.0.0.1:${PORT}/`) ? route.continue() : route.abort(),
  );
  await context.addInitScript({ path: AXE }).catch(async () => {
    const source = fs.readFileSync(AXE, 'utf8');
    await context.addInitScript({ content: source });
  });
  const page = await context.newPage();
  const found = {};
  for (const url of pages) {
    await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: fs.readFileSync(AXE, 'utf8') });
    const results = await page.evaluate(async () => {
      const result = await window.axe.run(document, { resultTypes: ['violations'] });
      return result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    });
    found[url] = results;
  }
  await page.close();
  await context.close();
  await server.close();
  return found;
}

if (!fs.existsSync(BUILD) || !fs.existsSync(AXE)) {
  console.error('missing build or axe-core');
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--disable-dev-shm-usage'] });

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};

try {
  const ours = await audit(browser, BUILD, PAGES);
  const oracle = process.argv[3] ? await audit(browser, path.resolve(ROOT, process.argv[3]), PAGES) : null;

  for (const url of PAGES) {
    const inherited = new Set((oracle?.[url] ?? []).map((v) => v.id));
    for (const violation of ours[url]) {
      if (violation.impact !== 'serious' && violation.impact !== 'critical') continue;
      if (inherited.has(violation.id)) {
        console.log(`  note  ${url} ${violation.id} (${violation.impact}) is inherited from Jekyll`);
        continue;
      }
      fail(`${url}: ${violation.id} (${violation.impact}, ${violation.nodes} node(s))`);
    }
  }
  if (!failures) console.log(`  ok    ${PAGES.length} pages: no new serious or critical violations`);
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} accessibility failure(s)` : '\naccessibility verified');
process.exit(failures ? 1 : 0);
