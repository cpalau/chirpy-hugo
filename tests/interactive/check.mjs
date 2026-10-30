#!/usr/bin/env node
/**
 * Gate 5b — interaction suite.
 *
 *   node tests/interactive/check.mjs [build-dir]
 *
 * Gate 5 compares still pixels; this proves the JavaScript the theme ships
 * still finds its DOM and does its job: tocbot builds the table of contents,
 * the search overlay searches, the theme toggle persists, and the copy button
 * puts the code block on the clipboard.
 *
 * The theme ships its own bundles but loads tocbot, clipboard and the search
 * library from jsDelivr (upstream's default), so that host is allowed and
 * everything else is aborted.
 */

import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';
import { chromiumPath } from '../lib/browser.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SITE = path.resolve(ROOT, process.argv[2] ?? '.out/hugo');
const PORT = 4033;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
};

function serve(root) {
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
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

if (!fs.existsSync(SITE)) {
  console.error(`missing build in ${SITE}`);
  process.exit(2);
}

const browserPath = chromiumPath();
const server = await serve(SITE);
const browser = await chromium.launch({ executablePath: browserPath, args: ['--disable-dev-shm-usage'] });

let failures = 0;
const check = (name, condition) => {
  if (condition) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${name}`);
  }
};

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const ALLOWED = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  await context.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue();
    if (ALLOWED.some((host) => url.includes(host))) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // --- table of contents (tocbot builds it at runtime) ---
  await page.goto(`http://127.0.0.1:${PORT}/posts/full/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#toc .toc-link', { timeout: 8000 }).catch(() => {});
  const tocLinks = await page.locator('#toc .toc-link').count();
  check(`tocbot built the table of contents (${tocLinks} links)`, tocLinks > 0);

  // --- theme toggle ---
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  await page.locator('#mode-toggle').click();
  await page.locator('button.dropdown-item[data-theme-mode="dark"]').click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  check(`theme toggle switches the theme (${before} → ${after})`, after === 'dark');

  // --- copy button (the full fixture has no code block) ---
  await page.goto(`http://127.0.0.1:${PORT}/posts/code/`, { waitUntil: 'domcontentloaded' });
  const copy = page.locator('button[aria-label="copy"]').first();
  await copy.click();
  await page.waitForTimeout(300);
  const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  check('copy button puts the code on the clipboard', copied.includes('const') || copied.length > 0);

  // --- search overlay ---
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  // On desktop the input is already visible; the trigger is the mobile icon.
  if (await page.locator('#search-trigger').isVisible()) await page.locator('#search-trigger').click();
  await page.locator('#search-input').fill('mermaid');
  await page.waitForFunction(
    () => (document.querySelector('#search-results')?.textContent ?? '').toLowerCase().includes('mermaid'),
    { timeout: 8000 },
  ).catch(() => {});
  const results = await page.locator('#search-results a').count();
  check(`search returns results (${results} links)`, results > 0);

  check('no uncaught page errors', errors.length === 0);
  if (errors.length) console.error(`        ${errors[0]}`);
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\n${failures} interaction failure(s)` : '\ninteractions verified');
process.exit(failures ? 1 : 0);
