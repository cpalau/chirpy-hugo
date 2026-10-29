#!/usr/bin/env node
/**
 * Gate 5 — visual capture.
 *
 * Screenshots one build at a time, on the same port and with the same baseURL,
 * because absolute URLs appear in canonical links, og:url and share buttons.
 *
 *   node tests/visual/capture.mjs oracle    # → .out/shots/oracle
 *   node tests/visual/capture.mjs hugo      # → .out/shots/hugo
 *
 * Determinism (docs/TESTING.md §7.3):
 *   · fixed clock, reduced motion, animations and caret disabled;
 *   · fonts, icons and vendor scripts allowed (both sides load the same ones);
 *   · analytics, comments, embeds and pageview counters blocked;
 *   · local HTTP server, same port for both passes.
 */

import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PORT = 4001;
const FIXED_TIME = new Date('2026-06-01T12:00:00Z');

// The twelve fixtures, plus the three listing pages of fixture 11.
const FIXTURES = [
  '/', '/posts/full/', '/posts/code/', '/posts/prompts/', '/posts/math/',
  '/posts/mermaid/', '/posts/embeds/', '/posts/images/', '/posts/i18n-es/',
  '/posts/tables-footnotes/', '/about/', '/archives/', '/categories/', '/tags/',
];
const PAGES = process.argv.includes('--all')
  ? FIXTURES
  : ['/', '/posts/full/', '/posts/code/'];

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const THEMES = ['light', 'dark'];

const ALLOWED = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function serve(root) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(root, url);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const side = process.argv[2];
  if (!['oracle', 'hugo'].includes(side)) {
    console.error('usage: capture.mjs <oracle|hugo> [--all]');
    process.exit(2);
  }
  const source = path.join(ROOT, '.out', side);
  if (!fs.existsSync(source)) {
    console.error(`missing build: ${path.relative(ROOT, source)}`);
    process.exit(2);
  }
  const outDir = path.join(ROOT, '.out/shots', side);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const server = await serve(source);
  const executablePath =
    process.env.CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome`;

  const browser = await chromium.launch({
    executablePath,
    args: ['--font-render-hinting=none', '--force-color-profile=srgb', '--disable-lcd-text'],
  });

  try {
    for (const theme of THEMES) {
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          colorScheme: theme,
          reducedMotion: 'reduce',
          locale: 'en-US',
          timezoneId: 'UTC',
        });
        await context.addInitScript(`
          const fixed = ${FIXED_TIME.getTime()};
          const RealDate = Date;
          class FixedDate extends RealDate {
            constructor(...args) { super(...(args.length ? args : [fixed])); }
            static now() { return fixed; }
          }
          Date = FixedDate;
        `);
        await context.route('**', (route) => {
          const url = route.request().url();
          if (url.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue();
          if (ALLOWED.some((h) => url.includes(h))) return route.continue();
          return route.abort();
        });

        const page = await context.newPage();
        for (const url of PAGES) {
          await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: 'load' });
          // Force the theme attribute the same way the toggle does, instead of
          // relying on localStorage + matchMedia.
          await page.evaluate((t) => document.documentElement.setAttribute('data-bs-theme', t), theme);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(250);
          const name = `${theme}-${viewport.name}-${url === '/' ? 'home' : url.replace(/^\/|\/$/g, '').replace(/\//g, '-')}.png`;
          // Declared exceptions: D-09 (footer branding) and D-02 (code token
          // colours). Their boxes are recorded so the comparator can prove that
          // *nothing else* differs by a single pixel.
          const masks = await page.evaluate(() => {
            const rect = (el, id) => {
              const b = el.getBoundingClientRect();
              return { id, x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height };
            };
            const out = [];
            document.querySelectorAll('footer > p:nth-of-type(2)').forEach((el) => out.push(rect(el, 'D-09')));
            document.querySelectorAll('td.rouge-code > pre').forEach((el) => out.push(rect(el, 'D-02')));
            return out;
          });
          await page.screenshot({ path: path.join(outDir, name), fullPage: true, animations: 'disabled', caret: 'hide' });
          fs.writeFileSync(path.join(outDir, name.replace(/\.png$/, '.masks.json')), JSON.stringify(masks));
        }
        await context.close();
        console.log(`  ${side}: ${theme} ${viewport.name} → ${PAGES.length} shot(s)`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`shots: ${path.relative(ROOT, outDir)}`);
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exit(2);
});
