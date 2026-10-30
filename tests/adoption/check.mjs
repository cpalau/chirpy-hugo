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

import { execFileSync, spawnSync } from 'node:child_process';
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

function build(name, source, extra = [], options = {}) {
  const out = path.join(WORK, `${name}-out`);
  fs.rmSync(out, { recursive: true, force: true });
  const args = ['-s', source, '--themesDir', THEMES_DIR, '--theme', THEME, '--gc', '-d', out, ...extra];
  // A site that is missing the non-merging settings gets the theme's build
  // warning, which is a failure under `--panicOnWarning`.
  if (!options.allowWarnings) args.splice(4, 0, '--panicOnWarning');
  const result = spawnSync(HUGO, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`${name}: build failed\n${result.stderr ?? ''}`);
    return null;
  }
  if (options.expectWarning) {
    const missing = options.expectWarning.filter((text) => !result.stderr.includes(text));
    if (missing.length) {
      fail(`${name}: warning is missing "${missing[0]}"\n${result.stderr}`);
      return null;
    }
    console.log(`  ok    ${name}: warns with the exact configuration snippet`);
  } else if (/WARN/.test(result.stderr)) {
    fail(`${name}: build emitted a warning\n${result.stderr}`);
    return null;
  }
  if (!fs.existsSync(path.join(out, 'index.html'))) {
    fail(`${name}: build succeeded but produced no index.html`);
    return null;
  }
  if (!options.expectWarning) console.log(`  ok    ${name}`);
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

  // The minifier strips spaces; `user-scalable=no initial-scale=1` became
  // `user-scalable=noinitial-scale=1`, an invalid viewport that makes a phone
  // rescale the page when the sidebar opens.
  const home = fs.readFileSync(path.join(out, 'index.html'), 'utf8');

  // The footer must credit this theme's release, not the upstream Chirpy one.
  const version = /^version:\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(ROOT, 'data/theme.yaml'), 'utf8'))?.[1];
  if (!version) {
    fail('deployment: data/theme.yaml has no version');
  } else if (!new RegExp(`title="?v${version.replaceAll('.', '\\.')}"?`).test(home)) {
    fail(`deployment: footer does not show v${version}`);
  } else {
    console.log(`  ok    deployment: footer shows the theme release v${version}`);
  }

  const viewport = /<meta[^>]*name=["']?viewport["']?[^>]*content=["']?([^"'>]+)/i.exec(home)?.[1] ?? '';
  const directives = viewport.split(/[,\s]+/).filter(Boolean);
  if (!directives.includes('initial-scale=1') || !directives.includes('width=device-width')) {
    fail(`deployment: invalid viewport meta (${viewport})`);
  } else if (/noinitial|no,?initial/.test(viewport)) {
    fail(`deployment: viewport directives merged (${viewport})`);
  } else {
    console.log('  ok    deployment: viewport meta parses into separate directives');
  }

  // A shortcode template that ends with a newline leaks it into the page: an
  // inline element followed by punctuation renders as `favicons/ .`. It is
  // invisible to Gate 4 (whitespace is canonicalised) and to the fixtures
  // (none of them puts punctuation right after an inline shortcode), so the
  // demo is the regression test.
  const stray = walk(out)
    .filter((file) => file.endsWith('.html'))
    .filter((file) => /<\/code>\s+[.,;:!?]/.test(fs.readFileSync(path.join(out, file), 'utf8')));
  if (stray.length) {
    fail(`deployment: ${stray.length} page(s) have a space before punctuation after </code> (${stray[0]})`);
  } else {
    console.log('  ok    deployment: no stray whitespace after inline code');
  }

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

/** A starter site with extra params and one post (comments need a post). */
function featureSite(name, extra) {
  const dir = path.join(WORK, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'content', 'posts'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'starter/hugo.toml'), path.join(dir, 'hugo.toml'));
  fs.appendFileSync(path.join(dir, 'hugo.toml'), `\n${extra}\n`);
  fs.writeFileSync(
    path.join(dir, 'content/posts/hello.md'),
    '---\ntitle: "Hello"\ndate: 2026-01-01T00:00:00Z\ncategories: ["Blogging"]\ntags: ["hello"]\n---\n\nA post.\n',
  );
  return dir;
}

/** Front matter and configuration shapes that the rest of the corpus does not
 *  exercise. `image` is accepted as a string or a map, and `cdn` prefixes every
 *  media URL: a template that indexes `.path` on a string, or that reads the
 *  CDN from the wrong context, fails only here. */
function frontMatterMatrix() {
  const dir = featureSite('front-matter', '');
  const config = path.join(dir, 'hugo.toml');
  fs.writeFileSync(
    config,
    fs
      .readFileSync(config, 'utf8')
      .replace('  description = "A site built with chirpy-hugo."', '  description = "A site built with chirpy-hugo."\n  cdn = "https://cdn.example.com"'),
  );
  fs.writeFileSync(
    path.join(dir, 'content/posts/string.md'),
    '---\ntitle: "String image"\ndate: 2026-03-01T10:00:00Z\ntags: ["x"]\nimage: "/assets/img/cover.png"\nmedia_subpath: /assets/media\n---\n\nBody.\n',
  );
  fs.writeFileSync(
    path.join(dir, 'content/posts/map.md'),
    '---\ntitle: "Map image"\ndate: 2026-03-02T10:00:00Z\ntags: ["x"]\nimage:\n  path: "/assets/img/cover.png"\n  alt: "Cover"\nmedia_subpath: /assets/media\n---\n\nBody.\n',
  );

  const out = build('front matter: image as string and map, media on a CDN', dir);
  if (!out) return;

  const read = (page) => fs.readFileSync(path.join(out, page), 'utf8');
  const checks = [
    ['string: og:image is absolute and on the CDN', 'posts/string/index.html', /property="og:image" content="https:\/\/cdn\.example\.com\/assets\/media\/assets\/img\/cover\.png"/],
    ['string: twitter:image', 'posts/string/index.html', /name="twitter:image" content="[^"]*cover\.png"/],
    ['string: JSON-LD image is a URL', 'posts/string/index.html', /"image":"https:\/\/cdn\.example\.com[^"]*cover\.png"/],
    ['map: JSON-LD image is an ImageObject', 'posts/map/index.html', /"image":\{[^}]*"@type":"imageObject"\}/],
    ['map: og:image:alt', 'posts/map/index.html', /property="og:image:alt" content="Cover"/],
    ['home: both previews render', 'index.html', /posts\/string\/[\s\S]*posts\/map\/|posts\/map\/[\s\S]*posts\/string\//],
  ];
  for (const [name, page, pattern] of checks) {
    if (pattern.test(read(page))) console.log(`  ok    ${name}`);
    else fail(`front matter: ${name}`);
  }
}

/** Site-level SEO settings that would change every corpus page if they were in
 *  the fixtures: the legacy verification key, a site-wide twitter card, the
 *  author fallback and the publisher logo. */
function seoConfig() {
  const dir = featureSite('seo-config', '');
  const config = path.join(dir, 'hugo.toml');
  fs.writeFileSync(
    config,
    fs
      .readFileSync(config, 'utf8')
      .replace(
        '  description = "A site built with chirpy-hugo."',
        [
          '  description = "A site built with chirpy-hugo."',
          '  author = "Site Author"',
          '  logo = "/assets/img/logo.png"',
          '  twitter_card = "summary"',
          '  google_site_verification = "legacy-token"',
        ].join('\n'),
      ),
  );
  fs.writeFileSync(
    path.join(dir, 'content/posts/hello.md'),
    '---\ntitle: "Hello"\ndate: 2026-01-01T00:00:00Z\nimage:\n  path: "/assets/img/cover.png"\n  alt: "Cover"\n---\n\nA post.\n',
  );

  const out = build('seo: site-wide settings', dir);
  if (!out) return;
  const html = fs.readFileSync(path.join(out, 'posts/hello/index.html'), 'utf8');
  const checks = [
    ['legacy google verification', /name="?google-site-verification"? content="?legacy-token/],
    ['site twitter card wins over the image default', /name="?twitter:card"? content="?summary(?!_large)/],
    ['site author fallback in the meta tag', /name="?author"? content="Site Author"/],
    ['publisher logo in JSON-LD', /"publisher":\{"@type":"Organization","logo":\{"@type":"ImageObject","url":"[^"]*\/assets\/img\/logo\.png"\},"name":"Site Author"\}/],
    ['author fallback in JSON-LD', /"author":\{"@type":"Person","name":"Site Author"\}/],
  ];
  for (const [name, pattern] of checks) {
    if (pattern.test(html)) console.log(`  ok    ${name}`);
    else fail(`seo: ${name}`);
  }
}

/** Footer copy is site-owned: the upstream copyright, or a line with `:author`
 *  and `:year`. */
function footerConfig() {
  const dir = featureSite('footer', '');
  const config = path.join(dir, 'hugo.toml');
  fs.writeFileSync(
    config,
    fs
      .readFileSync(config, 'utf8')
      .replace(
        '  description = "A site built with chirpy-hugo."',
        '  description = "A site built with chirpy-hugo."\n\n  [params.footer]\n    copyright = "Made with love by :author"',
      ),
  );
  const out = build('footer: site-owned copyright', dir);
  if (!out) return;
  const home = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const checks = [
    ['custom footer line', /Made with love by (?:<a [^>]*>)?Your Name/],
    ['no upstream copyright', !home.includes('Some rights reserved')],
  ];
  if (checks[0][1].test(home)) console.log('  ok    ' + checks[0][0]);
  else fail('footer: custom footer line');
  if (checks[1][1]) console.log('  ok    ' + checks[1][0]);
  else fail('footer: upstream copyright should be replaced');
}

/** Build once, then prove every marker is in the output. */
function expectMarkers(name, source, file, markers) {
  const out = build(name, source);
  if (!out) return;
  const abs = path.join(out, file);
  if (!fs.existsSync(abs)) {
    fail(`${name}: ${file} is missing`);
    return;
  }
  const html = fs.readFileSync(abs, 'utf8');
  const absent = markers.filter((marker) => !html.includes(marker));
  if (absent.length) fail(`${name}: missing ${absent.join(', ')}`);
  else console.log(`  ok    ${name}: ${markers.length} marker(s) rendered`);
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

// 4. Provider matrix: `head.html` and `comment.html` dispatch on configuration,
// so a provider without a partial only fails when a user turns it on. All of
// them are exercised here, plus the pageview counter.
function providerMatrix() {
expectMarkers(
  'analytics providers (all six)',
  featureSite(
    'analytics',
    `[params.analytics.google]
  id = "G-TEST"
[params.analytics.goatcounter]
  id = "test"
[params.analytics.umami]
  id = "umami-test"
  domain = "https://umami.example.com"
[params.analytics.matomo]
  id = "7"
  domain = "matomo.example.com"
[params.analytics.cloudflare]
  id = "cf-test"
[params.analytics.fathom]
  id = "fathom-test"`,
  ),
  'index.html',
  [
    'googletagmanager.com/gtag/js?id=G-TEST',
    'gc.zgo.at/count.js',
    'data-website-id="umami-test"',
    'matomo.js',
    'cloudflareinsights.com/beacon.min.js',
    'cdn.usefathom.com/script.js',
  ],
);

for (const [provider, extra, marker] of [
  ['giscus', '[params.comments.giscus]\n  repo = "owner/repo"\n  repo_id = "R_1"\n  category = "Announcements"\n  category_id = "DIC_1"', 'giscus.app/client.js'],
  ['disqus', '[params.comments.disqus]\n  shortname = "chirpy-test"', 'disqus.com/embed.js'],
  ['utterances', '[params.comments.utterances]\n  repo = "owner/repo"\n  issue_term = "pathname"', 'utteranc.es/client.js'],
]) {
  expectMarkers(
    `comments: ${provider}`,
    featureSite(`comments-${provider}`, `[params.comments]\n  provider = "${provider}"\n${extra}`),
    'posts/hello/index.html',
    [marker],
  );
}
}

// `--providers-only` is the fast run PR CI needs: no clone, no deployment build.
if (process.argv.includes('--features-only')) {
  providerMatrix();
  frontMatterMatrix();
  seoConfig();
  footerConfig();
  console.log(failures ? `\n${failures} feature failure(s)` : '\nfeatures verified');
  process.exit(failures ? 1 : 0);
}

providerMatrix();
frontMatterMatrix();
seoConfig();
footerConfig();

// 5. HugoBasicExample, cloned once.
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
// HugoBasicExample does not declare the non-merging settings: it must still
// build, and it must say why the output is incomplete (F1).
build('HugoBasicExample (under-configured site)', BASIC, [], {
  allowWarnings: true,
  expectWarning: [
    'chirpy-hugo: the site is missing configuration',
    '[markup.goldmark.parser.attribute]',
    '[outputs]',
  ],
});

console.log(failures ? `\n${failures} adoption failure(s)` : '\nadoption verified');
process.exit(failures ? 1 : 0);
