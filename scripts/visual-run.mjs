#!/usr/bin/env node
/**
 * Capture both sides and compare, with the two captures in parallel.
 *
 *   node scripts/visual-run.mjs [--all] [--with-vendor] [--with-renderers]
 *
 * `capture.mjs` already runs its viewports concurrently; this also overlaps the
 * Jekyll and Hugo builds, which halves the wall clock of a full matrix.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const forwarded = process.argv.slice(2);

const run = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
  });

const capture = (side) => run([path.join(ROOT, 'tests/visual/capture.mjs'), side, ...forwarded]);
// Both builds share the same baseURL (127.0.0.1:4001) because that is what the
// fixtures were generated with, so the two sides cannot listen at once.
const oracle = await capture('oracle');
if (oracle) process.exit(oracle);
const hugo = await capture('hugo');
if (hugo) process.exit(hugo);
process.exit(await run([path.join(ROOT, 'tests/visual/compare.mjs')]));
