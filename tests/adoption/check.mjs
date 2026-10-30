#!/usr/bin/env node
/**
 * Gate 9 — adoption.
 *
 *   node tests/adoption/check.mjs
 *
 * A theme is only finished if a stranger can build their own site with it. This
 * gate builds three sites that nobody tuned for us:
 *
 *   1. a fresh site with the starter configuration and no content;
 *   2. the same site deployed under a subdirectory `baseURL`;
 *   3. `gohugoio/HugoBasicExample`, cloned once into `.out/adoption/`.
 *
 * Every build must exit 0 with `--panicOnWarning`, which is the strictest form
 * of "no warnings". Set `HUGO` to the binary to use; the default is `hugo`.
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

fs.mkdirSync(WORK, { recursive: true });

// 1. Fresh site: the starter configuration is the whole config.
const fresh = path.join(WORK, 'fresh');
fs.rmSync(fresh, { recursive: true, force: true });
fs.mkdirSync(path.join(fresh, 'content', 'posts'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'starter/hugo.toml'), path.join(fresh, 'hugo.toml'));
fs.writeFileSync(
  path.join(fresh, 'content/posts/hello.md'),
  '---\ntitle: "Hello"\ndate: 2026-01-01T00:00:00Z\n---\n\nA post.\n',
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

// 3. HugoBasicExample, cloned once.
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
