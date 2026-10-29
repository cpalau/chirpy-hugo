# Jekyll oracle

The HTML reference. Every parity decision is measured against a real build of
`jekyll-theme-chirpy` **7.6.0**, built from this directory.

```bash
bash build.sh          # → <repo>/.out/oracle
```

## Why the theme comes from the gem

`site.theme` is interpolated into the stylesheet path, so the theme has to be
installed as a gem. More importantly, the published gem also ships the ten build
artifacts that upstream git-ignores (`_sass/vendors/_bootstrap.scss` and the nine
`assets/js/dist` bundles). Without them a production build emits no Bootstrap at
all. See `docs/COMPATIBILITY.md` D-10.

`jekyll-compress-html` is **not** a gem: it is the Liquid layout
`_layouts/compress.html` that ships inside the theme. Listing it in the Gemfile
breaks `bundle install`.

## Determinism

| Setting | Why |
|---|---|
| `JEKYLL_ENV=production` | only this branch of `assets/css/jekyll-theme-chirpy.scss` uses `main.bundle`, which includes the purged Bootstrap |
| `TZ=UTC`, `timezone: UTC` | dates are stable |
| `url: http://127.0.0.1:4001` | the Hugo build uses the same `baseURL`, so absolute URLs are comparable |
| `cdn: ""` | every asset is local; no network during build or screenshots |
| `pwa.cache.enabled: false` | `swconf.js` embeds `"now"` in `cacheName` (G-21); the cache-enabled variant is tested separately |
| no `compress_html` | D-05 is verified by G1, not by G4 |

## Layout

```
_config.yml          the reference configuration (Hugo twin: tests/fixtures/hugo/hugo.toml)
_data/               authors (neutral), contact, share, media
assets/img/          avatar, social preview and the fixture images
_posts/              the twelve fixtures + pinned, hidden and truncation posts
_tabs/               about, archives, categories, tags
index.html           layout: home
```

The fixture contract itself lives in `tests/fixtures/SPEC.md`.

## Things this directory proves

- `_posts/*` are the same 12 scenarios expressed in kramdown; the Hugo side
  expresses them with shortcodes and render hooks.
- Inline code carries `class="language-plaintext highlighter-rouge"` — the
  theme's SCSS keys its background off `code.highlighter-rouge`, so this is a
  visual requirement, not a detail. Hugo has no inline-code hook; the port adds
  the class with a documented `replaceRE`.
- Code blocks keep the Rouge gutter even for `console`, `terminal` and
  `plaintext`; the SCSS hides it with `div.language-console td:first-child`.
  The render hook must therefore emit the gutter, not omit it.
- Per-block `start_line` is broken upstream: `refactor-content` mangles the
  gutter. It is not used by any fixture (see `docs/AUDIT.md` G-38).
