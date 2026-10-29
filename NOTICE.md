# NOTICE

`chirpy-hugo` is a **Hugo port** of the Jekyll theme
[`cotes2020/jekyll-theme-chirpy`](https://github.com/cotes2020/jekyll-theme-chirpy),
created by Cotes Chung and contributors, licensed under the MIT License.

## Upstream

- Project: `cotes2020/jekyll-theme-chirpy`
- Pinned baseline: **v7.6.0** (2026-06-20)
- License: MIT — Copyright (c) 2019 Cotes Chung
- Upstream docs: <https://chirpy.cotes.page/>

## What is copied verbatim from upstream

These directories are byte-for-byte copies of the upstream sources and
**must never be edited by hand**:

| This repo | Upstream |
|---|---|
| `assets/scss/` | `_sass/` |
| `assets/js/` | `_javascript/` + generated `assets/js/dist/` |
| `data/origin/` | `_data/origin/` |
| `i18n/` (generated) | `_data/locales/` |
| `assets/img/favicons/` | `assets/img/favicons/` |

Their purpose is to keep upstream CSS and JavaScript working without
modification, so that upstream bug fixes and features can be adopted by
copying files.

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
