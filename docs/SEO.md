# SEO parity

Chirpy does not implement SEO itself: it renders `{% seo title=false %}` from
[`jekyll-seo-tag`](https://github.com/jekyll/jekyll-seo-tag) 2.9.1 and then
rewrites the image tags in `_includes/head.html`. This port reproduces that
output in `layouts/_partials/seo.html` and its helpers under
`layouts/_partials/seo/`.

Nothing here is "inspired by": every branch below is taken from the gem's
`lib/template.html`, `drop.rb`, `author_drop.rb`, `image_drop.rb` and
`json_ld_drop.rb`, and every row names the gate that proves it.

## 1. How it is verified

| Gate | What it proves |
|---|---|
| `npm run test:parity` (G4) | the whole `<head>` of 51 pages is identical to a real Jekyll build |
| `npm run test:seo` (G4b) | every meta/link/JSON-LD field matches, with field-level messages, plus invariants that equality cannot catch |
| `npm run test:features` (G9b) | site-level settings that are not in the corpus: legacy verification, site-wide card, author fallback, publisher logo |
| `npm run test:seo:demo` | the deployed demo passes the same standards checks (17 pages) |
| `npm run test:html` (G2) | the emitted metadata is valid HTML |
| standards (part of G4b) | Open Graph, Twitter card and JSON-LD requirements, independent of Jekyll |

The SEO fixtures are four hidden posts (`seo-knobs`, `seo-excerpt`,
`seo-images` and the site-wide cases in Gate 9b). They are hidden so they do not
participate in pagination or related posts: SEO is compared in the `<head>`, not
through the listing algorithms.

## 2. Document head

| Output | jekyll-seo-tag | This port | Notes |
|---|---|---|---|
| `title` | computed by the gem, suppressed by Chirpy (`title=false`) | `_partials/head.html` | Chirpy's own title (tab pages use the locale string) |
| `generator` | `Jekyll v…` | `Hugo …` | D-06, ignored by both gates |
| `theme-color` (×2) | `head.html` | `_partials/head.html` | light and dark |
| `fediverse:creator` | `head.html` | `_partials/head.html` | from `params.social.fediverse_handle` |

## 3. Core meta tags

| Output | Rule in the gem | This port |
|---|---|---|
| `og:title` | `page_title` = title, plus `title_category` when it differs | `display-title.html` + `title_category` |
| `author` | `AuthorDrop#name` (see §5) | `seo/author.html` |
| `og:locale` | `page.locale \|\| site.locale \|\| page.lang \|\| site.lang \|\| en_US`, `-` → `_` | same order over `.Params.locale`, `site.Language.Locale`, `.Params.lang`, `site.Language.Lang` |
| `description` | `page.description \|\| page.excerpt \|\| site.description`, whitespace-normalised, cut to `seo_description_max_words` (100) with `…` | `seo/description.html` |
| `twitter:description`, `og:description` | same value | same |
| `canonical` | `page.canonical_url` or the absolute page URL (`/index.html` → `/`) | `.Params.canonical_url` or `.Permalink`; paginated home pages point at themselves |
| `og:url` | `canonical_url` | same |
| `og:site_name` | `site.title` | same |

### 3.1 Description and excerpt

`page.excerpt` is not a Hugo concept, so it is rebuilt:

- front-matter `description`, then front-matter `excerpt`;
- then, for posts, the content up to the first blank line (Jekyll's default
  `excerpt_separator`), rendered with `RenderString` and stripped with
  `plainify` (Jekyll renders then strips with `strip_html`);
- then the site description;
- the result is whitespace-normalised, cut to 100 words and gets `…` when it was
  longer — including descriptions that come from the front matter, exactly like
  the gem's `snippet`.

This is why a post without `description` now matches the original: the theme
used to publish Hugo's `.Summary` (different length, and it could run into the
second paragraph).

## 4. Open Graph image

Chirpy rewrites the gem's image tags in `head.html`. The two shapes are kept:

| Case | What is emitted | Where |
|---|---|---|
| `page.image` | `og:image`, `og:image:height`, `og:image:width`, `og:image:alt` early, then `twitter:card`, `twitter:image`, `twitter:image:alt` | `seo/image.html` |
| no page image, `social_preview_image` | `og:image` + `summary_large_image` + `property="twitter:image"` at the position of Chirpy's replacement | same |

`image` accepts the string and the map form, plus the gem's path fallbacks
(`path`, then `facebook`, then `twitter`), `alt`, `lqip`, `width` and `height`.
`media_subpath`, `params.cdn` and absolute URLs are resolved by
`media-url.html`. Width and height stay numeric.

## 5. Authors

`AuthorDrop` resolves, in order: front-matter `author`, the first entry of
front-matter `authors`, then `site.author`. A string is looked up in
`site.data.authors`; the data file wins over the string. The twitter handle
falls back to the author name and a leading `@` is removed before the caller
adds one.

| Jekyll | Hugo |
|---|---|
| `site.author` | `params.author` |
| `_data/authors.yml` | `data/authors.yaml` (`name`, `url`, `twitter`, `type`) |
| `page.author` (string or map) | same front matter |
| `page.authors` (array) | same front matter, first entry |

`type` is used by the JSON-LD (`Person` by default, `Organization` accepted; any
other value suppresses the JSON-LD author, like the gem). Give the fallback
author a `twitter` handle: the gem falls back to the *name* for
`twitter:creator`, and a display name is not a valid handle. The SEO gate
reports that case as a warning.

## 6. Dates and article metadata

| Output | Rule |
|---|---|
| `og:type` | `article` when the page has a date, else `website` |
| `article:published_time` | `date` |
| `article:modified_time` | `seo.date_modified` → `last_modified_at` → `lastmod` → `date` |
| `rel=prev` / `rel=next` | the home paginator, in Jekyll's order |
| JSON-LD `datePublished` / `dateModified` | the same two dates |

