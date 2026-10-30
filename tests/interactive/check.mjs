#!/usr/bin/env node
/**
 * Gate 5b — interaction suite.
 *
 *   node tests/interactive/check.mjs [build-dir] [--base-path /prefix]
 *
 * Gate 5 compares still pixels; this proves the JavaScript the theme ships
 * still finds its DOM and does its job, in the two layouts that matter:
 *
 *   desktop 1280×900: tocbot, theme toggle, copy button, search.
 *   mobile   375×812: sidebar opens and closes through the mask, search opens,
 *                     types and returns results.
 *
 * Run it against the deployment shape too (subdirectory `baseURL` + `--minify`)
 * — that is where a doubled base path or a minified inline script breaks the
 * menu while the development build looks fine:
 *
 *   node tests/interactive/check.mjs .out/example --base-path /chirpy-hugo
 *
 * The theme ships its own bundles but loads tocbot, clipboard and the search
 * library from jsDelivr when self-host is off, so that host is allowed and
 * everything else is answered locally.
 */

import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';
import { chromiumPath } from '../lib/browser.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const baseFlag = args.indexOf('--base-path');
const BASE_PATH = baseFlag >= 0 ? args[baseFlag + 1].replace(/\/$/, '') : '';
const SITE = path.resolve(ROOT, args.find((arg, i) => !arg.startsWith('-') && i !== baseFlag + 1) ?? '.out/hugo');
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

function serve(root, prefix) {
  const server = createServer((request, response) => {
    let url = decodeURIComponent(request.url.split('?')[0]);
    if (prefix) {
      if (!url.startsWith(`${prefix}/`) && url !== prefix) {
        response.writeHead(404);
        response.end();
        return;
      }
      url = url.slice(prefix.length) || '/';
    }
    let file = path.join(root, url);
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

const base = `http://127.0.0.1:${PORT}${BASE_PATH}`;
const server = await serve(SITE, BASE_PATH);
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--disable-dev-shm-usage'] });

let failures = 0;
const check = (name, condition) => {
  if (condition) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${name}`);
  }
};

const ALLOWED = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const NETWORK_NOISE = /load failed|networkerror|failed to fetch|network request failed/i;

async function newPage(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { page, errors };
}

async function desktop() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await context.route('**', routeHandler);
  const { page, errors } = await newPage(context);
  await page.goto(`${base}/`, { waitUntil: 'load' });

  // Any build: the first post of the home page, whatever its URL.
  const href = await page.locator('a.post-preview').first().getAttribute('href');
  const postUrl = new URL(href, `${base}/`).toString();
  await page.goto(postUrl, { waitUntil: 'load' });

  await page.waitForSelector('#toc .toc-link', { timeout: 8000 }).catch(() => {});
  const tocLinks = await page.locator('#toc .toc-link').count();
  check(`desktop: tocbot built the table of contents (${tocLinks} links)`, tocLinks > 0);

  const before = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  await page.locator('#mode-toggle').click();
  await page.locator('button.dropdown-item[data-theme-mode="dark"]').click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  check(`desktop: theme toggle switches the theme (${before} → ${after})`, after === 'dark');

  const copy = page.locator('button[aria-label="copy"]').first();
  if (await copy.count()) {
    await copy.click();
    await page.waitForTimeout(300);
    const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    check('desktop: copy button puts the code on the clipboard', copied.length > 0);
  } else {
    console.log('  skip  desktop: copy button (this post has no code block)');
  }

  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.locator('#search-input').fill('hugo');
  await page.waitForFunction(
    () => (document.querySelector('#search-results')?.textContent ?? '').toLowerCase().includes('hugo'),
    { timeout: 8000 },
  ).catch(() => {});
  const results = await page.locator('#search-results a').count();
  check(`desktop: search returns results (${results} links)`, results > 0);

  checkNoScriptErrors('desktop', errors);
  await context.close();
}

async function mobile() {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  await context.route('**', routeHandler);
  const { page, errors } = await newPage(context);
  await page.goto(`${base}/`, { waitUntil: 'load' });

  const sidebarOpen = () =>
    page.evaluate(() => {
      const box = document.querySelector('#sidebar').getBoundingClientRect();
      const mask = getComputedStyle(document.querySelector('#mask'));
      return { left: Math.round(box.left), mask: mask.display };
    });

  await page.locator('#sidebar-trigger').click();
  await page.waitForTimeout(500);
  let state = await sidebarOpen();
  check(`mobile: sidebar opens (left ${state.left}, mask ${state.mask})`, state.left >= -1 && state.mask !== 'none');

  await page.locator('#mask').click({ position: { x: 340, y: 400 } });
  await page.waitForTimeout(500);
  state = await sidebarOpen();
  check(`mobile: tapping the mask closes the sidebar (left ${state.left})`, state.left < -1);

  await page.locator('#search-trigger').click();
  await page.waitForTimeout(600);
  const overlayVisible = await page.locator('#search').isVisible();
  check('mobile: search overlay opens', overlayVisible);

  await page.locator('#search-input').fill('hugo');
  await page.waitForFunction(
    () => (document.querySelector('#search-results')?.textContent ?? '').toLowerCase().includes('hugo'),
    { timeout: 8000 },
  ).catch(() => {});
  const results = await page.locator('#search-results a').count();
  check(`mobile: search returns results (${results} links)`, results > 0);

  await page.locator('#search-cancel').click().catch(() => {});
  await page.waitForTimeout(400);
  check('mobile: search closes with the cancel button', !(await page.locator('#search').isVisible()));

  checkNoScriptErrors('mobile', errors);
  await context.close();
}

function checkNoScriptErrors(layout, errors) {
  const scriptErrors = errors.filter((message) => !NETWORK_NOISE.test(message));
  check(`${layout}: no uncaught script errors`, scriptErrors.length === 0);
  if (scriptErrors.length) console.error(`        ${scriptErrors[0]}`);
}

function routeHandler(route) {
  const url = route.request().url();
  if (url.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue();
  if (ALLOWED.some((host) => url.includes(host))) return route.continue();
  if (url.includes('goatcounter.com')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"count":"1"}' });
  }
  return route.fulfill({ status: 200, body: '', contentType: 'text/plain' });
}

try {
  await desktop();
  await mobile();
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\n${failures} interaction failure(s)` : '\ninteractions verified');
process.exit(failures ? 1 : 0);
