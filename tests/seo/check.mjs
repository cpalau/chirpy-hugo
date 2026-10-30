#!/usr/bin/env node
/**
 * Gate 4b — SEO metadata.
 *
 *   node tests/seo/check.mjs [hugo-dir] [oracle-dir]
 *
 * Gate 4 compares the whole document; this one compares the `<head>` field by
 * field so a failure names the tag instead of pointing at an element index, and
 * it checks invariants that equality alone cannot catch (a tag that both sides
 * omit is still a bug).
 *
 * For every page present in both builds:
 *
 *   · every `<meta name>` and `<meta property>` matches the oracle (JSON-LD is
 *     parsed, so key order is not part of the comparison);
 *   · `<title>`, canonical, `rel=prev/next` and the JSON-LD object match;
 *   · declared divergences are normalised: `generator` (D-06), viewport (D-24)
 *     and the pagination URL shape (D-14).
 *
 * Every Hugo page is also checked on its own:
 *
 *   · exactly one `<title>`, canonical, `og:title`, `og:type` and `og:locale`;
 *   · a non-empty description, a valid twitter card, no duplicated meta keys;
 *   · an absolute canonical, absolute image URLs and numeric image dimensions;
 *   · JSON-LD that parses, uses schema.org and a known `@type`;
 *   · a `twitter:creator` only when the site has a twitter handle.
 *
 * Finally it asserts the behaviour of the SEO fixture knobs, so the intent is
 * written down and not only "equal to Jekyll".
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HUGO = path.resolve(ROOT, process.argv[2] ?? '.out/hugo');
const ORACLE = path.resolve(ROOT, process.argv[3] ?? '.out/oracle');

let checks = 0;
let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};
const ok = () => {
  checks += 1;
};
const warnings = new Map();
const warn = (message) => {
  warnings.set(message, (warnings.get(message) ?? 0) + 1);
};

const walk = (dir, root = dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, root, acc);
    else if (entry.name === 'index.html') acc.push(path.relative(root, path.dirname(abs)));
  }
  return acc;
};

const ATTRS = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g;
const unquote = (value) => value.replace(/^["']|["']$/g, '');
/** Hugo escapes `+` in attributes as `&#43;`; Jekyll does not. */
const decode = (value) =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

function parseHead(file) {
  const html = fs.readFileSync(file, 'utf8');
  const head = html.split('</head>')[0];
  const metas = new Map();
  const links = new Map();
  const duplicates = [];
  const seen = new Set();

  for (const tag of head.match(/<meta\b[^>]*>/g) ?? []) {
    const attrs = {};
    for (const [, name, raw] of tag.matchAll(ATTRS)) attrs[name] = decode(unquote(raw));
    const key = attrs.name ?? attrs.property;
    if (!key) continue;
    const id = attrs.name ? `name:${key}` : `property:${key}`;
    // `theme-color` is legitimately repeated once per colour scheme.
    const dupKey = `${id}${attrs.media ? `@${attrs.media}` : ''}`;
    if (seen.has(dupKey)) duplicates.push(dupKey);
    seen.add(dupKey);
    metas.set(id, attrs.content ?? '');
  }

  for (const tag of head.match(/<link\b[^>]*>/g) ?? []) {
    const attrs = {};
    for (const [, name, raw] of tag.matchAll(ATTRS)) attrs[name] = decode(unquote(raw));
    if (attrs.rel && attrs.href) links.set(attrs.rel, attrs.href);
  }

  const title = decode(/<title>([^<]*)<\/title>/.exec(head)?.[1] ?? '');
  const ldMatch = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head);
  let ld = null;
  let ldError = '';
  if (ldMatch) {
    try {
      ld = JSON.parse(ldMatch[1]);
    } catch (error) {
      ldError = error.message;
    }
  }

  return { metas, links, title, ld, ldError, duplicates };
}

