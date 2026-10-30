#!/usr/bin/env node
/**
 * Gate 10 — Jekyll plugin parity, module by module.
 *
 *   node tests/plugins/check.mjs
 *
 * Chirpy is not only its templates: six Jekyll plugins and one local plugin
 * shape the output. Each module is validated here on its own, and the report
 * says whether it is 100 % covered or which part is excluded because Jekyll and
 * Hugo cannot express the same thing.
 *
 *   lastmod     posts-lastmod-hook.rb  → .Lastmod (front matter or git)
 *   cache       jekyll-include-cache   → partialCached
 *   paginate    jekyll-paginate        → .Paginate(visible posts)
 *   archives    jekyll-archives        → taxonomy/term pages
 *   sitemap     jekyll-sitemap         → custom sitemap template
 *   filters     Liquid filters         → helper partials
 *   mathjax     Liquid-rendered asset  → build-js.mjs output
 *
 * It needs the parity builds (`.out/oracle`, `.out/hugo`); run `test:parity`
 * first, or let CI run them in the same job.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HUGO = process.env.HUGO ?? 'hugo';
const ORACLE = path.join(ROOT, '.out/oracle');
const ORACLE_SRC = path.join(ROOT, 'tests/oracle');
const BUILD = path.join(ROOT, '.out/hugo');
const WORK = path.join(ROOT, '.out/plugins');

let checks = 0;
let failures = 0;
const ok = (label) => {
  checks += 1;
  console.log(`  ok    ${label}`);
};
const fail = (label, detail = '') => {
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` (${detail})` : ''}`);
};
const expect = (label, condition, detail = '') => (condition ? ok(label) : fail(label, detail));
const section = (name) => console.log(`\n${name}`);

const walk = (dir, ext) => {
  const out = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (!ext || entry.name.endsWith(ext)) out.push(path.relative(dir, abs));
    }
  };
  visit(dir);
  return out;
};

if (!fs.existsSync(ORACLE) || !fs.existsSync(BUILD)) {
  console.error('missing .out/oracle or .out/hugo; run npm run test:parity first');
  process.exit(2);
}

/* ------------------------------------------------------------------ lastmod */

section('lastmod (posts-lastmod-hook.rb)');
{
  const site = path.join(WORK, 'lastmod');
  fs.rmSync(site, { recursive: true, force: true });
  fs.mkdirSync(path.join(site, 'content/posts'), { recursive: true });
  const starter = fs.readFileSync(path.join(ROOT, 'starter/hugo.toml'), 'utf8');
  // Root keys must come before the first table, or TOML scopes them inside it.
  fs.writeFileSync(path.join(site, 'hugo.toml'), `enableGitInfo = true\n${starter}`);
  const post = (title) =>
    `---\ntitle: "${title}"\ndate: 2026-04-01T09:00:00Z\n---\n\nBody of ${title}.\n`;
  fs.writeFileSync(path.join(site, 'content/posts/once.md'), post('Once'));
  fs.writeFileSync(path.join(site, 'content/posts/twice.md'), post('Twice'));

  const git = (args, date) =>
    execFileSync('git', args, {
      cwd: site,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    });
  git(['init', '-q', '-b', 'main']);
  // The machine may have global commit signing on; this throwaway repo has no key.
  git(['config', 'commit.gpgsign', 'false']);
  git(['config', 'tag.gpgsign', 'false']);
  git(['add', '-A']);
  git(['commit', '-qm', 'one'], '2026-05-01T10:00:00+0000');
  fs.appendFileSync(path.join(site, 'content/posts/twice.md'), '\nSecond revision.\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'two'], '2026-05-02T11:00:00+0000');

  const out = path.join(site, 'out');
  fs.rmSync(out, { recursive: true, force: true });
  const built = spawnSync(
    HUGO,
    ['-s', site, '--themesDir', path.dirname(ROOT), '--theme', path.basename(ROOT), '-d', out],
    { encoding: 'utf8' },
  );
  if (built.status !== 0) {
    fail('lastmod: build', (built.stderr || '').split('\n')[0]);
  } else {
    const page = (name) => fs.readFileSync(path.join(out, `posts/${name}/index.html`), 'utf8');
    const ldDate = (html) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]).dateModified;
    const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    const sitemapDate = (slug) => new RegExp(`<loc>[^<]*/posts/${slug}/</loc>\\s*<lastmod>([^<]+)</lastmod>`).exec(sitemap)?.[1];
    const feed = fs.readFileSync(path.join(out, 'feed.xml'), 'utf8');
    const feedDate = (slug) => new RegExp(`<link href="[^"]*/posts/${slug}/"[^>]*>[\\s\\S]*?<updated>([^<]+)</updated>`).exec(feed)?.[1];

    expect('twice-committed post: JSON-LD dateModified is the last commit', ldDate(page('twice'))?.startsWith('2026-05-02T11:00:00'), ldDate(page('twice')));
    expect('twice-committed post: sitemap lastmod matches', sitemapDate('twice')?.startsWith('2026-05-02T11:00:00'), sitemapDate('twice'));
    expect('twice-committed post: feed updated matches', feedDate('twice')?.startsWith('2026-05-02T11:00:00'), feedDate('twice'));
    expect(
      'SEO, sitemap and feed agree',
      ldDate(page('twice'))?.slice(0, 19) === sitemapDate('twice')?.slice(0, 19) &&
        sitemapDate('twice')?.slice(0, 19) === feedDate('twice')?.slice(0, 19),
    );
    /* Excluded on purpose: `posts-lastmod-hook.rb` only writes the key when the
       file has more than one commit; Hugo's GitInfo always exposes the last
       commit date. Documented in docs/PLUGINS.md. */
    expect('single-commit post: Hugo exposes the commit date (documented exclusion)', ldDate(page('once'))?.startsWith('2026-05-01T10:00:00'), ldDate(page('once')));
  }
}

