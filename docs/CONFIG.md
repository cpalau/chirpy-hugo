# Configuration Contract

Jekyll **merges** the theme's `_config.yml` into the site configuration. Hugo
also merges theme/module configuration, but **per category**, with the project
taking priority:

| Category | Merge strategy | Meaning for this theme |
|---|---|---|
| `params` | `deep` | Safe to ship defaults; users override individual keys |
| `markup`, `outputs`, `permalinks`, `module`, `languages`, `pagination`, `menus` | `none` | If the project defines the category, the theme's version is replaced. Measured: a theme menu disappears as soon as the site declares `[menus]`, and appears only when the site declares none |

This document is therefore the single source of truth for everything the theme
reads, and the reference used by `scripts/check-config.mjs`.

Rules:

- **R-CFG-1** — The theme never reads a param that is not listed here.
- **R-CFG-2** — Every param has an in-template default; a site with an empty
  `params` table must build.
- **R-CFG-3** — `check-config.mjs` fails if a template reads an undocumented key.
- **R-CFG-4** — `starter/config/_default/params.toml` is canonical; upgrades
  diff against it.

---

## 1. Site-level mapping

| Jekyll `_config.yml` | Hugo | Notes |
|---|---|---|
| `lang` | `defaultContentLanguage` + `languageCode` | |
| `timezone` | `timeZone` | IANA name |
| `title` | `title` | |
| `tagline` | `params.tagline` | sidebar subtitle |
| — | `params.home_title` | optional longer title for the home page (tab and `og:title`) |
| `description` | `params.description` | meta + feed |
| `url` | `baseURL` | must end with `/` |
| `baseurl` | `baseURL` path component | subdirectory deployments |
| `theme` | `module.imports` | Hugo Module |
| `theme_mode` | `params.theme_mode` | `light` \| `dark` \| empty (system) |
| `alt_lang` | `params.alt_lang` | optional `<html lang>` override |
| `avatar` | `params.avatar` | local or CORS URL |
| `cdn` | `params.cdn` | prefixes media paths starting with `/` |
| `social_preview_image` | `params.social_preview_image` | default `og:image` |
| `toc` | `params.toc` | global TOC switch |
| `paginate` | `pagination.pagerSize` | |
| `paginate_path` | `pagination.path` | default `/page:num/` |
| `github.username` | `params.github_username` | |
| `twitter.username` | `params.twitter_username` | |
| `feed` | custom output format | upstream feed is hand-written Atom (5 posts) |
| `jekyll-archives` | `taxonomies` | categories + tags only |
| `compress_html` | `minify` | |

---

## 2. `params.social`

| Jekyll | Hugo | Type |
|---|---|---|
| `social.name` | `params.social.name` | string — default post author and copyright holder |
| `social.email` | `params.social.email` | string |
| `social.fediverse_handle` | `params.social.fediverse_handle` | string — emits `fediverse:creator` |
| `social.links[]` | `params.social.links[]` | list of URLs; the first is the copyright link |
| — | `params.footer.copyright` | site-owned footer line; `:author` becomes `social.name` (linked to the first social link), `:year` the current year. Empty keeps upstream's "© year author. Some rights reserved." |

---

## 2b. Theme identity

| Jekyll | Hugo | Notes |
|---|---|---|
| `theme.version` (Ruby gem) | `params.theme_version` | the upstream Chirpy version this port reproduces; checked against the pin |
| — | `data/theme.yaml` | this theme's own version, rendered in the footer tooltip and linked to its GitHub release; `scripts/release.mjs --prepare` bumps it with `package.json` |
| `site.theme` | — | upstream interpolates the gem name into the CSS path; our build emits a fixed path |

---

## 3. `params.webmaster_verifications`

| Key | Emitted as |
|---|---|
| `google` | `<meta name="google-site-verification">` |
| `bing` | `<meta name="msvalidate.01">` |
| `alexa` | `<meta name="alexaVerifyID">` |
| `yandex` | `<meta name="yandex-verification">` |
| `baidu` | `<meta name="baidu-site-verification">` |
| `facebook` | `<meta name="facebook-domain-verification">` |

