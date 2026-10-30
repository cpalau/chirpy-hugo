# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release notes for each version are published on the GitHub Releases page and
follow the template in [`docs/RELEASING.md`](docs/RELEASING.md) §4.2.

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [1.5.1] - 2026-10-30

### Added

- **`params.footer.copyright`**: a site-owned footer line. `:author` becomes
  `params.social.name` (linked to the first social link) and `:year` the current
  year; empty keeps upstream's "© year author. Some rights reserved." The demo
  uses "Made with ❤️ by :author".

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [1.5.0] - 2026-10-30

### Added

- **Gate 10 (`npm run test:plugins`)**: the six Jekyll plugins and the local
  lastmod plugin validated module by module, with explicit exclusions. See
  [`docs/PLUGINS.md`](docs/PLUGINS.md).
- **The footer shows this theme's release version**, read from
  `data/theme.yaml` and linked to the matching GitHub release. It used to show
  `params.theme_version`, which is the upstream Chirpy version this port
  reproduces. `scripts/release.mjs --prepare` now bumps `package.json` and
  `data/theme.yaml` together, and `--check` enforces it.

### Changed

- Last modified is read from `.Lastmod` (front matter or `enableGitInfo`) in the
  SEO dates and in the page label, the same source the sitemap, the feed and the
  sidebar already used. The Jekyll plugin's git dates now reach every consumer.

### Deprecated

### Removed

### Fixed

- **`uri_escape` was too aggressive**: `urlquery` encodes the reserved set
  (`:/?=&+#@,;`, sub-delimiters and `%`) that Addressable leaves alone, so share
  links for titles containing `&`, `+` or `%` differed from Jekyll.
- **`xml_escape`**: added a partial that matches Ruby's entity names
  (`&quot;`, `&apos;`, not `&#34;`/`&#39;`) and used it where upstream does, the
  feed link title attribute.

### Security

## [1.4.0] - 2026-10-30

### Added

- **`max-image-preview:large`** (`params.seo.max_image_preview`). Google
  Discover lists it as the requirement for large thumbnails; it is merged with
  `noindex` into a single `robots` meta.
- **Image sitemap** (`params.seo.image_sitemap`): each post cover is listed with
  the Google image extension, which Google still recommends for discovery.
- **`llms.txt`**: an opt-in home output format with the site title, description
  and a link list of posts and pages, excluding hidden and `noindex` content.
  Lighthouse 12 audits for it.
- **`og:locale:alternate`** on translated pages, so each translation advertises
  the others.
- Gate 4c now covers the four additions: locale alternates, the combined
  `robots` meta, the image sitemap namespace and entries, and the content of
  `llms.txt`.

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [1.3.0] - 2026-10-30

### Added

- **SEO additions that upstream does not have**, all off by default so the
  rendered HTML stays byte-identical until a site opts in:
  - `hreflang` alternates and `x-default` for translated pages, and `dir="rtl"`
    from the language direction — silent on monolingual LTR sites;
  - `noindex` for posts marked `hidden: true` (`params.seo.noindex_hidden`) and
    per-page `noindex: true`;
  - feed autodiscovery (`params.seo.feed_discovery`);
  - `BreadcrumbList` structured data (`params.seo.breadcrumbs`);
  - a character cap for the meta description
    (`params.seo.description_max_chars`);
  - a JSON-LD image fallback to the social preview
    (`params.seo.image_fallback`);
  - `article:section`, `article:tag` and `article:author`
    (`params.seo.article_meta`);
  - `og:image:type` and width/height from the image asset
    (`params.seo.image_metadata`);
  - a warning when the sitemap passes the 50,000-URL protocol limit
    (`params.seo.sitemap_limit`).
- **Gate 4c (`npm run test:seo:ext`)**: a multilingual fixture (English,
  Spanish, Arabic RTL) with every switch on, asserting each feature and running
  the standards gate over the build.

### Changed

- `docs/SEO.md` documents the additions as "Beyond upstream", `CONFIG.md` lists
  the switches, `FEATURES.md` has a new section for them, and the README
  summarises them.

### Deprecated

### Removed

### Fixed

### Security

## [1.2.2] - 2026-10-30

### Added

- **SEO standards validation.** Gate 4b now checks the output against the
  specifications, not only against Jekyll: Open Graph required properties and
  `article:*` dates, Twitter card types, images and `@handle` format, and the
  JSON-LD type, required properties, property allowlist, dates, author,
  publisher logo, absolute URLs and headline length. It also runs on the
  deployed demo (`npm run test:seo:demo`), where the fixtures do not reach.

### Changed

- **D-24 is closed: the viewport meta is byte-identical to Jekyll.** The
  upstream value is emitted with `&#32;` for the spaces, which survives the HTML
  minifier that used to merge `user-scalable=no initial-scale=1` into an invalid
  value. Gate 4 now compares the attribute with no exemption. Blocking
  pinch-zoom is upstream's behaviour and is covered by the inherited
  accessibility debt in D-20.

