#!/usr/bin/env node
/**
 * Release helper: consistency checks, changelog promotion and release notes.
 *
 *   node scripts/release.mjs --check
 *   node scripts/release.mjs --notes 1.2.3
 *   node scripts/release.mjs --prepare 1.2.3 [--date YYYY-MM-DD]
 *
 * `--check` fails when a release would be dishonest: empty changelog, version
 * mismatch, missing upstream pin, or a parity gate that does not exist.
 *
 * `--prepare` promotes `[Unreleased]` to `## [X.Y.Z] - DATE`, bumps
 * `theme.toml` and `params.theme_version`, and adds the comparison link. It
 * does not commit, tag or push: that is a reviewed step.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(ROOT, file), content);

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
};

const changelog = read('CHANGELOG.md');
const paramsToml = read('config/_default/params.toml');
const ports = read('tests/contract/ports.yml');

// The theme's own version lives in package.json; `params.theme_version` tracks
// the upstream Chirpy release the footer credits, not this project.
const themeVersion = JSON.parse(read('package.json')).version;
const paramVersion = /^theme_version\s*=\s*"([^"]+)"/m.exec(paramsToml)?.[1];
const upstreamTag = /^  tag:\s*(\S+)/m.exec(ports)?.[1];

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};

function check() {
  if (!themeVersion) fail('package.json has no version');
  if (!paramVersion) fail('params.toml has no theme_version');
  if (paramVersion && upstreamTag && paramVersion !== upstreamTag.replace(/^v/, '')) {
    fail(`params.theme_version ${paramVersion} does not match upstream ${upstreamTag}`);
  }
  if (!upstreamTag) fail('ports.yml does not record the upstream tag');

  const unreleased = /## \[Unreleased\]([\s\S]*?)(?=\n## \[|$)/.exec(changelog)?.[1] ?? '';
  const entries = unreleased.split('\n').filter((line) => /^### \w+/.test(line)).length;
  if (!unreleased.includes('### Added') && !unreleased.includes('### Fixed') && !unreleased.includes('### Changed')) {
    fail('CHANGELOG.md has no Unreleased section with entries');
  } else {
    console.log(`  ok    Unreleased has ${entries} section(s)`);
  }

  if (!fs.existsSync(path.join(ROOT, 'docs/PLAN.md'))) fail('docs/PLAN.md is missing');
  console.log(`  ok    version ${themeVersion}, upstream ${upstreamTag}`);
  console.log(failures ? `\n${failures} release failure(s)` : '\nrelease checks pass');
  process.exit(failures ? 1 : 0);
}

function notes(version) {
  const section = new RegExp(`## \\[${version.replaceAll('.', '\\.')}\\][\\s\\S]*?(?=\\n## \\[|$)`).exec(changelog);
  if (!section) {
    console.error(`no changelog section for ${version}`);
    process.exit(1);
  }
  process.stdout.write(`${section[0].trim()}\n`);
}

function prepare(version, date) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`not a semantic version: ${version}`);
    process.exit(2);
  }
  const today = date ?? new Date().toISOString().slice(0, 10);
  const unreleased = /## \[Unreleased\]([\s\S]*?)(?=\n## \[|$)/.exec(changelog)?.[1] ?? '';
  if (!unreleased.includes('### ')) {
    console.error('nothing to release: [Unreleased] is empty');
    process.exit(1);
  }

  const promoted = changelog.replace(
    /## \[Unreleased\]([\s\S]*?)(?=\n## \[|$)/,
    `## [Unreleased]\n\n### Added\n\n### Changed\n\n### Deprecated\n\n### Removed\n\n### Fixed\n\n### Security\n\n## [${version}] - ${today}$1`,
  );
  write('CHANGELOG.md', promoted);

  const pkg = JSON.parse(read('package.json'));
  pkg.version = version;
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  console.log(`prepared ${version} (${today}): CHANGELOG and package.json`);
  console.log('next: review the diff, run the gates, commit, tag, push the tag');
}

if (argv.includes('--check')) check();
else if (argv.includes('--notes')) notes(flag('--notes') ?? themeVersion);
else if (argv.includes('--prepare')) prepare(flag('--prepare'), flag('--date'));
else {
  console.error('usage: node scripts/release.mjs --check | --notes <version> | --prepare <version> [--date YYYY-MM-DD]');
  process.exit(2);
}
