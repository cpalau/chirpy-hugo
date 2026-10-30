# NOTICE

`chirpy-hugo` is a **Hugo port** of the Jekyll theme
[`cotes2020/jekyll-theme-chirpy`](https://github.com/cotes2020/jekyll-theme-chirpy),
created by Cotes Chung and contributors, licensed under the MIT License.

## Upstream

- Project: `cotes2020/jekyll-theme-chirpy`
- Pinned baseline: **v7.6.0** (2026-06-20)
- License: MIT — Copyright (c) 2019 Cotes Chung
- Upstream docs and demo: <https://chirpy.cotes.page/>

## What is copied verbatim from upstream

These directories are byte-for-byte copies of the upstream sources and
**must never be edited by hand**:

| This repo | Upstream |
|---|---|
| `assets/scss/` | `_sass/` |
| `assets/js/` | `_javascript/` + generated `assets/js/dist/` |
| `data/origin/` | `_data/origin/` |
| `i18n/` (generated) | `_data/locales/` |
| `static/assets/img/favicons/` | `assets/img/favicons/` |

Their purpose is to keep upstream CSS and JavaScript working without
modification, so that upstream bug fixes and features can be adopted by
copying files.

## Demo content

`exampleSite/` mirrors the upstream demo so that the port can be compared with
the original page by page:

- The four posts (`Text and Typography`, `Writing a New Post`, `Getting
  Started`, `Customize the Favicon`) and the About page come from the upstream
  repository and demo, MIT licensed, Copyright (c) 2019 Cotes Chung. Their
  prose is unchanged; only the authoring syntax was converted from kramdown
  attribute lists to Hugo shortcodes (`scripts/convert-content.mjs`).
- The images (`commons/`, `posts/20190808/`) are the demo's own assets, taken
  from the upstream demo and vendored so the site does not depend on a
  third-party CDN.
- The identity in `exampleSite/hugo.toml` and `exampleSite/data/authors.yml` is
  upstream's demo identity, kept for the same reason. It is not the theme's
  default: a new site starts from `starter/`, which is neutral.

## What is original work in this repository

- The Hugo template layer (`layouts/`).
- The shortcodes and render hooks (`layouts/_shortcodes/`, `layouts/_markup/`).
- The synchronization tooling (`scripts/`).
- The verification harness (`tests/`).
- The documentation (`docs/`).

## Trademark

"Chirpy" refers to the original Jekyll theme. This project is an independent
port and is not endorsed by the upstream author. The name is used
descriptively, with attribution, as permitted by the MIT License.
