#!/usr/bin/env node
/**
 * Upstream contract tool.
 *
 *   node scripts/fetch-upstream.mjs --fetch      # download the pinned tag + gem
 *   node scripts/fetch-upstream.mjs --generate   # rewrite tests/contract/upstream-hashes.json
 *   node scripts/fetch-upstream.mjs --check      # verify coverage, pin and hashes
 *
 * The pin lives in `tests/contract/ports.yml` (single source of truth) and is
 * mirrored into the manifest for provenance. No third-party dependencies: the
 * YAML subset read here is the one this repository writes.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORTS = path.join(ROOT, 'tests/contract/ports.yml');
const MANIFEST = path.join(ROOT, 'tests/contract/upstream-hashes.json');
const CACHE = path.join(ROOT, '.out/upstream');

const COPIED_MODES = new Set(['copy', 'transform']);

// ---------------------------------------------------------------------------
// ports.yml reader (deliberately minimal: covers only the syntax we author)
// ---------------------------------------------------------------------------

function sliceSection(lines, name) {
  const start = lines.findIndex((l) => l === `${name}:`);
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === '' || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) break;
    out.push(line);
  }
  return out;
}

function unquote(value) {
  const v = value.trim();
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  if (v === 'null') return null;
  return v;
}

export async function readPorts() {
  const text = await fs.readFile(PORTS, 'utf8');
  const lines = text.split('\n');

  const upstream = {};
  for (const line of sliceSection(lines, 'upstream')) {
    const m = line.match(/^ {2}([a-z_]+):\s*(.*)$/);
    if (m) upstream[m[1]] = unquote(m[2]);
  }

  const files = {};
  let current = null;
  for (const line of sliceSection(lines, 'files')) {
    const key = line.match(/^ {2}"([^"]+)":\s*$/);
    if (key) {
      current = { source: key[1] };
      files[key[1]] = current;
      continue;
    }
    const field = line.match(/^ {4}([a-z_]+):\s*(.*)$/);
    if (field && current) current[field[1]] = unquote(field[2]);
  }

  const ignored = [];
  for (const line of sliceSection(lines, 'ignored')) {
    const m = line.match(/^ {2}- "?([^"]+)"?$/);
    if (m) ignored.push(m[1]);
  }

  const newFiles = {};
  let currentNew = null;
  for (const line of sliceSection(lines, 'new_files')) {
    const key = line.match(/^ {2}"([^"]+)":\s*$/);
    if (key) {
      currentNew = { path: key[1] };
      newFiles[key[1]] = currentNew;
      continue;
    }
    const field = line.match(/^ {4}([a-z_]+):\s*(.*)$/);
    if (field && currentNew) currentNew[field[1]] = unquote(field[2]);
  }

  return { upstream, files, ignored, newFiles };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const tagUrl = (u) => `https://codeload.github.com/${u.repo}/tar.gz/${u.sha}`;
const gemUrl = (u) => `https://rubygems.org/downloads/${u.gem}-${u.gem_version}.gem`;

function cachePaths(u) {
  const base = path.join(CACHE, u.sha);
  return {
    base,
    archives: path.join(base, 'archives'),
    tag: path.join(base, 'tag'),
    gem: path.join(base, 'gem'),
    tagArchive: path.join(base, 'archives', 'upstream.tar.gz'),
    gemArchive: path.join(base, 'archives', `${u.gem}-${u.gem_version}.gem`),
  };
}

async function walk(dir, prefix = '') {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

async function download(url, dest) {
  process.stderr.write(`  GET ${url}\n`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function expand(u) {
  const c = cachePaths(u);
  await fs.mkdir(c.archives, { recursive: true });

  if (!existsSync(c.tagArchive)) await download(tagUrl(u), c.tagArchive);
  if (!existsSync(c.gemArchive)) await download(gemUrl(u), c.gemArchive);

  if (!existsSync(c.tag)) {
    const staging = `${c.tag}.staging`;
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true });
    execFileSync('tar', ['-xzf', c.tagArchive, '-C', staging, '--strip-components=1']);
    await fs.rename(staging, c.tag);
  }

  if (!existsSync(c.gem)) {
    const staging = `${c.gem}.staging`;
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true });
    const unpacked = path.join(c.base, 'gem.unpacked');
    await fs.rm(unpacked, { recursive: true, force: true });
    await fs.mkdir(unpacked, { recursive: true });
    execFileSync('tar', ['-xf', c.gemArchive, '-C', unpacked]);
    execFileSync('tar', ['-xzf', path.join(unpacked, 'data.tar.gz'), '-C', staging]);
    await fs.rm(unpacked, { recursive: true, force: true });
    await fs.rename(staging, c.gem);
  }

  return c;
}

/** Which upstream tree a ports.yml entry reads from. */
const treeOf = (entry) => (entry.source === 'gem' ? 'gem' : 'tag');

