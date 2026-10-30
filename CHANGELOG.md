# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release notes for each version are published on the GitHub Releases page and
follow the template in [`docs/RELEASING.md`](docs/RELEASING.md) §4.2.

## [Unreleased]

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
