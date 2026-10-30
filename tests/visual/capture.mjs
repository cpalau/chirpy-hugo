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

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';
import { chromiumPath } from '../lib/browser.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PORT = 4001;
const FIXED_TIME = new Date('2026-06-01T12:00:00Z');

// The twelve fixtures, plus the three listing pages of fixture 11.
const FIXTURES = [
  '/', '/posts/full/', '/posts/code/', '/posts/prompts/', '/posts/math/',
  '/posts/mermaid/', '/posts/embeds/', '/posts/images/', '/posts/i18n-es/',
  '/posts/tables-footnotes/', '/about/', '/archives/', '/categories/', '/tags/',
];
const only = process.argv.slice(2).filter((a) => a.startsWith('/'));
const PAGES = only.length
  ? only
  : process.argv.includes('--all')
    ? FIXTURES
    : ['/', '/posts/full/', '/posts/code/'];

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const THEMES = ['light', 'dark'];

// Vendor assets are fetched once and served from disk afterwards: two sides x
// three viewports x fourteen pages would otherwise download MathJax and Mermaid
// dozens of times, which is what made a full run take an hour.
const ALLOWED = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
];
const VENDOR_CACHE = path.join(ROOT, '.out/vendor-cache');

// MathJax and Mermaid are third-party renderers: they replace the markup at
// runtime, take seconds per page and their output depends on their own version.
// The gate measures the *theme*, so they are blocked by default and the source
// markup is compared. `--with-renderers` runs the slow, renderer-included pass.
const WITH_RENDERERS = process.argv.includes('--with-renderers');
const SLOW_RENDERERS = [/mathjax/i, /mermaid/i];

