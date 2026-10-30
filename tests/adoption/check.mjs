#!/usr/bin/env node
/**
 * Gate 9 — adoption.
 *
 *   node tests/adoption/check.mjs
 *
 * A theme is only finished if a stranger can build their own site with it. This
 * gate builds four things:
 *
 *   1. a fresh site with the starter configuration and no content;
 *   2. the same site under a subdirectory `baseURL`;
 *   3. the demo site in the shape GitHub Pages deploys it (subdirectory
 *      `baseURL` + `--minify`), checking every emitted URL;
 *   4. `gohugoio/HugoBasicExample`, cloned once into `.out/adoption/`.
 *
 * Every build must exit 0 with `--panicOnWarning`, which is the strictest form
 * of "no warnings". Set `HUGO` to the binary to use; the default is `hugo`.
 *
 * The third build is the one that catches production-only bugs: a base path
 * counted twice, an asset that 404s, or a taxonomy page that renders empty.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const WORK = path.join(ROOT, '.out/adoption');
const HUGO = process.env.HUGO ?? 'hugo';
const THEMES_DIR = path.dirname(ROOT);
const THEME = path.basename(ROOT);
const BASIC = path.join(WORK, 'HugoBasicExample');
const DEPLOY_BASE = '/chirpy-hugo/';

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};

function build(name, source, extra = []) {
  const out = path.join(WORK, `${name}-out`);
  fs.rmSync(out, { recursive: true, force: true });
  try {
    execFileSync(
      HUGO,
      ['-s', source, '--themesDir', THEMES_DIR, '--theme', THEME, '--panicOnWarning', '--gc', '-d', out, ...extra],
      { stdio: 'pipe', encoding: 'utf8' },
    );
  } catch (error) {
    fail(`${name}: build failed\n${error.stderr ?? error.message}`);
    return null;
  }
  if (!fs.existsSync(path.join(out, 'index.html'))) {
    fail(`${name}: build succeeded but produced no index.html`);
    return null;
  }
  console.log(`  ok    ${name}`);
  return out;
}

const walk = (dir, root = dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, root, acc);
    else acc.push(path.relative(root, abs));
  }
  return acc;
};

/** Check every URL emitted by a subdirectory deployment. */
function checkDeployment(out) {
  const html = walk(out).filter((file) => file.endsWith('.html'));
  const exists = (url) => {
    const rel = decodeURIComponent(url.split('?')[0].split('#')[0]).replace(DEPLOY_BASE, '');
    return [rel, `${rel}index.html`].some((candidate) => fs.existsSync(path.join(out, candidate)));
  };

  let doubled = 0;
  let broken = 0;
  for (const file of html) {
    const source = fs.readFileSync(path.join(out, file), 'utf8');
    for (const match of source.matchAll(/(?:href|src)=["']?(\/[^"'\s>]*)/g)) {
      const url = match[1];
      if (url.startsWith(`${DEPLOY_BASE}${DEPLOY_BASE.slice(1)}`)) {
        doubled += 1;
        if (doubled <= 3) console.error(`        ${file}: doubled base path ${url}`);
      }
      if (url.startsWith(DEPLOY_BASE) && !exists(url)) {
        broken += 1;
        if (broken <= 3) console.error(`        ${file}: ${url} does not resolve`);
      }
    }
  }
  if (doubled) fail(`deployment: ${doubled} URL(s) repeat the base path`);
  else console.log('  ok    deployment: no URL repeats the base path');
  if (broken) fail(`deployment: ${broken} internal URL(s) do not resolve`);
  else console.log('  ok    deployment: every internal URL resolves');

  // A taxonomy index without terms is a rendering bug, not an empty site.
  for (const [file, pattern] of [
    ['categories/index.html', /\/chirpy-hugo\/categories\/[^/"']+\//],
    ['tags/index.html', /\/chirpy-hugo\/tags\/[^/"']+\//],
  ]) {
    const target = path.join(out, file);
    if (!fs.existsSync(target)) {
      fail(`deployment: ${file} is missing`);
      continue;
    }
    if (!pattern.test(fs.readFileSync(target, 'utf8'))) {
      fail(`deployment: ${file} lists no terms`);
    } else {
      console.log(`  ok    deployment: ${file} lists terms`);
    }
  }
}

fs.mkdirSync(WORK, { recursive: true });

// `--deploy-only` is the fast check CI runs on every PR: it builds the demo in
// the deployment shape and validates the emitted HTML, nothing else.
if (process.argv.includes('--deploy-only')) {
  const deployOnly = build('demo in deployment shape (subdirectory + minify)', path.join(ROOT, 'exampleSite'), [
    '--baseURL',
    `https://example.com${DEPLOY_BASE}`,
    '--minify',
  ]);
  if (deployOnly) checkDeployment(deployOnly);
  console.log(failures ? `\n${failures} deployment failure(s)` : '\ndeployment verified');
  process.exit(failures ? 1 : 0);
}

// 1. Fresh site: the starter configuration is the whole config.
const fresh = path.join(WORK, 'fresh');
fs.rmSync(fresh, { recursive: true, force: true });
fs.mkdirSync(path.join(fresh, 'content', 'posts'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'starter/hugo.toml'), path.join(fresh, 'hugo.toml'));
fs.writeFileSync(
  path.join(fresh, 'content/posts/hello.md'),
  '---\ntitle: "Hello"\ndate: 2026-01-01T00:00:00Z\ncategories: ["Blogging"]\ntags: ["hello"]\n---\n\nA post.\n',
);
build('fresh site (empty params, one post)', fresh);

// 2. Subdirectory deployment: every theme URL must carry the base path.
const subdir = path.join(WORK, 'subdir');
fs.rmSync(subdir, { recursive: true, force: true });
fs.cpSync(fresh, subdir, { recursive: true });
const out = build('subdirectory baseURL', subdir, ['--baseURL', 'https://example.com/blog/']);
if (out) {
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const broken = [...html.matchAll(/(?:href|src)="(\/(?!blog\/)[^"]*)"/g)].map((m) => m[1]);
  const legitimate = broken.filter((url) => !url.startsWith('//'));
  if (legitimate.length) {
    fail(`subdirectory baseURL: ${legitimate.length} URL(s) lost the base path, e.g. ${legitimate[0]}`);
  } else {
    console.log('  ok    subdirectory baseURL: every theme URL keeps /blog/');
  }
}

// 3. The demo in the shape GitHub Pages deploys it.
const deploy = build('demo in deployment shape (subdirectory + minify)', path.join(ROOT, 'exampleSite'), [
  '--baseURL',
  `https://example.com${DEPLOY_BASE}`,
  '--minify',
]);
if (deploy) checkDeployment(deploy);

// 4. HugoBasicExample, cloned once.
if (!fs.existsSync(BASIC)) {
  try {
    execFileSync('git', ['clone', '--depth', '1', 'https://github.com/gohugoio/HugoBasicExample.git', BASIC], {
      stdio: 'pipe',
    });
  } catch (error) {
    console.log(`  skip  HugoBasicExample: clone failed (${error.message.split('\n')[0]})`);
    console.log(failures ? `\n${failures} adoption failure(s)` : '\nadoption verified (with skips)');
    process.exit(failures ? 1 : 0);
  }
}
build('HugoBasicExample', BASIC);

console.log(failures ? `\n${failures} adoption failure(s)` : '\nadoption verified');
process.exit(failures ? 1 : 0);
