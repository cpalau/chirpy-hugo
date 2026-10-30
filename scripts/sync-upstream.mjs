#!/usr/bin/env node
/**
 * Sync the theme with the pinned upstream tree, by mode.
 *
 *   node scripts/sync-upstream.mjs             # report only, touches nothing
 *   node scripts/sync-upstream.mjs --apply     # copy `copy` files, then verify
 *   node scripts/sync-upstream.mjs --check     # verify only (fetch-upstream)
 *
 * The report classifies every upstream file: `copy` files that would change,
 * `manual` files a human must port, `transform` files a generator owns, and
 * `retired` files absorbed by Hugo. It is the list a release works through.
 *
 * `copy` means byte-identical: after running this, `fetch-upstream.mjs --check`
 * must report zero drift. Generated artifacts (`assets/js/dist`,
 * `assets/scss/vendors`) are copied from the published gem, never rebuilt
 * (D-10).
 *
 * `manual` and `retired` entries are reported, never touched.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readPorts } from './fetch-upstream.mjs';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');

async function walk(dir, prefix = '') {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

async function main() {
  const argv = new Set(process.argv.slice(2));
  const apply = argv.has('--apply');
  const checkOnly = argv.has('--check');

  if (apply && checkOnly) {
    console.error('usage: sync-upstream.mjs [--apply | --check]');
    process.exit(2);
  }

  if (checkOnly) {
    const check = spawnSync(process.execPath, [path.join(ROOT, 'scripts/fetch-upstream.mjs'), '--check'], {
      stdio: 'inherit',
    });
    process.exit(check.status ?? 1);
  }

  const ports = await readPorts();
  const sha = ports.upstream.sha;
  const cache = path.join(ROOT, '.out/upstream', sha);
  if (!existsSync(path.join(cache, 'tag'))) {
    console.error(`missing upstream cache (.out/upstream/${sha}); run:`);
    console.error('  node scripts/fetch-upstream.mjs --generate');
    process.exit(2);
  }

  const copies = [];
  const others = [];

  for (const [key, entry] of Object.entries(ports.files)) {
    if (entry.mode !== 'copy') {
      others.push([key, entry.mode]);
      continue;
    }
    if (!apply) {
      // Report mode still needs the diff, so the file list is built without
      // writing anything.
      const tree = entry.source === 'gem' ? 'gem' : 'tag';
      const from = path.join(cache, tree, key);
      if (key.endsWith('/') && existsSync(from)) {
        for (const rel of await walk(from)) {
          if (ports.files[key + rel]) continue;
          const to = path.join(ROOT, entry.target + rel);
          const differs = !existsSync(to) || !(await fs.readFile(from + '/' + rel)).equals(await fs.readFile(to));
          if (differs) copies.push([path.join(from, rel), to]);
        }
      } else if (existsSync(from)) {
        const to = path.join(ROOT, entry.target);
        const differs = !existsSync(to) || !(await fs.readFile(from)).equals(await fs.readFile(to));
        if (differs) copies.push([from, to]);
      }
      continue;
    }
    const tree = entry.source === 'gem' ? 'gem' : 'tag';
    const from = path.join(cache, tree, key);
    if (key.endsWith('/')) {
      if (!existsSync(from)) continue;
      for (const rel of await walk(from)) {
        if (ports.files[key + rel]) continue; // explicit override wins
        copies.push([path.join(from, rel), path.join(ROOT, entry.target + rel)]);
      }
    } else if (existsSync(from)) {
      copies.push([from, path.join(ROOT, entry.target)]);
    }
  }

  let written = 0;
  let identical = 0;
  for (const [from, to] of copies) {
    const source = await fs.readFile(from);
    if (existsSync(to)) {
      const current = await fs.readFile(to);
      if (current.equals(source)) {
        identical += 1;
        continue;
      }
    }
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.writeFile(to, source);
    written += 1;
  }

  if (apply) {
    console.log(`copied:    ${written}`);
    console.log(`unchanged: ${identical}`);
    console.log(`total:     ${copies.length}`);
  } else {
    console.log(`would copy: ${copies.length}`);
    for (const [, to] of copies.slice(0, 20)) console.log(`  ${path.relative(ROOT, to)}`);
    if (copies.length > 20) console.log(`  … ${copies.length - 20} more`);
  }

  const manual = others.filter(([, mode]) => mode === 'manual');
  const retired = others.filter(([, mode]) => mode === 'retired');
  const transform = others.filter(([, mode]) => mode === 'transform');
  console.log(`manual:    ${manual.length} (port by hand)`);
  for (const [key] of manual.slice(0, 10)) console.log(`  ${key}`);
  if (manual.length > 10) console.log(`  … ${manual.length - 10} more`);
  console.log(`transform: ${transform.length} (generated by a script)`);
  console.log(`retired:   ${retired.length}`);

  if (!apply) {
    console.log('\nreport only: run with --apply to copy, or --check to verify');
    process.exit(0);
  }

  const check = spawnSync(process.execPath, [path.join(ROOT, 'scripts/fetch-upstream.mjs'), '--check'], {
    stdio: 'inherit',
  });
  process.exit(check.status ?? 1);
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exit(2);
});