Empty values emit nothing.

---

## 4. `params.analytics`

| Provider | Keys | Emitted when |
|---|---|---|
| `google` | `id` | `id` non-empty |
| `goatcounter` | `id` | `id` non-empty |
| `umami` | `id`, `domain` | `id` non-empty |
| `matomo` | `id`, `domain` | `id` and `domain` non-empty |
| `cloudflare` | `id` | `id` non-empty |
| `fathom` | `id` | `id` non-empty |

Providers are independent; several may be enabled at once, as upstream allows.

---

## 5. `params.pageviews`

| Key | Value |
|---|---|
| `provider` | `goatcounter` \| empty |

Requires `params.analytics.goatcounter.id` for the counter endpoint.

---

## 6. `params.comments`

| Key | Values |
|---|---|
| `provider` | `disqus` \| `utterances` \| `giscus` \| empty |
| `disqus.shortname` | string |
| `utterances.repo` | `owner/repo` |
| `utterances.issue_term` | `pathname` \| `url` \| `title` \| … |
| `giscus.repo` | `owner/repo` |
| `giscus.repo_id` | string |
| `giscus.category` | string |
| `giscus.category_id` | string |
| `giscus.mapping` | default `pathname` |
| `giscus.strict` | default `0` |
| `giscus.input_position` | default `bottom` |
| `giscus.lang` | default site language |
| `giscus.reactions_enabled` | default `1` |

Per-post override: front matter `comments: false`.

---

## 7. `params.edit_post`

| Key | Values |
|---|---|
| `enabled` | bool |
| `url` | repository base URL |
| `static_url` | bool — when `false`, the page path is appended |

Jekyll key: `actions.edit_post.{enabled,url,static_url}`. `scripts/extract-params.mjs`
reads that root from upstream and fails if this section disappears, so keep the
word `actions` in it.

---

## 8. `params.assets`

| Key | Values |
|---|---|
| `assets.self_host.enabled` | bool |
| `assets.self_host.env` | `development` \| `production` \| empty (both) |

Mirrors upstream `assets.self_host`.

