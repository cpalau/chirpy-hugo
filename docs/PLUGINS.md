# Jekyll plugins: module by module

Chirpy is not only templates: six Jekyll plugins and one local plugin shape the
output. Each one is validated on its own by **Gate 10**
(`npm run test:plugins`, `tests/plugins/check.mjs`); this page records what is
covered and what is excluded because Jekyll and Hugo cannot express the same
thing.

A module is accepted only when **all** of its checks pass. An exclusion is a
documented property of the toolchain, not a skipped failure.

| Module | Jekyll | Port | Checks | Status |
|---|---|---|---|---|
| SEO tag | `jekyll-seo-tag` 2.9.1 | `_partials/seo.html` + helpers | G4, G4b, G4c | ✅ 100 %, see [`SEO.md`](SEO.md) |
| Pagination | `jekyll-paginate` | `.Paginate` over visible posts | 5 in G10 + G4 | ✅ 100 % |
| Archives | `jekyll-archives` | taxonomy / term layouts | 4 in G10 + G4 | ✅ 100 % |
| Sitemap | `jekyll-sitemap` | `layouts/sitemap.xml` | 2 in G10 + G3 | ✅ except D-14 |
| Include cache | `jekyll-include-cache` | `partialCached` | 2 in G10 | ✅ 100 % |
| Last modified | `_plugins/posts-lastmod-hook.rb` | `.Lastmod` (front matter or git) | 5 in G10 | ✅ except single-commit |
| Filters | Liquid + Jekyll filters | helper partials / Hugo funcs | 25 in G10 | ✅ 100 % |
| MathJax asset | Liquid-rendered `mathjax.js` | `scripts/build-js.mjs` | 1 in G10 | ✅ semantic |

## 1. Pagination (`jekyll-paginate`)

The plugin rejects posts with a truthy `hidden` key before paginating
(`lib/jekyll-paginate/pagination.rb`), so the port paginates
`_partials/posts-visible.html` instead of every post. The home layout then
applies the pinned-first algorithm to that set.

Checked: pages per `pagerSize`, total previews (14 visible posts → 5 pages),
no empty trailing page, no hidden post in any listing, pinned posts first, both
spellings (`true` and `"true"`).

## 2. Archives (`jekyll-archives`)

Checked: category term URLs identical to the oracle, tag term count identical,
term pages typed as categories/tags, accented slugs (`guías`) preserved.

## 3. Sitemap (`jekyll-sitemap`)

Checked: the URL set is identical to the oracle's and every `<lastmod>` matches.

**Excluded — D-14:** Jekyll emits `/page2/`, Hugo emits `/page/2/`. Hugo 0.168's
`pagination.path` does not substitute a page token (measured with `page:num`,
`page:num/`, `page{num}` and `page2`), so the shape cannot be expressed. Both
gates normalise it.

## 4. Include cache (`jekyll-include-cache`)

The only cached include is the favicon set. It is now `partialCached`, and the
gate checks both that the cache is used and that every page still carries the
whole favicon set. Caching is invisible in the HTML, so there is no output
difference to compare.

## 5. Last modified (`_plugins/posts-lastmod-hook.rb`)

The plugin runs `git rev-list --count` and writes `last_modified_at` only when a
file has **more than one commit**. The port reads, in order:
`seo.date_modified`, `last_modified_at`, `.Lastmod` (which `lastmod` or
`enableGitInfo` fills), then `date`.

Checked on a throwaway git repository with a fixed clock: the twice-committed
post has the last commit date in the JSON-LD, the sitemap and the feed, and all
three agree.

**Excluded — single commit:** Hugo's GitInfo always exposes the last commit
date; the plugin leaves the key unset for a file with one commit. A
single-commit post therefore shows a modified date in Hugo and the publication
date in Jekyll. There is no template-level way to count commits. Declared as
**D-27**.

## 6. Filters

Compared against the exact Ruby implementations Jekyll uses:

| Filter | Ruby | Cases |
|---|---|---|
| `slugify` | `Jekyll::Utils.slugify` | 9 (spaces, accents, `_`, `++`, CJK, dashes, dots) |
| `uri_escape` | `Addressable::URI.normalize_component` | 20 (space, reserved, `%`, quotes, braces, pipe, CJK) |
| `url_encode` | `CGI.escape` | 4 |
| `xml_escape` | `String#encode(xml: :attr)` | 2 (entities and quotes) |
| `date_to_xmlschema` | `Time#xmlschema` | 1 |

This module found and fixed two real differences:

- `uri_escape` used `urlquery`, which encodes reserved characters (RFC 3986
  `:/?=&+#@,;`, sub-delimiters and `%`) that Addressable leaves alone. Share
  links for titles with `&`, `+` or `%` were wrong.
- `xml_escape` does not have a Hugo equivalent: `htmlEscape` uses `&#34;` and
  `&#39;` where Ruby uses `&quot;` and `&apos;`. A partial now matches Ruby, and
  the feed uses it where upstream does (the link `title` attribute).

`where_exp` (home selection) and `find` (media data) are validated behaviourally:
a probe with both `pin`/`hidden` spellings, and fixture 6's `audio/ogg` source,
which only exists when the media lookup resolved the extension.

## 7. MathJax asset

`assets/js/data/mathjax.js` is Liquid-rendered by Jekyll and compressed by its
`layout: compress`; the port renders the same source with
`scripts/build-js.mjs`. Both files are loaded in a VM and their `MathJax` object
is compared as data.

**Excluded — formatting:** the Jekyll build minifies the file to one line, the
port keeps the source layout. The object is identical; whitespace is not.

## 8. Liquid control flow

`assign`, `if/elsif/else`, `unless`, `case/when`, `for`, `capture`, `comment`,
`continue` and `break` (~700 occurrences) are control flow, not features. Their
semantics are proven by Gate 4: 50 pages, every element and attribute identical
after canonicalisation.

## Running it

```bash
npm run test:parity   # builds .out/oracle and .out/hugo
npm run test:plugins  # Gate 10
```

CI runs it in the parity job, where the oracle bundle is already installed.
