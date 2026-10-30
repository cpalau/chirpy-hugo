#!/usr/bin/env node
/**
 * Capture the theme gallery images from the demo site.
 *
 *   node scripts/screenshot.mjs [--dir .out/example]
 *
 * Produces `images/screenshot.png` (1500×1000) and `images/tn.png` (900×600),
 * the sizes themes.gohugo.io requires. The demo has to be built first:
 *
 *   hugo -s exampleSite --themesDir .. --theme chirpy-hugo -d .out/example
 *
 * The capture is offline (external requests aborted) and waits for fonts, so it
 * is reproducible across machines: same viewport, same device scale, no
 * animation, no caret.
 */

import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';
import { chromiumPath } from '../tests/lib/browser.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dirArg = args.indexOf('--dir');
const SITE = path.resolve(ROOT, dirArg >= 0 ? args[dirArg + 1] : '.out/example');
const PORT = 4010;
// The gallery needs the real typography and icon font; everything else stays
// blocked so an unexpected third party cannot appear in the image.
const ALLOWED = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

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

function serve(root) {
  const server = createServer((request, response) => {
    let file = path.join(root, decodeURIComponent(request.url.split('?')[0]));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

const browserPath = chromiumPath();

if (!fs.existsSync(SITE)) {
  console.error(`no built site in ${SITE}: build the demo first (see the header of this file)`);
  process.exit(1);
}

const server = await serve(SITE);
const browser = await chromium.launch({ executablePath: browserPath, args: ['--disable-dev-shm-usage'] });

try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await context.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue();
    if (ALLOWED.some((host) => url.includes(host))) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  await page.screenshot({ path: path.join(ROOT, 'images/screenshot.png'), animations: 'disabled', caret: 'hide' });
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(ROOT, 'images/tn.png'), animations: 'disabled', caret: 'hide' });

  console.log('images/screenshot.png (1500×1000)');
  console.log('images/tn.png (900×600)');
} finally {
  await browser.close();
  server.close();
}