function contentType(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return (
    { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png' }[ext] ||
    'application/octet-stream'
  );
}

async function vendored(url) {
  fs.mkdirSync(VENDOR_CACHE, { recursive: true });
  const file = path.join(VENDOR_CACHE, createHash('sha1').update(url).digest('hex'));
  if (!fs.existsSync(file)) {
    // A stalled CDN must cost seconds, not the OS TCP timeout.
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`${url} -> ${response.status}`);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  return fs.readFileSync(file);
}

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
  const executablePath = chromiumPath();

  const browser = await chromium.launch({
    executablePath,
    args: [
      '--font-render-hinting=none',
      '--force-color-profile=srgb',
      '--disable-lcd-text',
      // /dev/shm is small in containers; Mermaid's SVG allocation crashes the
      // renderer without this, which silently killed the whole batch.
      '--disable-dev-shm-usage',
    ],
  });

  async function captureViewport(theme, viewport) {
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
    await context.route('**', async (route) => {
      const url = route.request().url();
      if (url.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue();
      if (!WITH_RENDERERS && SLOW_RENDERERS.some((re) => re.test(url))) return route.abort();
      if (ALLOWED.some((h) => url.includes(h))) {
        try {
          return route.fulfill({ body: await vendored(url), contentType: contentType(url) });
        } catch {
          return route.abort();
        }
      }
      return route.abort();
    });

    let page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(15000);
    for (const url of PAGES) {
      const started = Date.now();
      if (page.isClosed()) page = await context.newPage();
      try {
        await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        // Force the theme attribute the same way the toggle does, instead of
        // relying on localStorage + matchMedia.
        await page.evaluate((t) => document.documentElement.setAttribute('data-bs-theme', t), theme);
        // Async stylesheets (font icons, lightbox, polyfill) are applied on
        // load; wait for the sheet before waiting for its fonts.
        await page.evaluate(async () => {
          const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
          await Promise.all(
            links.map((link) =>
              link.sheet
                ? Promise.resolve()
                : new Promise((resolve) => {
                    link.addEventListener('load', resolve, { once: true });
                    link.addEventListener('error', resolve, { once: true });
                  }),
            ),
          );
        });
        await page.evaluate(() => document.fonts.ready);
        if (WITH_RENDERERS) {
          await page.evaluate(async () => {
            const withTimeout = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(r, ms))]);
            if (window.MathJax?.startup?.promise) await withTimeout(MathJax.startup.promise, 5000);
            if (document.querySelectorAll('.language-mermaid').length) {
              const deadline = Date.now() + 8000;
              while (document.querySelectorAll('.language-mermaid svg').length === 0 && Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 50));
              }
            }
          });
          await page.waitForTimeout(600);
        }
        // Native media controls paint their time text differently until the
        // media is fully buffered, with or without the vendor scripts.
        await page.waitForFunction(
          () => [...document.querySelectorAll('audio, video')].every((m) => m.readyState >= 4 && !m.seeking),
          { timeout: 8000 },
        ).catch(() => {});
        // A full-page screenshot makes Playwright scroll and stitch, and
        // scroll-driven widgets (tocbot's active item) change mid-shot. One
        // tall viewport removes the scrolling entirely.
        const pageHeight = await page.evaluate(() =>
          Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        );
        await page.setViewportSize({ width: viewport.width, height: Math.min(pageHeight, 9000) });
        await page.evaluate(() => window.scrollTo(0, 0));
        // tocbot's scrollspy recomputes its offsets when the viewport changes and
        // marks a different entry as active for a few frames. Wait until the
        // active entry stops changing, otherwise the TOC column is a flake.
        await page.evaluate(async () => {
          const active = () => document.querySelector('#toc .toc-link.active')?.getAttribute('href') ?? '';
          const deadline = Date.now() + 2000;
          let last = null;
          let stable = 0;
          while (Date.now() < deadline) {
            const current = active();
            if (current === last) stable += 1;
            else {
              stable = 0;
              last = current;
            }
            if (stable >= 3) return;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        });
        await page.waitForTimeout(80);

        const masks = await page.evaluate(() => {
          const rect = (el, id) => {
            const b = el.getBoundingClientRect();
            return { id, x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height };
          };
          const out = [];
          document.querySelectorAll('footer > p:nth-of-type(2)').forEach((el) => out.push(rect(el, 'D-09')));
          document.querySelectorAll('td.rouge-code > pre').forEach((el) => out.push(rect(el, 'D-02')));
          // Native media controls live in the UA shadow DOM and are not
          // deterministic in headless Chromium. The element, its size and its
          // <source> list are still compared (G4 and the height delta).
          document.querySelectorAll('audio, video').forEach((el) => out.push(rect(el, 'D-18')));
          return out;
        });
        const name = `${theme}-${viewport.name}-${url === '/' ? 'home' : url.replace(/^\/|\/$/g, '').replace(/\//g, '-')}.png`;
        await page.screenshot({ path: path.join(outDir, name), animations: 'disabled', caret: 'hide' });
        fs.writeFileSync(path.join(outDir, name.replace(/\.png$/, '.masks.json')), JSON.stringify(masks));
      } catch (error) {
        console.error(`  ${side}: ${theme} ${viewport.name} ${url} — ${error.message.split('\n')[0]}`);
        // a crashed renderer takes the page with it; start a fresh one
        try { await page.close(); } catch {}
      }
      if (process.env.VERBOSE) {
        console.log(`    ${side} ${theme} ${viewport.name} ${url} ${Date.now() - started}ms`);
      }
      if (Date.now() - started > 20000) {
        console.error(`  slow page: ${url} took ${Date.now() - started}ms`);
      }
    }
    await context.close();
    console.log(`  ${side}: ${theme} ${viewport.name} → ${PAGES.length} shot(s)`);
  }

  try {
    const jobs = [];
    for (const theme of THEMES) for (const viewport of VIEWPORTS) jobs.push({ theme, viewport });
    const concurrency = Number(process.env.CAPTURE_CONCURRENCY || 6);
    const worker = async () => {
      while (jobs.length) {
        const job = jobs.shift();
        await captureViewport(job.theme, job.viewport);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
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
