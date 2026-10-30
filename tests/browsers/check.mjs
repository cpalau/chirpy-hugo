#!/usr/bin/env node
/**
 * Cross-browser spot check.
 *
 *   node tests/browsers/check.mjs [build-dir]
 *
 * Parity is measured in Chromium because both sides of the comparison use the
 * same engine. This gate answers a different question: does the theme load and
 * lay out in another engine without errors? It checks the home page and a post
 * in Firefox and WebKit, asserts the chrome is visible and the stylesheet is
 * applied, and writes a screenshot for review.
 *
 * A browser that cannot launch on the host is reported as skipped. CI installs
 * both with their system dependencies and sets `REQUIRE_BROWSERS=1`, which
 * turns a skip into a failure.
 *
 * Third-party hosts (analytics, comments) are answered with an empty 200
 * instead of an aborted request: WebKit surfaces an abort as an uncaught
 * `TypeError: Load failed` inside the page, which says nothing about the theme.
 */

import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { firefox, webkit } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SITE = path.resolve(ROOT, process.argv[2] ?? '.out/hugo');
const PORT = 4061;
const STRICT = process.env.REQUIRE_BROWSERS === '1';
const PAGES = [
  { url: '/', selectors: ['#sidebar', '#topbar', '#post-list', '.post-preview'] },
  { url: '/posts/full/', selectors: ['main>article[data-toc="true"]', '.content', '.post-tail-wrapper'] },
];
const ENGINES = [
  ['firefox', firefox],
  ['webkit', webkit],
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
};

if (!fs.existsSync(SITE)) {
  console.error(`missing build in ${SITE}`);
  process.exit(2);
}

const server = await new Promise((resolve) => {
  const instance = createServer((request, response) => {
    let file = path.join(SITE, decodeURIComponent(request.url.split('?')[0]));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  instance.listen(PORT, '127.0.0.1', () => resolve(instance));
});

const outDir = path.join(ROOT, '.out/browsers');
fs.mkdirSync(outDir, { recursive: true });

let failures = 0;
let skipped = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};

for (const [name, type] of ENGINES) {
  let browser;
  try {
    browser = await type.launch();
  } catch (error) {
    skipped += 1;
    const lines = String(error.message).split('\n').map((line) => line.trim()).filter(Boolean);
    const reason = lines.find((line) => /missing|dependencies|cannot|lib/i.test(line)) ?? lines.at(-1) ?? 'launch failed';
    if (STRICT) fail(`${name}: cannot launch (${reason})`);
    else console.log(`  skip  ${name}: cannot launch on this host (${reason.trim()})`);
    continue;
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ALLOWED = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  await context.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue();
    if (ALLOWED.some((host) => url.includes(host))) return route.continue();
    // The pageview counter expects JSON; an empty body makes its `.then` throw
    // inside WebKit and looks like a theme error.
    if (url.includes('goatcounter.com')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"count":"1"}' });
    }
    return route.fulfill({ status: 200, body: '', contentType: 'text/plain' });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  for (const { url, selectors } of PAGES) {
    await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(400);

    const missing = [];
    for (const selector of selectors) {
      if ((await page.locator(selector).count()) === 0) missing.push(selector);
    }
    if (missing.length) {
      fail(`${name} ${url}: missing ${missing.join(', ')}`);
      continue;
    }

    const applied = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const heading = document.querySelector('h1, h2');
      return {
        font: body.fontFamily,
        background: body.backgroundColor,
        headingVisible: heading ? heading.getBoundingClientRect().height > 0 : false,
      };
    });
    if (!applied.headingVisible) fail(`${name} ${url}: no visible heading`);
    if (applied.background === 'rgba(0, 0, 0, 0)' && url === '/') {
      fail(`${name} ${url}: stylesheet does not set a body background`);
    }

    const shot = path.join(outDir, `${name}-${url === '/' ? 'home' : 'post'}.png`);
    await page.screenshot({ path: shot, fullPage: false, animations: 'disabled', caret: 'hide' });
    console.log(`  ok    ${name} ${url} (${selector_ok(selectors.length)} selectors, ${applied.font.split(',')[0]})`);
  }

  // WebKit reports a blocked beacon or fetch as `TypeError: Load failed`
  // inside the page even when the response is an empty 200. That is a harness
  // artefact: the gate fails on script errors, and only notes network ones.
  const network = /load failed|networkerror|failed to fetch|network request failed/i;
  const scriptErrors = errors.filter((message) => !network.test(message));
  if (scriptErrors.length) {
    fail(`${name}: ${scriptErrors.length} script error(s), first: ${scriptErrors[0].split('\n')[0]}`);
  } else if (errors.length) {
    console.log(`  ok    ${name}: no script errors (${errors.length} blocked network call(s))`);
  } else {
    console.log(`  ok    ${name}: no uncaught page errors`);
  }
  await browser.close();
}

function selector_ok(count) {
  return `${count}/${count}`;
}

server.close();
if (failures) console.log(`\n${failures} cross-browser failure(s)`);
else if (skipped) console.log(`\ncross-browser verified (${skipped} engine(s) skipped)`);
else console.log('\ncross-browser verified');
process.exit(failures ? 1 : 0);