/** Differences we declare: they are not SEO defects. */
const IGNORED_META = new Set(['name:generator', 'name:viewport']);
const normalizeLinks = (links) => {
  const out = new Map(links);
  for (const rel of ['next', 'prev']) {
    if (out.has(rel)) out.set(rel, out.get(rel).replace(/\/page(\d+)\//, '/page$1/').replace(/\/page2\//, '/page/2/'));
  }
  return out;
};

/* D-14: /page5/ (Jekyll) and /page/5/ (Hugo) are the same page. */
const normalizeUrl = (value) =>
  typeof value === 'string' ? value.replace(/\/page(\d+)\//g, '/page/$1/') : value;

function comparePage(rel, hugoPage, oraclePage) {
  const where = rel === '' ? '/' : `/${rel}/`;

  if (hugoPage.title !== oraclePage.title) {
    fail(`${where} title: ${JSON.stringify(hugoPage.title)} != ${JSON.stringify(oraclePage.title)}`);
  } else ok();

  const hugoMeta = new Map([...hugoPage.metas].filter(([key]) => !IGNORED_META.has(key)));
  const oracleMeta = new Map([...oraclePage.metas].filter(([key]) => !IGNORED_META.has(key)));
  for (const key of new Set([...hugoMeta.keys(), ...oracleMeta.keys()])) {
    const a = normalizeUrl(hugoMeta.get(key));
    const b = normalizeUrl(oracleMeta.get(key));
    if (a === b) {
      ok();
      continue;
    }
    fail(`${where} ${key.replace(':', '=')}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  }

  for (const rel of ['canonical', 'prev', 'next']) {
    const a = normalizeUrl(normalizeLinks(hugoPage.links).get(rel));
    const b = normalizeUrl(normalizeLinks(oraclePage.links).get(rel));
    if (a === b) ok();
    else fail(`${where} link[rel=${rel}]: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  }

  const hugoLd = normalizeUrl(JSON.stringify(hugoPage.ld));
  const oracleLd = normalizeUrl(JSON.stringify(oraclePage.ld));
  if (hugoLd === oracleLd) ok();
  else fail(`${where} JSON-LD differs\n    hugo:   ${hugoLd}\n    oracle: ${oracleLd}`);
}

function invariants(rel, page, site) {
  const where = rel === '' ? '/' : `/${rel}/`;
  const require = (condition, message) => {
    if (condition) ok();
    else fail(`${where} ${message}`);
  };

  require(page.duplicates.length === 0, `duplicated meta keys: ${page.duplicates.join(', ')}`);
  require(page.title.length > 0, 'missing <title>');
  require(page.metas.has('property:og:title'), 'missing og:title');
  require(page.metas.has('property:og:type'), 'missing og:type');
  require(page.metas.has('property:og:locale'), 'missing og:locale');
  require(!(page.metas.get('property:og:locale') ?? '').includes('-'), 'og:locale must use underscores');

  const description = page.metas.get('name:description') ?? '';
  require(description.length > 0, 'missing meta description');
  require(description === (page.metas.get('property:og:description') ?? description), 'og:description must equal meta description');
  require(description === (page.metas.get('name:twitter:description') ?? description), 'twitter:description must equal meta description');

  const canonical = page.links.get('canonical') ?? '';
  require(/^https?:\/\//.test(canonical), `canonical is not absolute (${canonical})`);

  const card = page.metas.get('name:twitter:card') ?? '';
  require(['summary', 'summary_large_image'].includes(card), `invalid twitter:card (${card})`);
  const image = page.metas.get('property:og:image') ?? page.metas.get('name:twitter:image') ?? '';
  require(!image || /^https?:\/\//.test(image), `image is not absolute (${image})`);
  if (page.metas.has('property:og:image:width')) {
    require(/^\d+$/.test(page.metas.get('property:og:image:width')), 'og:image:width is not numeric');
  }
  if (page.metas.has('property:og:image:height')) {
    require(/^\d+$/.test(page.metas.get('property:og:image:height')), 'og:image:height is not numeric');
  }
  if (!site.twitter) {
    require(!page.metas.has('name:twitter:creator'), 'twitter:creator without a site handle');
  }

  require(page.ldError === '', `JSON-LD does not parse: ${page.ldError}`);
  if (page.ld) {
    require(page.ld['@context'] === 'https://schema.org', 'JSON-LD @context');
    require(['WebSite', 'WebPage', 'BlogPosting', 'CreativeWork'].includes(page.ld['@type']), `JSON-LD @type (${page.ld['@type']})`);
    require(/^https?:\/\//.test(page.ld.url ?? ''), 'JSON-LD url is not absolute');
    if (typeof page.ld.image === 'string') require(/^https?:\/\//.test(page.ld.image), 'JSON-LD image is not absolute');
    if (page.ld.datePublished) require(!page.ld.dateModified || page.ld.dateModified >= page.ld.datePublished, 'dateModified before datePublished');
  }
}

/* --------------------------------------------------------------------------
 * Standards
 *
 * Equality proves the port reproduces Jekyll; it does not prove the result is
 * valid. These rules come from the Open Graph protocol, the Twitter card
 * documentation and Google's structured-data guidance.
 * ------------------------------------------------------------------------ */

const OG_TYPES = new Set(['article', 'website', 'profile', 'book', 'music.album', 'video.movie']);
const TWITTER_CARDS = new Set(['summary', 'summary_large_image', 'app', 'player']);
const HANDLE = /^@[A-Za-z0-9_]{1,15}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;
const LD_TYPES = {
  WebSite: ['name', 'url'],
  WebPage: ['url'],
  BlogPosting: ['headline', 'datePublished', 'author', 'url'],
  CreativeWork: ['headline', 'datePublished', 'author', 'url'],
};
const LD_PROPERTIES = new Set([
  '@context', '@type', 'author', 'dateModified', 'datePublished', 'description',
  'headline', 'image', 'mainEntityOfPage', 'name', 'publisher', 'sameAs', 'url',
]);

function standards(rel, page) {
  const where = rel === '' ? '/' : `/${rel}/`;
  const require = (condition, message) => {
    if (condition) ok();
    else fail(`${where} ${message}`);
  };
  const meta = (key) => page.metas.get(key) ?? '';
  const canonical = page.links.get('canonical') ?? '';

  // Open Graph: ogp.me requires title, type, image and url.
  require(meta('property:og:title').length > 0, 'OG: missing og:title');
  require(OG_TYPES.has(meta('property:og:type')), `OG: invalid og:type (${meta('property:og:type')})`);
  require(/^https?:\/\//.test(meta('property:og:url')), 'OG: og:url is not absolute');
  require(meta('property:og:url') === canonical, 'OG: og:url differs from the canonical');
  require(/^https?:\/\//.test(meta('property:og:image')), 'OG: missing or relative og:image');
  require(/^[a-z]{2,3}(_[A-Z]{2})?$/.test(meta('property:og:locale')), `OG: invalid og:locale (${meta('property:og:locale')})`);

  // Article metadata, when the page has a date.
  if (meta('property:og:type') === 'article') {
    const published = meta('property:article:published_time');
    const modified = meta('property:article:modified_time');
    require(ISO.test(published), `Article: invalid published_time (${published})`);
    require(ISO.test(modified), `Article: invalid modified_time (${modified})`);
    require(!published || !modified || modified >= published, 'Article: modified_time is before published_time');
  }

  // Twitter cards: the card type decides which fields are required.
  const card = meta('name:twitter:card');
  require(TWITTER_CARDS.has(card), `Twitter: invalid card (${card})`);
  require(meta('name:twitter:title').length > 0, 'Twitter: missing twitter:title');
  /* Chirpy emits the fallback image as `property="twitter:image"`, the rest as
     `name="twitter:image"`; both are the same tag for a consumer. */
  const twitterImage = meta('name:twitter:image') || meta('property:twitter:image');
  if (card === 'summary_large_image') {
    require(/^https?:\/\//.test(twitterImage), 'Twitter: summary_large_image without an image');
  }
  const site = meta('name:twitter:site');
  if (site) require(HANDLE.test(site), `Twitter: invalid site handle (${site})`);
  /* `jekyll-seo-tag` falls back to the author *name* for the creator, so a
     display name produces an invalid handle. It is upstream behaviour, so it is
     reported as a warning: the owner has to set a twitter handle per author. */
  const creator = meta('name:twitter:creator');
  if (creator && !HANDLE.test(creator)) warn(`twitter:creator "${creator}" is not a handle (the SEO tag falls back to the author name)`);

  // JSON-LD, per type.
  if (page.ld) {
    const ld = page.ld;
    const required = LD_TYPES[ld['@type']] ?? [];
    for (const property of required) {
      require(ld[property] !== undefined && ld[property] !== '', `JSON-LD: ${ld['@type']} needs ${property}`);
    }
    for (const property of Object.keys(ld)) {
      if (!LD_PROPERTIES.has(property)) fail(`${where} JSON-LD: unknown property ${property}`);
      else ok();
    }
    require(/^https?:\/\//.test(ld.url ?? ''), 'JSON-LD: url is not absolute');
    if (ld.datePublished) require(ISO.test(ld.datePublished), `JSON-LD: invalid datePublished (${ld.datePublished})`);
    if (ld.dateModified) require(ISO.test(ld.dateModified), `JSON-LD: invalid dateModified (${ld.dateModified})`);
    if (ld.author) {
      require(['Person', 'Organization'].includes(ld.author['@type']), 'JSON-LD: author must be Person or Organization');
      require((ld.author.name ?? '').length > 0, 'JSON-LD: author needs a name');
      if (ld.author.url) require(/^https?:\/\//.test(ld.author.url), 'JSON-LD: author.url is not absolute');
    }
    if (ld.publisher) {
      require(ld.publisher['@type'] === 'Organization', 'JSON-LD: publisher must be an Organization');
      const logo = ld.publisher.logo;
      require(logo?.['@type'] === 'ImageObject' && /^https?:\/\//.test(logo?.url ?? ''), 'JSON-LD: publisher needs an absolute logo');
    }
    if (typeof ld.image === 'string') require(/^https?:\/\//.test(ld.image), 'JSON-LD: image is not absolute');
    if (ld.image && typeof ld.image === 'object') {
      require(ld.image['@type'] === 'imageObject', 'JSON-LD: image must be an imageObject');
      require(/^https?:\/\//.test(ld.image.url ?? ''), 'JSON-LD: image.url is not absolute');
    }
    if (ld.mainEntityOfPage) require(/^https?:\/\//.test(ld.mainEntityOfPage['@id'] ?? ''), 'JSON-LD: mainEntityOfPage needs an absolute @id');
    require((ld.headline ?? '').length <= 110, `JSON-LD: headline is longer than 110 characters (${(ld.headline ?? '').length})`);
  }
}

/** Intent of the SEO fixtures, written down. */
function knobs(hugo) {
  const expect = (rel, label, actual, wanted) => {
    if (actual === wanted) ok();
    else fail(`${rel} ${label}: ${JSON.stringify(actual)} != ${JSON.stringify(wanted)}`);
  };

  const knobsPage = hugo.get('posts/seo-knobs');
  expect('/posts/seo-knobs/', 'title_category in og:title', knobsPage?.metas.get('property:og:title'), 'Seo knobs | Guides');
  expect('/posts/seo-knobs/', 'locale normalization', knobsPage?.metas.get('property:og:locale'), 'es_ES');
  expect('/posts/seo-knobs/', 'image width', knobsPage?.metas.get('property:og:image:width'), '1200');
  expect('/posts/seo-knobs/', 'image height', knobsPage?.metas.get('property:og:image:height'), '630');
  expect('/posts/seo-knobs/', 'page twitter card', knobsPage?.metas.get('name:twitter:card'), 'summary');
  expect('/posts/seo-knobs/', 'author twitter', knobsPage?.metas.get('name:twitter:creator'), '@orgauthor');
  expect('/posts/seo-knobs/', 'canonical override', knobsPage?.links.get('canonical'), 'https://example.com/canonical/');
  expect('/posts/seo-knobs/', 'description max words', knobsPage?.metas.get('name:description')?.split(' ').length, 8);
  expect('/posts/seo-knobs/', 'JSON-LD type override', knobsPage?.ld?.['@type'], 'CreativeWork');
  expect('/posts/seo-knobs/', 'JSON-LD name override', knobsPage?.ld?.name, 'Seo Name');
  expect('/posts/seo-knobs/', 'JSON-LD sameAs', JSON.stringify(knobsPage?.ld?.sameAs), JSON.stringify(['https://example.com/one', 'https://example.com/two']));
  expect('/posts/seo-knobs/', 'JSON-LD mainEntityOfPage', knobsPage?.ld?.mainEntityOfPage?.['@id'], 'https://example.com/canonical/');
  expect('/posts/seo-knobs/', 'JSON-LD publisher name', knobsPage?.ld?.publisher?.name, 'Org Author');
  expect('/posts/seo-knobs/', 'JSON-LD image dimensions', `${knobsPage?.ld?.image?.width}x${knobsPage?.ld?.image?.height}`, '1200x630');
  expect('/posts/seo-knobs/', 'JSON-LD author type', knobsPage?.ld?.author?.['@type'], 'Organization');

  const excerpt = hugo.get('posts/seo-excerpt')?.metas.get('name:description') ?? '';
  expect('/posts/seo-excerpt/', 'excerpt length', excerpt.replace('…', '').split(' ').length, 100);
  expect('/posts/seo-excerpt/', 'excerpt ellipsis', excerpt.endsWith('…'), true);
  expect('/posts/seo-excerpt/', 'excerpt stops at the first paragraph', /second paragraph/i.test(excerpt), false);

  const images = hugo.get('posts/seo-images');
  expect('/posts/seo-images/', 'authors[0] wins', images?.metas.get('name:author'), 'Second Author');
  expect('/posts/seo-images/', 'string image in JSON-LD', typeof images?.ld?.image, 'string');
}

/* `--standards [dir]` validates a build without an oracle (the deployed demo). */
const standardsOnly = process.argv.includes('--standards');
if (standardsOnly) {
  const dirArg = process.argv[process.argv.indexOf('--standards') + 1];
  const dir = path.resolve(ROOT, dirArg && !dirArg.startsWith('-') ? dirArg : '.out/example-deploy');
  const pages = new Map(walk(dir).map((rel) => [rel, parseHead(path.join(dir, rel, 'index.html'))]));
  const params = path.join(ROOT, 'exampleSite/hugo.toml');
  const twitter = /twitter_username\s*=\s*"[^"]+"/.test(fs.readFileSync(params, 'utf8'));
  for (const [rel, page] of pages) standards(rel, page);
  console.log(`\n${checks} SEO standard checks over ${pages.size} pages, ${failures} failure(s)`);
  process.exit(failures ? 1 : 0);
}

if (!fs.existsSync(HUGO)) {
  console.error(`missing Hugo build: ${path.relative(ROOT, HUGO)}`);
  process.exit(2);
}
if (!fs.existsSync(ORACLE)) {
  console.error(`missing oracle build: ${path.relative(ROOT, ORACLE)}`);
  process.exit(2);
}

const hugoPages = new Map(walk(HUGO).map((rel) => [rel, parseHead(path.join(HUGO, rel, 'index.html'))]));
const oraclePages = new Map(walk(ORACLE).map((rel) => [rel, parseHead(path.join(ORACLE, rel, 'index.html'))]));
const siteParams = path.join(ROOT, 'tests/fixtures/hugo/hugo.toml');
const site = { twitter: /twitter_username\s*=\s*"[^"]+"/.test(fs.readFileSync(siteParams, 'utf8')) };

/* D-14: Jekyll paginates as /page2/, Hugo as /page/2/. Hugo also has a
   /posts/ section index with no Jekyll counterpart. */
const normalizeKey = (rel) => rel.replace(/^page(\d+)$/, 'page/$1');
const canonicalHugo = new Map([...hugoPages].map(([rel, page]) => [normalizeKey(rel), page]));
const canonicalOracle = new Map([...oraclePages].map(([rel, page]) => [normalizeKey(rel), page]));

const missing = [...canonicalOracle.keys()].filter((rel) => !canonicalHugo.has(rel));
const extra = [...canonicalHugo.keys()].filter((rel) => !canonicalOracle.has(rel) && rel !== 'posts');
if (missing.length || extra.length) {
  fail(`page set differs (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`);
} else ok();

for (const [rel, hugoPage] of canonicalHugo) {
  const oraclePage = canonicalOracle.get(rel);
  if (oraclePage) comparePage(rel, hugoPage, oraclePage);
  invariants(rel, hugoPage, site);
  standards(rel, hugoPage);
}
knobs(hugoPages);

const pages = hugoPages.size;
for (const [message, count] of warnings) console.log(`  WARN  ${message} (${count} page(s))`);
console.log(`\n${checks} SEO checks over ${pages} pages, ${failures} failure(s), ${warnings.size} warning kind(s)`);
process.exit(failures ? 1 : 0);