### Deprecated

### Removed

### Fixed

### Security

## [1.2.1] - 2026-10-30

### Added

- The deployment gate rejects whitespace before punctuation after an inline
  `<code>` element, the signature of a shortcode template that ends with a
  newline.

### Changed

### Deprecated

### Removed

### Fixed

- **The `filepath` shortcode emitted a trailing newline**, which the browser
  renders as a space: `` `assets/img/favicons/` `` followed by a period became
  `assets/img/favicons/ .` in the body and in the meta description. Inline
  shortcodes must not end with a newline.
- The description of a post without `description` used `plainify`, which
  inserts a space where an inline tag was. It now strips tags like Jekyll's
  `strip_html` and unescapes the entities, so the text is byte-identical.

### Security

## [1.2.0] - 2026-10-30

### Added

- **The complete `jekyll-seo-tag` 2.9.1 surface.** Chirpy does not render SEO
  itself: it delegates to the gem. The port now covers every branch of it:
  - description from the excerpt (first block, rendered, stripped, 100 words
    with an ellipsis, `seo_description_max_words`);
  - `canonical_url`, `title_category`, `locale` (with `-` → `_`),
    `twitter.card`, `twitter:site`/`creator` with `@` normalisation and the
    author-name fallback;
  - image `path`/`facebook`/`twitter` fallbacks, `width`, `height`, `alt`,
    `lqip`;
  - author maps, `authors[0]`, the site-wide `author` fallback, `type` and
    `url`;
  - `seo.type/name/links/date_modified`, `sameAs`, `mainEntityOfPage`;
  - `logo` → JSON-LD `publisher`, `facebook.admins/publisher/app_id`, the
    legacy `google_site_verification`;
  - `last_modified_at` accepted alongside `lastmod`.
- **Gate 4b (`npm run test:seo`)**: compares every meta/link/JSON-LD field to
  the oracle with field-level messages, checks SEO invariants that equality
  cannot catch, and asserts the fixture knobs explicitly. 51 pages, ~2.4 k
  assertions.
- **Fixture 13 (`seo`)**: `seo-knobs`, `seo-excerpt` and `seo-images`, mirrored
  in Jekyll and Hugo, plus site-level SEO settings in the adoption matrix.
- `docs/SEO.md`: every field, its rule, the configuration map and the declared
  divergences.

### Changed

- The meta description is no longer Hugo's `.Summary`. Posts without a
  `description` now publish the same text as Jekyll: the first paragraph,
  rendered, stripped, cut to 100 words with `…`.
- Home pagination excludes `hidden` posts, as `jekyll-paginate` does. The page
  count used to be right only while the counts happened to round the same way.
- The demo ships `social_preview_image` and the author identities of the
  upstream demo, so its Open Graph and JSON-LD match.

### Fixed

- `og:locale` used the Hugo language key verbatim (`es-ES`); it now normalises
  to `es_ES` like the gem.
- `twitter:site`/`twitter:creator` produced `@@handle` for values that already
  started with `@`.
- A paginated home page was typed `WebSite` in JSON-LD; it is `WebPage`.
- `params.cdn` is honoured in `og:image`, `twitter:image` and JSON-LD.
- JSON-LD used an escaped string instead of an object when the page had an
  image with dimensions.

### Security


## [1.1.1] - 2026-10-30

### Added

- **`image` front matter accepts a string and a map.** Upstream allows both
  (`image: /path.png` and `image: { path, alt, lqip, no_bg }`); the port
  dereferenced `.path` unconditionally, so a string image failed the whole
  build. A new `_partials/image-data.html` normalises the value, and the JSON-LD
  now emits a URL for the string form exactly as `jekyll-seo-tag` does.
- **Provider and front-matter matrix in PR CI** (`--features-only`): six
  analytics providers, three comment providers, both image shapes and media on
  a CDN.

### Changed

- The visual capture waits for tocbot's scrollspy to settle after resizing the
  viewport; the active TOC entry used to change for a few frames and produced
  a one-off pixel diff in the right column.

### Fixed

- `params.cdn` was ignored: `media-url.html` read `$.Site` inside a partial
  called with a `dict`, where `$` is the dict, so the CDN branch never ran.
- A post or page with `image:` as a string crashed the build
  (`can't evaluate field path in type string`).
- JSON-LD omitted the image for the string form.

### Security


## [1.1.0] - 2026-10-30

### Added

- **A build warning for the settings Hugo does not inherit from a theme.**
  `_partials/check-config.html` probes block attributes, highlighting classes
  and the four home output formats, then prints the exact TOML block to add.
  Adoption now asserts the warning against an under-configured site (F1, D-07).
- **Umami, Matomo, Cloudflare and Fathom analytics providers.** `head.html`
  dispatched to `analytics/<provider>.html`; four of the six partials did not
  exist, so enabling any of them failed the build. All six are ported from
  upstream and covered by the adoption gate.
