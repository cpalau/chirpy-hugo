# chirpy-hugo

A Hugo port of [**Chirpy**](https://github.com/cotes2020/jekyll-theme-chirpy),
the minimal, responsive and feature-rich Jekyll theme for technical writing.

The goal is not "inspired by Chirpy". The goal is **parity**: the same content
must produce the same HTML — and therefore the same pixels — while upstream
SCSS, JavaScript and assets stay byte-for-byte identical, so upstream releases
can be adopted in hours instead of weeks.

> **Status: alpha.** The template layer, the outputs and the verification
> harness are complete: **47/47** pages are identical to a real Jekyll build
> after canonicalization, **84/84** visual pairs are pixel-identical outside the
> three declared boxes (`docs/COMPATIBILITY.md`), and Gates 1–9 run in CI.
> What remains for `v1.0.0` is the Lighthouse budget, the cross-browser spot
> check and the final documentation pass: [`docs/PLAN.md`](docs/PLAN.md).

---

## Principles

1. **Assets are read-only.** `assets/scss/`, `assets/js/`, `data/origin/` and
   `static/assets/img/favicons/` are copies of upstream. `i18n/` is generated
   from the upstream locales by `scripts/i18n.mjs`. None of them is edited by
   hand.
2. **The DOM is a contract.** Class names, ids, `data-*` attributes and nesting
   match Jekyll output, so upstream JavaScript keeps working untouched.
3. **Parity is measured.** A template is done when a real Jekyll build of the
   same content produces the same DOM and the same pixels.
4. **Hugo conventions, strictly.** Idiomatic Hugo code that renders
   upstream-identical HTML.

Read [`AGENTS.md`](AGENTS.md) before contributing — it contains the hard rules.

---

## Requirements

| Tool | Version |
|---|---|
| Hugo | extended ≥ 0.150 (tested with 0.168.0) |
| Node.js | ≥ 20 (tested with 24) |
| Go | ≥ 1.21 (for Hugo Modules) |
| Ruby + Bundler | only for the Jekyll oracle in the test suite |

---

## Documentation

| Document | Purpose |
|---|---|
| [docs/AUDIT.md](docs/AUDIT.md) | File-by-file audit of upstream v7.6.0 — source of truth |
| [docs/PLAN.md](docs/PLAN.md) | Master plan, phases F0–F9, Definition of Done |
| [docs/FEATURES.md](docs/FEATURES.md) | Complete upstream feature inventory and Hugo mapping |
| [docs/TESTING.md](docs/TESTING.md) | Nine verification gates, Jekyll oracle, Playwright |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | Declared divergences (D-01…) |
| [docs/CONFIG.md](docs/CONFIG.md) | Configuration contract |
| [docs/UPSTREAM.md](docs/UPSTREAM.md) | Synchronization with the Jekyll original |
| [docs/SHORTCODES.md](docs/SHORTCODES.md) | Authoring syntax and kramdown conversion |
| [docs/I18N.md](docs/I18N.md) | Internationalization contract (33 locales) |
| [docs/RELEASING.md](docs/RELEASING.md) | Conventional Commits, changelog and release notes |

> This is a generic, reusable theme. Site-specific migration work and personal
> content are documented outside this repository.

---

## For users

`chirpy-hugo` is meant to be installed, not copied. It works as a Hugo Module,
as a git submodule, or as a local theme, and it must build any site — including
`gohugoio/HugoBasicExample` — with the documented minimum configuration.

```bash
hugo new site my-blog
cd my-blog
hugo mod init example.com/my-blog
hugo mod get github.com/cpalau/chirpy-hugo
```

Then import the theme and copy the mandatory settings from
[`starter/hugo.toml`](starter/hugo.toml):

```toml
[module]
  [[module.imports]]
    path = "github.com/cpalau/chirpy-hugo"
```

Those settings (`outputs`, `outputFormats`, `markup`) are the ones Hugo does not
merge from a theme (D-07). Everything else is optional and has a default.

A complete, minimal site lives in [`starter/`](starter/): config, one post and
the site-owned data files.

The theme ships:

- `theme.toml` metadata for the Hugo theme gallery,
- `exampleSite/` as a self-contained demo,
- `archetypes/` for `hugo new`,
- all 33 locales,
- every `params` default (Hugo deep-merges `params`, so you only override what
  you need).

---

## Repository layout

```
theme.toml          theme metadata for the Hugo gallery
go.mod              Hugo Module definition
config/_default/    theme configuration (merged into the user's config)
archetypes/         content templates for `hugo new`
images/             screenshot.png + tn.png for the theme gallery
exampleSite/        self-contained demo site

layouts/            Hugo templates (the only original rendering code)
├── _partials/      fragments, mirroring upstream include names
├── _shortcodes/    prompt, filepath, embeds
└── _markup/        render hooks (codeblock, image, heading, link, table)

assets/scss/        COPY of upstream _sass/                  DO NOT EDIT
assets/js/          COPY of upstream _javascript/            DO NOT EDIT
data/origin/        COPY of upstream _data/origin             DO NOT EDIT
static/assets/...   COPY of upstream images and favicons     DO NOT EDIT
i18n/               GENERATED from _data/locales (i18n.mjs)   DO NOT EDIT

config/_default/    configuration contract
scripts/            sync, i18n, content conversion, config checks
tests/              oracle, fixtures, parity, visual, contract, a11y, i18n, adoption
docs/               the plan and the contracts
starter/            minimal site template for end users
```

---

## Verification

```bash
npm run build          # hugo --panicOnWarning --gc --minify
npm run build:example  # the demo site, warning-free
npm run test:qa        # Q1-Q4 contract tests
npm run test:i18n      # 33 locales, identical key trees
npm run test:upstream  # pin, coverage and asset hashes
npm run test:parity    # Jekyll build vs Hugo build, DOM diff
npm run test:visual    # Playwright pixel comparison (build both sides first)
```

Gates 1-3, 6-7 and 9 are still being implemented; `docs/PLAN.md` tracks them.

The test suite builds the **real Jekyll theme** locally and compares both
outputs. That is the definition of "pixel perfect" used by this project.

---

## License

MIT. The original copyright notice is preserved in [`LICENSE`](LICENSE), and
attribution details are in [`NOTICE.md`](NOTICE.md).

Chirpy is created by Cotes Chung and contributors. This is an independent port,
not endorsed by the upstream author.
