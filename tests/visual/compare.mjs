#!/usr/bin/env node
/**
 * Gate 5 — pixel comparison.
 *
 *   node tests/visual/compare.mjs [--threshold 0.1] [--max-ratio 0.001]
 *
 * Compares `.out/shots/oracle` against `.out/shots/hugo`, pair by pair, and
 * writes a highlighted diff to `reports/visual/` for every pair that fails.
 *
 * The pass criterion is the one in docs/TESTING.md §7.4: per-pixel colour
 * tolerance 0.1 and at most 0.1 % of differing pixels.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ORACLE = path.join(ROOT, '.out/shots/oracle');
const HUGO = path.join(ROOT, '.out/shots/hugo');
const OUT = path.join(ROOT, 'reports/visual');

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const THRESHOLD = argValue('--threshold', 0.1);
const MAX_RATIO = argValue('--max-ratio', 0.001);

function main() {
  if (!fs.existsSync(ORACLE) || !fs.existsSync(HUGO)) {
    console.error('missing shots; run tests/visual/capture.mjs for both sides');
    process.exit(2);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const files = fs.readdirSync(ORACLE).filter((f) => f.endsWith('.png')).sort();
  let failed = 0;
  const rows = [];

  for (const file of files) {
    const hugoFile = path.join(HUGO, file);
    if (!fs.existsSync(hugoFile)) {
      rows.push({ file, status: 'missing', ratio: 1 });
      failed += 1;
      continue;
    }
    const a = PNG.sync.read(fs.readFileSync(path.join(ORACLE, file)));
    const b = PNG.sync.read(fs.readFileSync(hugoFile));
    const width = Math.min(a.width, b.width);
    const height = Math.min(a.height, b.height);
    const heightDelta = Math.abs(a.height - b.height);
    // Crop to the common area: a page that is a few pixels taller is reported
    // through heightDelta, not as a 100 % pixel diff.
    const crop = (img) => {
      if (img.width === width && img.height === height) return img.data;
      const out = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        img.data.copy(out, y * width * 4, y * img.width * 4, y * img.width * 4 + width * 4);
      }
      return out;
    };
    const dataA = crop(a);
    const dataB = crop(b);
    const diff = new PNG({ width, height });
    const pixels = pixelmatch(dataA, dataB, diff.data, width, height, {
      threshold: THRESHOLD,
      includeAA: false,
    });
    const ratio = pixels / (width * height);
    if (ratio > MAX_RATIO) {
      fs.writeFileSync(path.join(OUT, file.replace(/\.png$/, '-diff.png')), PNG.sync.write(diff));
      failed += 1;
      rows.push({ file, status: 'DIFF', ratio, pixels, heightDelta });
    } else {
      rows.push({ file, status: 'ok', ratio, pixels, heightDelta });
    }
  }

  const width = Math.max(...rows.map((r) => r.file.length));
  for (const row of rows) {
    const pct = (row.ratio * 100).toFixed(3);
    const delta = row.heightDelta ? `  height +${row.heightDelta}px` : '';
    console.log(`  ${row.status === 'ok' ? 'ok  ' : 'FAIL'}  ${row.file.padEnd(width)}  ${pct}%${delta}`);
  }
  console.log(`\n${rows.length} pair(s): ${rows.length - failed} within budget, ${failed} over it`);
  console.log(`budget: threshold ${THRESHOLD}, max ${MAX_RATIO * 100}% of pixels`);
  if (failed) console.log(`diff images: ${path.relative(ROOT, OUT)}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