**Important (audit G-24):** when self-hosting is enabled, upstream points at
`/assets/lib/*`, which comes from the separate repository
[`cotes2020/chirpy-static-assets`](https://github.com/cotes2020/chirpy-static-assets).
Our theme must mount that repository as a Hugo module (or document the manual
mount). Self-host mode does not work without it.

---

## 9. `params.pwa`

| Key | Values |
|---|---|
| `pwa.enabled` | bool |
| `pwa.cache.enabled` | bool |
| `pwa.cache.deny_paths` | list of path prefixes excluded from the offline cache |

---

## 9b. Data files

| File | Purpose |
|---|---|
| `data/authors.yml` | author registry (`name`, `twitter`, `url`) |
| `data/contact.yml` | sidebar contact entries (`type`, `icon`, `noblank`, `url`) |
| `data/share.yml` | share platforms (`type`, `icon`, `link` with `TITLE`/`URL`) |
| `data/media.yml` | extension → MIME type for audio and video embeds |
| `data/origin/basic.yml` | self-hosted vendor asset paths (`/assets/lib/...`) |
| `data/origin/cors.yml` | CDN vendor URLs and resource hints (**no SRI**) |

These four data files are **byte-identical copies** of upstream `_data/*.yml`
(`mode: copy` in `tests/contract/ports.yml`), extension included: Hugo accepts
`.yml`, so no transformation is needed and the sha256 check is exact.

`data/media.yml` is required by the audio and video embeds: without it, the
`<source type="…">` values are wrong.

---

## 10. Front matter

Documented in `FEATURES.md` §2. Equivalent to upstream:

```yaml
title: string
date: datetime
categories: [string]
tags: [string]
pin: bool
author: string                # key in data/authors.yaml
description: string
image:
  path: string
  alt: string
  lqip: string                # base64 data URI
media_subpath: string
toc: bool
comments: bool
math: bool
mermaid: bool
```

Post defaults (upstream `defaults`) become a cascade:

```toml
# content/posts/_index.md
cascade:
  layout: page
  comments: true
  toc: true
```

---

## 10. `params.assets.self_host`

The theme ships the browser libraries it needs, so a page talks to one origin.

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | `true`: serve fonts, icons and libraries from `static/assets/lib/`; `false`: use the upstream CDNs |
| `env` | `""` | If set, self-host only when it equals `hugo.Environment` |

Files come from `cotes2020/chirpy-static-assets` at a pinned commit, copied by
`scripts/vendor.mjs` and verified by `npm run test:vendor`. MathJax and Mermaid
are **not** vendored (23 MB together): they keep the CDN and only load on pages
that declare `math` or `mermaid`.

Turning it off restores the upstream behaviour byte for byte:

```toml
[params.assets]
  [params.assets.self_host]
    enabled = false
```

Measured effect (D-22): mobile Lighthouse 66 → 92 on the home page, LCP 6.3 s →
3.0 s.

---

## 11. Minimal user configuration

Because `params` uses Hugo's `deep` merge strategy, **the theme ships every
default** in `config/_default/params.toml`. A user site does not need to declare
any of them; it only overrides what it wants to change.

The only settings a user must provide are the ones in non-merging categories
(`markup`, `outputs`). The theme checks them on every build
(`_partials/check-config.html`) and prints one warning with the exact TOML block
for the ones it can detect: block attributes, highlighting classes and the four
home output formats. Two are not probed: `unsafe` already has Hugo's own
`warning-goldmark-raw-html` on the page that needs it, and `enableRobotsTXT` is
read before the theme is merged, so a template cannot see it. The block below is
the complete, copy-pasteable snippet:

```toml
enableRobotsTXT = true   # upstream publishes /robots.txt (theme asset)

[markup.goldmark.renderer]
  unsafe = true          # upstream content uses raw HTML

[markup.goldmark.parser.attribute]
  block = true           # classes on code fences

[markup.highlight]
  noClasses = false      # emit classes, styled by _sass/base/_syntax.scss
                         # (the default emits inline styles and breaks the theme)

[mediaTypes."application/atom+xml"]
  suffixes = ["xml"]

[mediaTypes."application/manifest+json"]
  suffixes = ["webmanifest"]

[outputFormats.search]
  mediaType = "application/json"
  baseName = "search"
  path = "assets/js/data"
  isPlainText = true
  notAlternative = true

[outputFormats.feed]
  mediaType = "application/atom+xml"
  baseName = "feed"
  isPlainText = true
  notAlternative = true

[outputFormats.swconf]
  mediaType = "text/javascript"
  baseName = "swconf"
  path = "assets/js/data"
  isPlainText = true
  notAlternative = true

[outputFormats.manifest]
  mediaType = "application/manifest+json"
  baseName = "site"
  path = "assets/img/favicons"
  isPlainText = true
  notAlternative = true

[outputs]
  home = ["HTML", "feed", "search", "swconf", "manifest"]
```

The five home outputs are the upstream URLs: `/feed.xml` (Atom),
`/assets/js/data/search.json`, `/assets/js/data/swconf.js` (read by the service
worker) and `/assets/img/favicons/site.webmanifest`. Declaring only `search`
leaves the RSS icon pointing at a missing `/feed.xml` and the PWA inert, so the
theme documents them together.

`noClasses = false` is mandatory and easy to get wrong: Hugo's default is
`noClasses = true`, which inlines a Chroma colour scheme and overrides the
theme's syntax highlighting.

Everything else is optional.

---

## 12. SEO settings

The port reproduces `jekyll-seo-tag` 2.9.1 field by field
([`SEO.md`](SEO.md)); these are the keys it reads. All of them are optional and
have a default in `config/_default/params.toml`.

| Key | Default | Meaning |
|---|---|---|
| `params.logo` | `""` | image used by the JSON-LD `publisher` |
| `params.author` | `""` | author for pages that do not declare one; a key of `data/authors.yaml` or a name |
| `params.twitter_card` | `""` | default card; a page can override it with `twitter.card` |
| `params.facebook.admins` | `""` | `fb:admins` |
| `params.facebook.publisher` | `""` | `article:publisher` |
| `params.facebook.app_id` | `""` | `fb:app_id` |
| `params.google_site_verification` | `""` | legacy verification, used when `webmaster_verifications` has no value |

### 12.1 Beyond upstream (opt-in)

These are additions, not part of the Jekyll theme. All are off by default, so the
rendered HTML stays byte-identical to the original until a site enables one.

| Key | Default | Effect |
|---|---|---|
| `params.seo.noindex_hidden` | `false` | add `noindex` to posts with `hidden: true` (upstream still lets search engines index them) |
| `params.seo.feed_discovery` | `false` | `<link rel="alternate" type="application/atom+xml">` for readers and crawlers |
| `params.seo.breadcrumbs` | `false` | `BreadcrumbList` JSON-LD from the page hierarchy |
| `params.seo.description_max_chars` | `0` | hard cap for the meta description (0 keeps the gem's 100-word excerpt) |
| `params.seo.image_fallback` | `false` | use `social_preview_image` as the JSON-LD image when a page has none |
| `params.seo.article_meta` | `false` | `article:section`, `article:tag` and `article:author` |
| `params.seo.image_metadata` | `false` | `og:image:type`, plus width/height read from the image asset when Hugo can resolve it |
| `params.seo.sitemap_limit` | `50000` | warn when the sitemap grows past the protocol limit |
| `params.seo.max_image_preview` | `""` | `max-image-preview:large\|standard\|none`; Google Discover requires `large` for big thumbnails |
| `params.seo.image_sitemap` | `false` | add each post cover to the sitemap with the image extension |

`dir="rtl"` and `hreflang` need no switch: they only render when the site
declares a language direction or has translations, so a monolingual LTR site is
unaffected. The same applies to `og:locale:alternate`, which lists the other
translations of a page.

### 12.2 `llms.txt`

The theme ships `layouts/llms.txt` but Hugo only renders it when the home page
lists the format, so it costs nothing until a site opts in:

```toml
[outputs]
  home = ["HTML", "feed", "search", "swconf", "manifest", "llms"]
```

The output is the site title, the site description and a link list of posts
(hidden and `noindex` pages excluded). It is an emerging convention for AI
agents; Lighthouse 12 audits for it and treats its absence as not applicable.

Front matter keys the templates honour, with the same meaning as upstream:

```yaml
description: …            # meta description; cut to 100 words
excerpt: …                # fallback description (pages)
image: /cover.png         # or { path, alt, lqip, width, height, facebook, twitter }
media_subpath: /assets    # prefix for image paths
canonical_url: …          # overrides the canonical link
title_category: …         # appended to og:title / JSON-LD headline
locale: es-ES             # og:locale, `-` becomes `_`
twitter:
  card: summary           # overrides params.twitter_card
seo:
  type: CreativeWork      # JSON-LD @type
  name: …                 # JSON-LD name
  links: [ … ]            # JSON-LD sameAs
  date_modified: …        # overrides lastmod for article:modified_time
seo_description_max_words: 100
author: key               # or a map { name, url, twitter, type }
authors: [key, …]         # first entry is used
last_modified_at: …       # Jekyll name, accepted for migration
lastmod: …                # Hugo name
```

`lastmod` wins over `last_modified_at` when both are present, and
`seo.date_modified` wins over both.

---

## 13. Upgrade procedure

```bash
node scripts/check-config.mjs --upstream v7.6.0
```

The script:

1. greps upstream `_includes/` and `_layouts/` for `site.*` and `page.*` reads,
2. compares against the keys documented here,
3. prints new, removed and renamed keys,
4. exits non-zero in `--check` mode when documentation is out of date.