function targetFor(entry) {
  return entry.target;
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

async function generate(u, ports) {
  const c = await expand(u);
  const entries = [];

  for (const [key, entry] of Object.entries(ports.files)) {
    if (!COPIED_MODES.has(entry.mode)) continue;
    const tree = treeOf(entry);
    const isDir = key.endsWith('/');
    const sourceRoot = path.join(c[tree], key);

    if (isDir) {
      if (!existsSync(sourceRoot)) continue; // e.g. artifacts absent from the tag tree
      for (const rel of await walk(sourceRoot)) {
        if (ports.files[key + rel]) continue; // explicit override wins
        entries.push({
          path: key + rel,
          source: tree,
          target: entry.target + rel,
          mode: entry.mode,
          sha256: sha256(await fs.readFile(path.join(sourceRoot, rel))),
        });
      }
    } else {
      if (!existsSync(sourceRoot)) continue;
      entries.push({
        path: key,
        source: tree,
        target: targetFor(entry),
        mode: entry.mode,
        sha256: sha256(await fs.readFile(sourceRoot)),
      });
    }
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));

  const manifest = {
    upstream: {
      repo: u.repo,
      tag: u.tag,
      sha: u.sha,
      gem: u.gem,
      gem_version: u.gem_version,
      tag_archive_sha256: sha256(await fs.readFile(c.tagArchive)),
      gem_archive_sha256: sha256(await fs.readFile(c.gemArchive)),
    },
    files: Object.fromEntries(
      entries.map(({ path: p, ...rest }) => [p, rest]),
    ),
  };

  await fs.writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest written: ${path.relative(ROOT, MANIFEST)}`);
  console.log(`  ${entries.length} entries (${entries.filter((e) => e.source === 'gem').length} from the gem)`);
  return manifest;
}

async function check(u, ports) {
  let failures = 0;
  const fail = (msg) => {
    failures += 1;
    console.log(`  FAIL  ${msg}`);
  };

  const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));

  // 1. The pin must be identical in both places.
  for (const key of ['repo', 'tag', 'sha', 'gem', 'gem_version']) {
    if (manifest.upstream[key] !== u[key]) {
      fail(`pin mismatch (${key}): ports.yml=${u[key]} manifest=${manifest.upstream[key]}`);
    }
  }
  console.log(`pin: ${u.repo} ${u.tag} ${u.sha.slice(0, 7)} gem ${u.gem}@${u.gem_version}`);

  // 2. Coverage: every upstream file is mapped or explicitly ignored.
  const c = await expand(u);
  const tagged = await walk(c.tag);
  const gemmed = await walk(c.gem);
  const dirKeys = Object.keys(ports.files).filter((k) => k.endsWith('/'));
  const tagSet = new Set(tagged);

  const coveredByTag = (rel) => {
    if (ports.files[rel]) return ports.files[rel].source !== 'gem';
    if (dirKeys.some((k) => rel.startsWith(k) && ports.files[k].source !== 'gem')) return true;
    return ports.ignored.some((p) => rel === p || rel.startsWith(p));
  };

  const unmappedTag = tagged.filter((rel) => !coveredByTag(rel));
  if (unmappedTag.length) {
    fail(`${unmappedTag.length} upstream file(s) without mapping:`);
    for (const rel of unmappedTag) console.log(`          ${rel}`);
  } else {
    console.log(`coverage: ${tagged.length}/${tagged.length} tag files mapped`);
  }

  // Files that only the published gem ships (the build artifacts) must be
  // declared explicitly with `source: gem`; anything else is a new artifact
  // that nobody has classified.
  const gemOnly = gemmed.filter((rel) => !tagSet.has(rel));
  const unmappedGem = gemOnly.filter((rel) => {
    const entry = ports.files[rel];
    if (entry) return entry.source !== 'gem';
    const dir = dirKeys.find((k) => rel.startsWith(k));
    if (dir) return ports.files[dir].source !== 'gem';
    return !ports.ignored.some((p) => rel === p || rel.startsWith(p));
  });
  if (unmappedGem.length) {
    fail(`${unmappedGem.length} gem-only file(s) without mapping:`);
    for (const rel of unmappedGem) console.log(`          ${rel}`);
  } else {
    console.log(`coverage: ${gemOnly.length} gem-only artifact(s) declared (source: gem)`);
  }

  // 3. Manifest hashes must match the pinned trees.
  let hashChecked = 0;
  for (const [rel, entry] of Object.entries(manifest.files)) {
    const abs = path.join(c[entry.source], rel);
    if (!existsSync(abs)) {
      fail(`manifest entry not present in the ${entry.source} tree: ${rel}`);
      continue;
    }
    const digest = sha256(await fs.readFile(abs));
    if (digest !== entry.sha256) fail(`hash mismatch: ${rel}`);
    else hashChecked += 1;
  }
  console.log(`hashes: ${hashChecked}/${Object.keys(manifest.files).length} manifest entries verified`);

  // 4. Local copies, when they exist, must still match the pin. A `transform`
  //    target does not: by definition it is generated from the source, so its
  //    own generator verifies it (Gate 7 for i18n).
  let present = 0;
  let drift = 0;
  let transformed = 0;
  const pendingDirs = new Set();
  for (const [rel, entry] of Object.entries(manifest.files)) {
    if (entry.mode === 'transform') {
      transformed += 1;
      continue;
    }
    const abs = path.join(ROOT, entry.target);
    if (!existsSync(abs)) {
      pendingDirs.add(entry.target.split('/')[0]);
      continue;
    }
    present += 1;
    if (sha256(await fs.readFile(abs)) !== entry.sha256) {
      drift += 1;
      fail(`local copy drifted from upstream: ${entry.target}`);
    }
  }
  console.log(
    `local copies: ${present} verified, ${drift} drifted, ` +
      `${Object.keys(manifest.files).length - present - transformed} pending ` +
      `(${[...pendingDirs].sort().join(', ') || 'none'}), ` +
      `${transformed} transform target(s) verified by their generator`,
  );

  return failures;
}

async function main() {
  const argv = new Set(process.argv.slice(2));
  const ports = await readPorts();
  const u = {
    repo: ports.upstream.repo,
    tag: ports.upstream.tag,
    sha: ports.upstream.sha,
    gem: ports.upstream.gem,
    gem_version: ports.upstream.gem_version,
  };

  if (!u.repo || !u.tag || !u.sha) throw new Error('ports.yml: incomplete `upstream` block');

  if (argv.has('--generate')) {
    await generate(u, ports);
    return 0;
  }

  console.log(`upstream: ${u.repo} ${u.tag}`);
  const failures = await check(u, ports);
  console.log(failures === 0 ? '\nOK' : `\n${failures} failure(s)`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`error: ${error.message}`);
    process.exit(2);
  });