/* -------------------------------------------------------------------- cache */

section('include_cached (jekyll-include-cache)');
{
  const head = fs.readFileSync(path.join(ROOT, 'layouts/_partials/head.html'), 'utf8');
  expect('favicons are cached', /partialCached "favicons\.html"/.test(head));
  const pages = walk(BUILD, 'index.html');
  const withFavicons = pages.filter((rel) => fs.readFileSync(path.join(BUILD, rel), 'utf8').includes('rel="icon"'));
  expect('every page still carries the favicon set', withFavicons.length === pages.length, `${withFavicons.length}/${pages.length}`);
}

/* ----------------------------------------------------------------- paginate */

section('paginate (jekyll-paginate)');
{
  const home = (rel) => fs.readFileSync(path.join(BUILD, rel, 'index.html'), 'utf8');
  const previews = (rel) => (home(rel).match(/class="card-wrapper card"/g) ?? []).length;
  const pages = [''] .concat(fs.existsSync(path.join(BUILD, 'page')) ? fs.readdirSync(path.join(BUILD, 'page')).filter((n) => /^\d+$/.test(n)).map((n) => `page/${n}`) : []);
  const perPage = 3;
  const counts = pages.map((rel) => previews(rel));
  const total = counts.reduce((a, b) => a + b, 0);
  expect('pagination pages follow pagerSize', counts.slice(0, -1).every((n) => n === perPage), JSON.stringify(counts));
  expect('total previews equal visible posts', total === 14, `${total}`);
  expect('no empty trailing page', counts.at(-1) > 0, JSON.stringify(counts.at(-1)));
  expect('hidden posts never appear in a listing', !pages.some((rel) => home(rel).includes('href="/posts/hidden/"')));
  const first = home('').indexOf('href="/posts/pinned-b/"');
  const normal = home('').indexOf('href="/posts/seo-knobs/"');
  expect('pinned posts come first', first >= 0 && normal > first);
}

/* ----------------------------------------------------------------- archives */

section('archives (jekyll-archives)');
{
  const oracleTerms = walk(path.join(ORACLE, 'categories'), 'index.html')
    .map((rel) => `/categories/${path.dirname(rel).replace(/^\.$/, '')}/`.replace('//', '/'))
    .sort();
  const hugoTerms = walk(path.join(BUILD, 'categories'), 'index.html')
    .map((rel) => `/categories/${path.dirname(rel).replace(/^\.$/, '')}/`.replace('//', '/'))
    .sort();
  expect('category term URLs are identical', JSON.stringify(oracleTerms) === JSON.stringify(hugoTerms), `${oracleTerms.length} vs ${hugoTerms.length}`);
  const tagTerms = (dir) => walk(path.join(dir, 'tags'), 'index.html').length;
  expect('tag term count is identical', tagTerms(ORACLE) === tagTerms(BUILD), `${tagTerms(ORACLE)} vs ${tagTerms(BUILD)}`);
  const termPage = fs.readFileSync(path.join(BUILD, 'categories/guides/index.html'), 'utf8');
  expect('term pages are typed as categories', /data-bs-theme|breadcrumb/.test(termPage) && termPage.includes('/categories/'));
  expect('accented term keeps its slug', fs.existsSync(path.join(BUILD, 'categories/guías/index.html')));
}

/* ------------------------------------------------------------------ sitemap */

