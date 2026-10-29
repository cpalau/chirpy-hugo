#!/usr/bin/env node
/**
 * Publish the JavaScript bundles where the browser expects them.
 *
 * Jekyll publishes everything under `assets/` verbatim, and `app.min.js` and
 * `sw.min.js` carry front matter (`permalink: /:basename`) so they land at the
 * site root. Hugo does not publish `assets/` — it is the pipeline source dir —
 * so the bundles have to be materialised under `static/`.
 *
 *   node scripts/build-js.mjs
 *
 * Sources: `assets/js/dist/*.min.js` (from the published gem, D-10).
 * Output:  `static/assets/js/dist/*.min.js` plus `static/app.min.js` and
 *          `static/sw.min.js`, with the Jekyll front matter removed.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'assets/js/dist');
const OUT = path.join(ROOT, 'static');

const FRONT_MATTER = /^---\r?\n(?:[\s\S]*?)\r?\n---\r?\n/;
const ROOT_BUNDLES = new Set(['app.min.js', 'sw.min.js']);

async function main() {
  const files = (await fs.readdir(SRC)).filter((f) => f.endsWith('.js')).sort();
  let written = 0;

  for (const file of files) {
    let code = await fs.readFile(path.join(SRC, file), 'utf8');
    const hadFrontMatter = FRONT_MATTER.test(code);
    if (hadFrontMatter) code = code.replace(FRONT_MATTER, '');

    const targets = [path.join(OUT, 'assets/js/dist', file)];
    if (ROOT_BUNDLES.has(file)) targets.push(path.join(OUT, file));

    for (const target of targets) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      const current = existsSync(target) ? await fs.readFile(target, 'utf8') : null;
      if (current !== code) {
        await fs.writeFile(target, code);
        written += 1;
      }
    }
    if (hadFrontMatter) console.log(`  ${file}: front matter removed`);
  }

  console.log(`bundles: ${files.length} source(s), ${written} file(s) written`);
  const expected = ['assets/js/dist/theme.min.js', 'app.min.js', 'sw.min.js'];
  for (const rel of expected) {
    if (!existsSync(path.join(OUT, rel))) {
      console.error(`error: ${rel} was not produced`);
      process.exit(1);
    }
  }
  console.log('required bundles present: theme.min.js, app.min.js, sw.min.js');
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exit(2);
});
