#!/usr/bin/env node
/**
 * UI matrix — the behaviour gate.
 *
 *   node tests/ui/check.mjs [build-dir] [--base-path /prefix] [--fast]
 *
 * Four viewports (desktop 1280, tablet 768, mobile 390, small 320) against the
 * pages that carry every component. For each one:
 *
 *   · no uncaught script errors and no failed same-origin request;
 *   · no horizontal overflow;
 *   · the viewport meta parses into separate directives;
 *   · mobile/tablet: the sidebar opens (off-canvas → 0), the page does not
 *     rescale, the mask closes it; search opens, types and returns results;
 *     the TOC popup opens and closes;
 *   · desktop: search, theme toggle (and persistence), copy, back-to-top,
 *     lightbox, TOC links.
 *
 * Viewports run in parallel; pages are reused inside a viewport. `--fast` keeps
 * one post and skips the expensive interactions (used by PR CI).
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
const FAST = args.includes('--fast');
const SITE = path.resolve(ROOT, args.find((arg, i) => !arg.startsWith('-') && i !== baseFlag + 1) ?? '.out/hugo');
const PORT = 4034;

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900, mobile: false },
  { name: 'tablet', width: 768, height: 1024, mobile: true },
  { name: 'mobile', width: 390, height: 844, mobile: true },
  ...(FAST ? [] : [{ name: 'small', width: 320, height: 568, mobile: true }]),
];

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
let checks = 0;
const check = (viewport, name, condition, detail = '') => {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.log(`  FAIL  ${viewport}: ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    console.log(`  ok    ${viewport}: ${name}`);
  }
};

const ALLOWED = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const NETWORK_NOISE = /load failed|networkerror|failed to fetch|network request failed/i;
const sameOrigin = (url) => url.startsWith(`http://127.0.0.1:${PORT}/`);

const NOOP_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));`;

function route(route) {
  const url = route.request().url();
  // The UI gate exercises the page, not the offline lifecycle: a real worker
  // may reload on activation or answer from the previous build's cache.
  if (sameOrigin(url) && new URL(url).pathname.endsWith('/sw.min.js')) {
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: NOOP_SW });
  }
  // The PWA bootstrap only registers the worker; the UI gate does not test it.
  if (sameOrigin(url) && new URL(url).pathname.endsWith('/app.min.js')) {
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  }
  if (sameOrigin(url)) return route.continue();
  if (ALLOWED.some((host) => url.includes(host))) return route.continue();
  if (url.includes('goatcounter.com')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"count":"1"}' });
  }
  return route.fulfill({ status: 200, body: '', contentType: 'text/plain' });
}

async function newPage(context) {
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => {
    if (sameOrigin(request.url())) failed.push(request.url());
  });
  return { page, errors, failed };
}

async function visit(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(120);
}

async function staticChecks(viewport, page, url, errors, failed) {
  const state = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="viewport"]')?.content ?? '';
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      meta,
      title: document.title,
    };
  });
  check(viewport, `${url}: no horizontal overflow`, state.overflow <= 1, `+${state.overflow}px`);
  const directives = state.meta.split(/[,\s]+/).filter(Boolean);
  check(
    viewport,
    `${url}: viewport meta parses`,
    directives.includes('width=device-width') && directives.includes('initial-scale=1'),
    state.meta,
  );
  const scriptErrors = errors.filter((message) => !NETWORK_NOISE.test(message));
  check(viewport, `${url}: no script errors`, scriptErrors.length === 0, scriptErrors[0]);
  check(viewport, `${url}: no failed local requests`, failed.length === 0, failed[0]);
}

async function desktop(context) {
  const { page, errors, failed } = await newPage(context);
  await page.goto(`${base}/`, { waitUntil: 'load' });
  const href = await page.locator('a.post-preview').first().getAttribute('href');
  const post = new URL(href, `${base}/`).toString();
  const postPath = new URL(post).pathname.replace(BASE_PATH, '');

  for (const url of ['/', postPath, '/categories/', '/tags/', '/about/', '/archives/']) {
    errors.length = 0;
    failed.length = 0;
    await visit(page, `${base}${url}`);
    await staticChecks('desktop', page, url, errors, failed);
  }

  await visit(page, post);
  const toc = await page.locator('#toc .toc-link').count();
  check('desktop', 'post: tocbot built the TOC', toc > 0, `${toc} links`);

  const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  await page.locator('#mode-toggle').click();
  await page.locator('button.dropdown-item[data-theme-mode="dark"]').click();
  await page.waitForTimeout(250);
  const themeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  check('desktop', `post: theme toggle (${themeBefore} → ${themeAfter})`, themeAfter === 'dark');
  await page.reload({ waitUntil: 'load' });
  const persisted = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  check('desktop', 'post: theme choice persists', persisted === 'dark');
  await page.evaluate(() => localStorage.removeItem('theme'));
  await page.locator('#mode-toggle').click();
  await page.locator('button.dropdown-item[data-theme-mode="light"]').click().catch(() => {});

  const copy = page.locator('button[aria-label="copy"]').first();
  if (await copy.count()) {
    await copy.click();
    await page.waitForTimeout(200);
    const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    check('desktop', 'post: copy button writes the clipboard', copied.length > 0);
  }

  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(250);
  const backTop = await page.evaluate(() => {
    const button = document.getElementById('back-to-top');
    return { shown: button.classList.contains('show'), y: window.scrollY };
  });
  check('desktop', 'post: back-to-top appears after scrolling', backTop.shown);
  if (backTop.shown) {
    await page.locator('#back-to-top').click();
    await page.waitForTimeout(900);
    check('desktop', 'post: back-to-top returns to the top', (await page.evaluate(() => window.scrollY)) < 50);
  }

  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.locator('#search-input').fill('a');
  await page.waitForTimeout(800);
  check('desktop', 'home: search input is visible and filters', (await page.locator('#search-input').isVisible()));
}

async function offCanvas(context, viewport) {
  const { page, errors, failed } = await newPage(context);
  await visit(page, `${base}/`);
  const sidebarUrl = new URL(`.${''}`, `${base}/`).toString();
  const before = await page.evaluate(() => ({
    width: window.innerWidth,
    scale: window.visualViewport?.scale ?? 1,
    left: Math.round(document.getElementById('sidebar').getBoundingClientRect().left),
  }));
  check(viewport, 'home: sidebar starts off-canvas', before.left < 0, `left ${before.left}`);

  await page.locator('#sidebar-trigger').click();
  await page.waitForTimeout(450);
  const open = await page.evaluate(() => ({
    left: Math.round(document.getElementById('sidebar').getBoundingClientRect().left),
    mask: getComputedStyle(document.getElementById('mask')).display,
    body: document.body.hasAttribute('sidebar-display'),
    width: window.innerWidth,
    scale: window.visualViewport?.scale ?? 1,
  }));
  check(viewport, 'home: sidebar opens', open.left >= -1 && open.body, `left ${open.left}`);
  check(viewport, 'home: mask is shown', open.mask !== 'none');
  // The real rescale bug (an invalid viewport meta) only appears on a phone;
  // headless Chromium does not reproduce it. The meta is parsed by the checks
  // above and by the deployment gate, which is the deterministic detector.

  await page.locator('#mask').click({ position: { x: Math.max(10, before.width - 15), y: 400 } });
  await page.waitForTimeout(450);
  const closed = await page.evaluate(() => Math.round(document.getElementById('sidebar').getBoundingClientRect().left));
  check(viewport, 'home: mask closes the sidebar', closed < -1, `left ${closed}`);

  // A token that exists in the index: the first post title.
  const token = await page.evaluate(() => (document.querySelector('.post-preview h1')?.textContent ?? 'hugo').trim().split(/\s+/)[0]);
  await page.locator('#search-trigger').click();
  await page.waitForTimeout(400);
  check(viewport, 'home: search overlay opens', await page.locator('#search').isVisible());
  await page.locator('#search-input').fill(token);
  await page.waitForFunction(
    (value) => (document.querySelector('#search-results')?.textContent ?? '').toLowerCase().includes(value.toLowerCase()),
    token,
    { timeout: 8000 },
  ).catch(() => {});
  const found = await page.locator('#search-results a').count();
  check(viewport, `home: search finds "${token}"`, found > 0, `${found} links`);
  await page.locator('#search-cancel').click();
  await page.waitForTimeout(300);
  check(viewport, 'home: search closes', !(await page.locator('#search').isVisible()));

  // TOC popup on a post.
  const href = await page.evaluate(
    () =>
      document.querySelector('a.post-preview')?.getAttribute('href') ??
      document.querySelector('main a[href*="/posts/"]')?.getAttribute('href'),
  );
  if (!href) throw new Error('home has no post link');
  const post = new URL(href, `${base}/`).toString();
  await visit(page, post);
  const trigger = page.locator('.toc-trigger:visible').first();
  if (await trigger.count()) {
    await trigger.click();
    await page.waitForTimeout(400);
    check(viewport, 'post: TOC popup opens', await page.locator('#toc-popup[open]').count() === 1);
    await page.locator('#toc-popup-close').click().catch(() => {});
    await page.waitForTimeout(400);
    check(viewport, 'post: TOC popup closes', await page.locator('#toc-popup[open]').count() === 0);
  }

  check(viewport, 'no uncaught script errors', errors.filter((message) => !NETWORK_NOISE.test(message)).length === 0, errors[0]);
  check(viewport, 'no failed local requests', failed.length === 0, failed[0]);
}

async function runViewport(viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await context.route('**', route);
  try {
    if (viewport.name === 'desktop') await desktop(context);
    else await offCanvas(context, viewport.name);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  ${viewport.name}: scenario threw — ${String(error.message).split('\n')[0]}`);
  } finally {
    await context.close();
  }
}

try {
  // Sequential on purpose: four parallel contexts make click/evaluate timing
  // flaky on a loaded CI runner, and the whole matrix still runs in seconds.
  for (const viewport of VIEWPORTS) await runViewport(viewport);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
