#!/usr/bin/env node
/**
 * Copy the `copy`-mode files of `tests/contract/ports.yml` from the pinned
 * upstream trees into the theme.
 *
 *   node scripts/sync-upstream.mjs --apply
 *   node scripts/sync-upstream.mjs --check     # alias of fetch-upstream --check
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

  console.log(`copied:    ${written}`);
  console.log(`unchanged: ${identical}`);
  console.log(`total:     ${copies.length}`);

  const manual = others.filter(([, mode]) => mode === 'manual').length;
  const retired = others.filter(([, mode]) => mode === 'retired').length;
  console.log(`manual:    ${manual} (ported by hand, see ports.yml)`);
  console.log(`retired:   ${retired}`);

  const check = spawnSync(process.execPath, [path.join(ROOT, 'scripts/fetch-upstream.mjs'), '--check'], {
    stdio: 'inherit',
  });
  process.exit(check.status ?? 1);
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exit(2);
});