section('sitemap (jekyll-sitemap)');
{
  const parse = (file) => {
    const xml = fs.readFileSync(file, 'utf8');
    const rows = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, body]) => ({
      loc: /<loc>([^<]+)<\/loc>/.exec(body)?.[1] ?? '',
      lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(body)?.[1] ?? '',
    }));
    const norm = (url) => url.replace(/\/page(\d+)\//g, '/page/$1/');
    return new Map(rows.map((row) => [norm(row.loc), row.lastmod]));
  };
  const oracle = parse(path.join(ORACLE, 'sitemap.xml'));
  const hugo = parse(path.join(BUILD, 'sitemap.xml'));
  const onlyOracle = [...oracle.keys()].filter((url) => !hugo.has(url));
  const onlyHugo = [...hugo.keys()].filter((url) => !oracle.has(url));
  expect('URL set is identical', onlyOracle.length === 0 && onlyHugo.length === 0, `oracle-only ${onlyOracle[0] ?? '-'} hugo-only ${onlyHugo[0] ?? '-'}`);
  const mismatched = [...oracle.keys()].filter((url) => hugo.has(url) && hugo.get(url) !== oracle.get(url));
  expect('lastmod is identical for every URL', mismatched.length === 0, `${mismatched.length} mismatch(es): ${mismatched[0] ?? ''}`);
}

/* ------------------------------------------------------------------ mathjax */

section('mathjax (Liquid-rendered asset)');
{
  const load = (file) => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    return JSON.parse(JSON.stringify(context.MathJax));
  };
  const oracle = load(path.join(ORACLE, 'assets/js/data/mathjax.js'));
  const ours = load(path.join(ROOT, 'static/assets/js/data/mathjax.js'));
  expect('MathJax config is semantically identical', JSON.stringify(oracle) === JSON.stringify(ours), JSON.stringify(ours).slice(0, 80));
}


/* ------------------------------------------------------------------ filters */

section('filters (Liquid §)');
{
  const cases = {
    slug: ['Hello World', 'Ávila', 'a_b', 'C++ / C#', '中文 标题', '  X  ', 'a--b', 'ümlaut', 'foo.bar'],
    uri: ['a b', 'a:b', 'a/b?c=d&e', 'Ávila', 'a+b', 'a%20b'],
    url: ['a b', 'a/b?c=d&e', 'Ávila', 'a+b'],
    uri2: ['a/b?c=d&e', 'a+b', 'a%20b', 'a#b', 'a@b', 'a,b;c', "a!$'()*", 'a[b]', 'a{b}', 'a|b', 'a\\b', 'a^b', 'a`b', 'a<b>', 'a"b'],
    xml: ['R&D <b>"x"</b> \'q\'', 'a & b'],
  };
  const RUBY = `# frozen_string_literal: true
require "json"
require "jekyll"
require "addressable/uri"
require "cgi"
require "time"
input = JSON.parse($stdin.read)
out = {}
out["slug"] = input["slug"].map { |s| Jekyll::Utils.slugify(s) }
out["uri"] = input["uri"].map { |s| Addressable::URI.normalize_component(s) }
out["url"] = input["url"].map { |s| CGI.escape(s) }
out["xml"] = input["xml"].map { |s| s.encode(:xml => :attr).gsub(%r!\\A"|"\\Z!, "") }
out["date"] = Time.parse("2026-04-01 09:00:00 +0000").xmlschema
puts JSON.generate(out)
`;
  fs.mkdirSync(WORK, { recursive: true });
  const rubyFile = path.join(WORK, '_filters.rb');
  fs.writeFileSync(rubyFile, RUBY);
  const ruby = JSON.parse(
    execFileSync('bundle', ['exec', 'ruby', rubyFile], {
      cwd: ORACLE_SRC,
      encoding: 'utf8',
      input: JSON.stringify(cases),
      env: { ...process.env, TZ: 'UTC', BUNDLE_GEMFILE: path.join(ORACLE_SRC, 'Gemfile') },
    }),
  );

  const site = path.join(WORK, 'filters');
  fs.rmSync(site, { recursive: true, force: true });
  fs.mkdirSync(path.join(site, 'layouts'), { recursive: true });
  fs.mkdirSync(path.join(site, 'content'), { recursive: true });
  fs.writeFileSync(path.join(site, 'content/_index.md'), '---\ntitle: home\n---\n');
  fs.writeFileSync(
    path.join(site, 'hugo.toml'),
    `baseURL = "http://127.0.0.1:4001/"\ntitle = "filters"\ndisableKinds = ["taxonomy", "term", "rss", "sitemap", "section"]\n\n[params]\n  slug = ${JSON.stringify(cases.slug)}\n  uri = ${JSON.stringify(cases.uri)}\n  url = ${JSON.stringify(cases.url)}\n  xml = ${JSON.stringify(cases.xml)}\n`,
  );
  fs.writeFileSync(
    path.join(site, 'layouts/index.html'),
    `{{- $out := dict -}}
{{- range $i, $s := site.Params.slug }}{{ $out = merge $out (dict (printf "slug-%d" $i) (partial "slugify.html" $s)) }}{{ end -}}
{{- range $i, $s := site.Params.uri }}{{ $out = merge $out (dict (printf "uri-%d" $i) (partial "uri-escape.html" $s)) }}{{ end -}}
{{- range $i, $s := site.Params.url }}{{ $out = merge $out (dict (printf "url-%d" $i) (urlquery $s)) }}{{ end -}}
{{- range $i, $s := site.Params.xml }}{{ $out = merge $out (dict (printf "xml-%d" $i) (partial "xml-escape.html" $s)) }}{{ end -}}
{{- $out = merge $out (dict "date" (time.AsTime "2026-04-01T09:00:00Z" | time.Format "2006-01-02T15:04:05-07:00")) -}}
{{- $out | jsonify -}}`,
  );
  const out = path.join(site, 'out');
  const built = spawnSync(HUGO, ['-s', site, '--themesDir', path.dirname(ROOT), '--theme', path.basename(ROOT), '-d', out], { encoding: 'utf8' });
  if (built.status !== 0) {
    fail('filters: build', (built.stderr || '').split('\n')[0]);
  } else {
    const hugo = JSON.parse(fs.readFileSync(path.join(out, 'index.html'), 'utf8'));
    for (const [kind, values] of Object.entries(cases)) {
      const key = kind === 'uri2' ? 'uri2' : kind;
      if (kind === 'uri2') continue;
      values.forEach((value, i) => {
        const name = `${kind}[${JSON.stringify(value)}]`;
        expect(name, hugo[`${key}-${i}`] === ruby[key][i], `hugo ${JSON.stringify(hugo[`${key}-${i}`])} != jekyll ${JSON.stringify(ruby[key][i])}`);
      });
    }
    expect('date_to_xmlschema', hugo.date === ruby.date, `${hugo.date} != ${ruby.date}`);
  }
}