- **UI matrix (Gate 5b).** Four viewports (1280, 768, 390, 320) over the pages
  that carry every component: overflow, viewport parsing, script and network
  errors, sidebar, search, TOC popup, theme toggle and persistence, copy,
  back-to-top. 63 checks in ~16 s, and the same matrix on the deployment shape.
- **Provider matrix in the adoption gate.** Six analytics providers and the
  three comment providers are built and asserted, because both are dispatched
  from configuration.
- **Manifest invariants.** Every `manual` port must have an existing target;
  every partial a template names must exist, including the two configuration
  dispatched ones; every shipped configuration must declare the mandatory
  settings.

### Changed

- **Self-hosted vendor assets by default.** Fonts, icons, tocbot, search,
  dayjs, glightbox, clipboard and the polyfill are served from
  `static/assets/lib` (pinned and hash-verified); non-critical CSS loads
  asynchronously and the LCP image and body font are preloaded (D-22). Mobile
  home: 66 → 92–97 performance, LCP 6.3 s → 2.1–3.0 s.
- **Service worker update policy (D-23).** New workers skip waiting and claim
  the page; navigation is network-first; a visitor is reloaded only when a cache
  from an older build existed.
- **Viewport meta uses commas between directives (D-24)** and no longer blocks
  pinch-zoom: `user-scalable=no` is an accessibility violation and costs nothing
  visually.
- **Faster suites.** Visual capture runs its viewports concurrently (6 workers,
  84 pairs in ~33 s); `npm run test:fast` chains the everyday checks in ~19 s.
- Documentation pass: `COMPATIBILITY.md` statuses now use one vocabulary,
  `PLAN.md` is complete, `FEATURES.md` counts and C18/C31 match the shipped
  vendor bundle, and `TESTING.md` describes Gates 8 and 9 as implemented.

### Fixed

- Enabling Umami, Matomo, Cloudflare or Fathom analytics crashed the build
  (`partial "analytics/…" not found`).
- A minified `user-scalable=no initial-scale=1` viewport made phones rescale the
  page when the off-canvas sidebar opened.
- `app.min.js` registered a service worker with `register=false` (any non-empty
  value is true), which could reload a cached page in a loop.
- Subdirectory deployments, empty taxonomies, doubled base paths and the
  breadcrumb base segment (found by the deployment gate).
- `ports.yml` pointed eight hand-written ports at files that never existed,
  including `layouts/index.json`, `layouts/swconf.js` and `layouts/rss.xml`.

### Security

- No known vulnerabilities. The PWA no longer registers a worker when the cache
  is disabled.

## [1.0.0] - 2026-10-30

### Added

- The Hugo template layer, ported from `jekyll-theme-chirpy` v7.6.0: base
  chrome, home and listings, post and page, render hooks, shortcodes, comments,
  analytics, pageviews, PWA and search.
- A verification harness with a real Jekyll build as the reference: twelve
  fixtures, Gate 4 (DOM) and Gate 5 (pixels), plus build integrity, HTML
  validity, DOM contract, interaction, accessibility, i18n, upstream drift and
  adoption gates.
- All 33 upstream locales, normalised against English so every locale has the
  same key tree.
- `exampleSite/`, a working `starter/`, gallery images captured from the demo,
  and GitHub Actions for PRs, a nightly full matrix and a weekly upstream watch.
- Atom feed, sitemap, search index, service-worker configuration and PWA
  manifest as Hugo output formats.
- Migration and maintenance tooling: `i18n.mjs`, `check-config.mjs`,
  `convert-content.mjs`, `sync-upstream.mjs --apply/--check`, `release.mjs`.

### Changed

- The theme is installable as a Hugo Module (`go.mod`) with an explicit minimum
  version, and every parameter has a default.
- `assets/img/favicons/` moved to `static/`, because Hugo never publishes
  `assets/` and the icons were 404s on a real site.

### Deprecated

### Removed

### Fixed

- Theme defaults were nested under `params.params.*`, so no default applied to
  a site that did not declare the key itself.
- Client-side search fetched `/assets/js/data/search.json` while the theme
  published `/search.json`.
- The service worker imported a `swconf.js` that did not exist, and the PWA
  manifest was served as raw Liquid instead of JSON.
- A subdirectory `baseURL` lost the base path on the stylesheet, the icons and
  every taxonomy link: Hugo's `relURL`/`absURL` ignore the base path when the
  input starts with a slash.
- Read-time counts included the `$$` delimiters of display math, footnote ids
  did not use the author's labels, and the mermaid fallback missed its trailing
  newline.
- Taxonomy index metadata and JSON-LD types now follow `page.date`, as
  `jekyll-seo-tag` does.

### Security

<!--
  Keep this section complete. Rules:
  - One entry per user-visible change, written for a user.
  - Reference the issue or PR.
  - No "various fixes" or "improvements".
  - docs/ci/test-only changes may omit the entry.
-->
