#!/usr/bin/env node
/**
 * Shared helpers for the upstream-question harness (tests/qa).
 *
 * Each question script measures the same input on both sides — real Jekyll,
 * real Hugo — and compares the results against a frozen answer in
 * `tests/qa/expected/`. When Hugo or Jekyll changes behaviour the test fails and
 * a human has to re-read the conclusion. That is the point: the answers in
 * `docs/AUDIT.md` §9 are claims, and these scripts keep them honest.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const ORACLE = path.join(ROOT, 'tests/oracle');
export const QA = path.join(ROOT, 'tests/qa');
export const OUT = path.join(ROOT, '.out/qa');

const env = { ...process.env, BUNDLE_GEMFILE: path.join(ORACLE, 'Gemfile'), TZ: 'UTC', LANG: 'C.UTF-8' };

export function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    ...options,
  });
}

/** Run a Ruby script with the oracle's bundle, feeding `payload` as JSON on stdin. */
export function ruby(script, payload = {}) {
  const file = path.join(OUT, `_ruby-${process.pid}.rb`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, script);
  try {
    return run('bundle', ['exec', 'ruby', file], {
      cwd: ORACLE,
      input: JSON.stringify(payload),
    });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** Build a throwaway Hugo site and return the rendered file `outFile`. */
export function hugo(name, files, { config = {}, outFile = 'index.html' } = {}) {
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'content'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'layouts/_default'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });

  const base = {
    baseURL: 'http://127.0.0.1:4001/',
    title: name,
    disableKinds: ['taxonomy', 'term', 'rss', 'sitemap', 'section'],
    ...config,
  };
  fs.writeFileSync(
    path.join(dir, 'hugo.toml'),
    Object.entries(base)
      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
      .join('\n') + '\n',
  );
  fs.writeFileSync(path.join(dir, 'content/_index.md'), '---\ntitle: home\n---\n');
  fs.writeFileSync(path.join(dir, 'layouts/_default/single.html'), '{{ .Content }}');
  fs.writeFileSync(path.join(dir, 'layouts/home.html'), '');

  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }

  run('hugo', ['--quiet', '--destination', path.join(dir, 'out')], { cwd: dir });
  return fs.readFileSync(path.join(dir, 'out', outFile), 'utf8');
}

/** Compare against the frozen answer; `--update` rewrites it after review. */
export function check(question, actual) {
  const file = path.join(QA, 'expected', `${question}.json`);
  const serialized = `${JSON.stringify(actual, null, 2)}\n`;
  const update = process.argv.includes('--update');

  if (update || !fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, serialized);
    console.log(`${update ? 'updated' : 'created'}: ${path.relative(ROOT, file)}`);
    return true;
  }

  const expected = fs.readFileSync(file, 'utf8');
  // Versions are provenance, not the answer: the Hugo build metadata and the
  // Liquid patch release differ between a workstation and CI, while the counts
  // must not.
  const payload = (text) => {
    const data = JSON.parse(text);
    delete data.versions;
    return JSON.stringify(data);
  };
  if (expected === serialized) {
    console.log(`ok: ${question} — answer unchanged`);
    return true;
  }
  if (payload(expected) === payload(serialized)) {
    console.log(`ok: ${question} — answer unchanged (toolchain versions differ)`);
    return true;
  }

  console.log(`FAIL: ${question} — the measured answer changed`);
  console.log('--- expected');
  console.log(expected);
  console.log('--- actual');
  console.log(serialized);
  console.log('If the new answer is correct, re-read the conclusion in docs/AUDIT.md');
  console.log('§9 and docs/FEATURES.md, then rerun with --update.');
  return false;
}

export function table(rows) {
  const width = Math.max(...rows.map((r) => r[0].length));
  for (const [name, value] of rows) console.log(`  ${name.padEnd(width)}  ${value}`);
}

export function versions() {
  return {
    hugo: run('hugo', ['version']).split('\n')[0].replace(/\s+/g, ' ').trim(),
    jekyll: run('bundle', ['exec', 'ruby', '-e', 'require "jekyll"; print Jekyll::VERSION'], {
      cwd: ORACLE,
    }).trim(),
    liquid: run('bundle', ['exec', 'ruby', '-e', 'require "liquid"; print Liquid::VERSION'], {
      cwd: ORACLE,
    }).trim(),
  };
}

export function main(question, fn) {
  console.log(`\n${question}`);
  let result;
  try {
    result = fn();
  } catch (error) {
    console.error(`error: ${error.message}`);
    if (error.stderr) console.error(String(error.stderr));
    process.exit(2);
  }
  process.exit(check(question, result) ? 0 : 1);
}