`last_modified_at` is accepted for sites migrated from Jekyll; `lastmod` is the
Hugo convention and is what the fixtures use. `seo.date_modified` overrides
both, as in the gem.

## 7. Twitter, Facebook, verifications

| Output | Rule |
|---|---|
| `twitter:card` | front-matter `twitter.card` → `params.twitter_card` → `summary_large_image` when there is an image, `summary` otherwise |
| `twitter:site` | `params.twitter_username`, `@` normalised |
| `twitter:creator` | only when the site has a handle; the author's twitter (name fallback), `@` normalised |
| `fb:admins`, `article:publisher`, `fb:app_id` | `params.facebook.{admins,publisher,app_id}` |
| the six `webmaster_verifications` | one meta each, only when that key has a value |
| `google_site_verification` | legacy fallback, used when no verification value is set |

The last row is the only deliberate deviation: Jekyll checks whether the
`webmaster_verifications` **table exists** (Chirpy's config always defines it,
empty), while this port checks whether it has **any value**. A site that sets
the legacy key gets the tag instead of silence, and a site that does not is
byte-identical.

## 8. JSON-LD

Keys are emitted in the gem's sorted order. `author`, `dateModified`,
`datePublished`, `description`, `headline`, `image`, `mainEntityOfPage`, `name`,
`publisher`, `sameAs` and `url` appear only when the gem would emit them.

| Key | Rule |
|---|---|
| `@type` | `seo.type` → `WebSite` on the home page and `/about/` → `BlogPosting` when the page has a date → `WebPage` |
| `author` | `{@type, name, url}` from §5; omitted when the type is not `Person`/`Organization` |
| `image` | the absolute URL when `image` only declares a path; otherwise `{alt, lqip, width, height, …, url, @type: imageObject}` |
| `mainEntityOfPage` | only for `BlogPosting` and `CreativeWork`: `{@type: WebPage, @id: canonical}` |
| `name` | `seo.name`, or the social name (then the site title) on the home page and `/about/` |
| `publisher` | when `params.logo` is set: `{@type: Organization, logo: {…url}, name: author}` |
| `sameAs` | `seo.links`, or `params.social.links` on the home page and `/about/` |
| `url` | the canonical URL |

A paginated home page (`/page/2/`) is **not** the home page: the gem keys this
off the URL, so its type is `WebPage` and it has no `name`/`sameAs`/`WebSite`.

## 9. Configuration map

| Jekyll (root) | Hugo | Default |
|---|---|---|
| `logo` | `params.logo` | `""` |
| `author` | `params.author` | `""` |
| `twitter.card` | `params.twitter_card` | `""` |
| `facebook.admins/publisher/app_id` | `params.facebook.*` | `""` |
| `google_site_verification` | `params.google_site_verification` | `""` |
| `social.name`, `social.links` | `params.social.*` | as shipped |
| `lang`, `locale` | `languageCode`, `locale` | `en` |
| page `seo.*`, `canonical_url`, `title_category`, `seo_description_max_words` | same front matter keys | — |

## 10. Declared divergences

| Id | What |
|---|---|
| D-06 | `generator` says Hugo, not Jekyll |
| D-14 | paginated URLs are `/page/N/` instead of `/pageN/` |
| D-26 | an image map with no `path` (only `facebook`/`twitter`): Jekyll's post header interpolates the hash and emits invalid markup; this port resolves the same path the SEO tag uses |
| — | JSON object key order is not preserved by Hugo's maps; both gates compare JSON-LD as parsed data, which is what the key order means |

Nothing else is left out: `_partials/seo.html` covers every field and branch of
the gem's template, and the tables above name the gate for each one.

## 11. Beyond upstream

These are additions: the Jekyll theme does not have them. **All are off by
default**, so a site that does not opt in renders exactly the upstream HTML and
the parity gates stay green.

| Feature | Default | Why | Test |
|---|---|---|---|
| `hreflang` + `x-default` | automatic | a translated page must name its siblings; Google otherwise picks one | G4c |
| `dir="rtl"` | automatic | Hugo exposes the language direction; without it RTL text is indexed and laid out wrong | G4c |
| `params.seo.noindex_hidden` | `false` | `hidden: true` removes a post from the listings but search engines still index it | G4c |
| `noindex: true` (front matter) | honoured | per-page opt-out | G4c |
| `params.seo.feed_discovery` | `false` | `<link rel="alternate" type="application/atom+xml">` for readers and crawlers | G4c |
| `params.seo.breadcrumbs` | `false` | `BreadcrumbList` rich result from the page hierarchy | G4c |
| `params.seo.description_max_chars` | `0` | the gem cuts at 100 words (~600 characters); Google shows ~160 | G4c |
| `params.seo.image_fallback` | `false` | Google asks for `image` in Article data; a post without a cover gets the social preview | G4c |
| `params.seo.article_meta` | `false` | `article:section`, `article:tag`, `article:author` | G4c |
| `params.seo.image_metadata` | `false` | `og:image:type`, plus width/height from the asset when Hugo can resolve it | G4c |
| `params.seo.sitemap_limit` | `50000` | a sitemap above the protocol limit is invalid; the build warns with the count | G4c |

`hreflang` and `dir` need no switch because they only render when the site has
translations or a language direction; a monolingual LTR site is unaffected.

Gate 4c (`npm run test:seo:ext`) builds a multilingual fixture (English,
Spanish, Arabic RTL) with every switch on and asserts each feature, then runs
the standards gate over the result. `npm run test:seo:demo` applies the same
standards to the built demo.