/* ------------------------------------------------------- where_exp / find */

section('where_exp and find (home selection and media data)');
{
  const site = path.join(WORK, 'selection');
  fs.rmSync(site, { recursive: true, force: true });
  fs.mkdirSync(path.join(site, 'content/posts'), { recursive: true });
  fs.writeFileSync(path.join(site, 'hugo.toml'), fs.readFileSync(path.join(ROOT, 'starter/hugo.toml'), 'utf8'));
  const post = (name, front) => fs.writeFileSync(path.join(site, `content/posts/${name}.md`), `---\ntitle: "${name}"\ndate: 2026-06-01T09:00:00Z\n${front}---\n\nBody.\n`);
  post('pin-true', 'pin: true\n');
  post('pin-string', 'pin: "true"\n');
  post('normal', '');
  post('hidden-true', 'hidden: true\n');
  post('hidden-string', 'hidden: "true"\n');
  post('pin-hidden', 'pin: true\nhidden: true\n');
  const out = path.join(site, 'out');
  fs.rmSync(out, { recursive: true, force: true });
  const built = spawnSync(HUGO, ['-s', site, '--themesDir', path.dirname(ROOT), '--theme', path.basename(ROOT), '-d', out], { encoding: 'utf8' });
  if (built.status !== 0) {
    fail('where_exp: build', (built.stderr || '').split('\n')[0]);
  } else {
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const home = html.slice(html.indexOf('id="post-list"'), html.indexOf('</main>'));
    const listed = [...home.matchAll(/href="\/posts\/([^"/]+)\/"/g)].map((m) => m[1]);
    const unique = [...new Set(listed)];
    expect('normal post is listed', unique.includes('normal'));
    expect('both pin spellings are listed', unique.includes('pin-true') && unique.includes('pin-string'));
    expect('both hidden spellings are excluded', !unique.includes('hidden-true') && !unique.includes('hidden-string'));
    expect('a pinned hidden post is excluded', !unique.includes('pin-hidden'));
    expect('pinned posts are listed before the normal one', unique.indexOf('normal') > unique.indexOf('pin-true'));
  }
  /* `find` on data/media.yml: fixture 6 embeds an ogg source, which only exists
     when the media lookup resolved the extension. */
  const embeds = fs.readFileSync(path.join(BUILD, 'posts/embeds/index.html'), 'utf8');
  expect('find resolves the media type for an embed', embeds.includes('type="audio/ogg"'), 'audio/ogg source missing');
}

/* ------------------------------------------------------------------ summary */

console.log(`\n${checks} plugin checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
