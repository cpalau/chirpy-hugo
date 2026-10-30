#!/usr/bin/env node
/**
 * Gate 6b — Lighthouse budgets.
 *
 *   node tests/performance/check.mjs [hugo-dir] [oracle-dir]
 *
 * Desktop is absolute: the port must match the original, which scores 99–100
 * on performance. Mobile is comparative: upstream Chirpy scores 68 on a
 * throttled phone profile and 6.2 s LCP, so demanding 95 there would fail the
 * Jekyll build too. Accessibility carries the inherited debt of D-20.
 *
 * Lighthouse drives its own Chrome instance; `CHROME_PATH` is set from the same
 * resolver as the rest of the harness.
 */

import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromiumPath } from '../lib/browser.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HUGO = path.resolve(ROOT, process.argv[2] ?? '.out/hugo');
const ORACLE = path.resolve(ROOT, process.argv[3] ?? '.out/oracle');
const BUDGETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/performance/budgets.json'), 'utf8'));

const PAGES = ['/', '/posts/code/'];
const PORTS = { hugo: 4058, oracle: 4059 };

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

function serve(root, port) {
  const server = createServer((request, response) => {
    let file = path.join(root, decodeURIComponent(request.url.split('?')[0]));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      response.writeHead(404);
      response.end();
      return;
    }
    const type = MIME[path.extname(file)] ?? 'application/octet-stream';
    // GitHub Pages compresses text; an uncompressed test server would report a
    // compression opportunity that production does not have.
    if (/^(text\/|application\/(json|javascript|xml))/.test(type)) {
      const body = gzipSync(fs.readFileSync(file));
      response.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', 'content-length': body.length });
      response.end(body);
      return;
    }
    response.writeHead(200, { 'content-type': type });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const runAsync = (bin, args, options) =>
  new Promise((resolve, reject) => {
    execFile(bin, args, options, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stderr }));
      else resolve({ stdout, stderr });
    });
  });

async function lighthouse(url, { desktop }) {
  const out = path.join(os.tmpdir(), `lh-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  const bin = path.join(ROOT, 'node_modules/.bin/lighthouse');
  const args = [
    url,
    '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage',
    '--output=json',
    `--output-path=${out}`,
    '--quiet',
    ...(desktop ? ['--preset=desktop'] : []),
  ];
  try {
    // Async on purpose: an in-process server must keep answering while
    // Lighthouse drives Chrome, or the page load deadlocks.
    await runAsync(bin, args, {
      cwd: ROOT,
      env: { ...process.env, CHROME_PATH: chromiumPath() },
      timeout: 240000,
    });
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    fs.rmSync(out, { force: true });
    return report;
  } catch (error) {
    fs.rmSync(out, { force: true });
    const detail = String(error.stderr ?? '').split('\n').filter(Boolean).at(-1) ?? error.message;
    throw new Error(`lighthouse failed for ${url}: ${detail}`);
  }
}

const score = (report, category) => Math.round((report.categories[category].score ?? 0) * 100);
const metric = (report, key) => report.audits[key].numericValue;

const servers = [];
for (const [side, port] of Object.entries(PORTS)) {
  const dir = side === 'hugo' ? HUGO : ORACLE;
  if (fs.existsSync(dir)) servers.push(await serve(dir, port));
}

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};

try {
  for (const page of PAGES) {
    for (const profile of ['desktop', 'mobile']) {
      const desktop = profile === 'desktop';
      const ours = await lighthouse(`http://127.0.0.1:${PORTS.hugo}${page}`, { desktop });
      const label = `${profile} ${page}`;

      if (desktop) {
        const budget = BUDGETS.desktop;
        for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) {
          const value = score(ours, category);
          if (value < budget[category]) fail(`${label}: ${category} ${value} < ${budget[category]}`);
        }
        for (const [key, limit] of Object.entries({
          'largest-contentful-paint': budget['largest-contentful-paint'],
          'cumulative-layout-shift': budget['cumulative-layout-shift'],
          'total-blocking-time': budget['total-blocking-time'],
        })) {
          const value = metric(ours, key);
          const unit = key === 'cumulative-layout-shift' ? '' : ' ms';
          if (key === 'largest-contentful-paint' && value > limit * 1000) {
            fail(`${label}: LCP ${(value / 1000).toFixed(2)} s > ${limit} s`);
          } else if (key === 'cumulative-layout-shift' && value > limit) {
            fail(`${label}: CLS ${value.toFixed(3)} > ${limit}`);
          } else if (key === 'total-blocking-time' && value > limit) {
            fail(`${label}: TBT ${Math.round(value)}${unit} > ${limit} ms`);
          }
        }
        console.log(
          `  ok    ${label}: perf ${score(ours, 'performance')}, a11y ${score(ours, 'accessibility')}, ` +
            `BP ${score(ours, 'best-practices')}, SEO ${score(ours, 'seo')}, ` +
            `LCP ${(metric(ours, 'largest-contentful-paint') / 1000).toFixed(2)} s`,
        );
      } else if (fs.existsSync(ORACLE)) {
        const theirs = await lighthouse(`http://127.0.0.1:${PORTS.oracle}${page}`, { desktop: false });
        const perfDelta = score(ours, 'performance') - score(theirs, 'performance');
        const lcpDelta = (metric(ours, 'largest-contentful-paint') - metric(theirs, 'largest-contentful-paint')) / 1000;
        if (perfDelta < -BUDGETS.mobile['performance-delta']) {
          fail(`${label}: performance ${perfDelta} points below Jekyll`);
        }
        if (lcpDelta > BUDGETS.mobile['largest-contentful-paint-delta']) {
          fail(`${label}: LCP ${lcpDelta.toFixed(2)} s slower than Jekyll`);
        }
        console.log(
          `  ok    ${label}: perf ${score(ours, 'performance')} (Jekyll ${score(theirs, 'performance')}), ` +
            `LCP ${(metric(ours, 'largest-contentful-paint') / 1000).toFixed(2)} s ` +
            `(Jekyll ${(metric(theirs, 'largest-contentful-paint') / 1000).toFixed(2)} s)`,
        );
      } else {
        console.log(`  skip  ${label}: no oracle build to compare with`);
      }
    }
  }
} finally {
  for (const server of servers) server.close();
}

console.log(failures ? `\n${failures} performance failure(s)` : '\nperformance budgets met');
process.exit(failures ? 1 : 0);
