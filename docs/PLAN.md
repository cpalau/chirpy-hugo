# Master Plan

| | |
|---|---|
| Project | `chirpy-hugo` — Hugo port of `cotes2020/jekyll-theme-chirpy` |
| Upstream baseline | **v7.6.0** (2026-06-20) |
| Module | `github.com/cpalau/chirpy-hugo` |
| Starter | `github.com/cpalau/chirpy-hugo-starter` |
| License | MIT (original copyright preserved) |
| Total estimate | ~30 working days |
| Status | F0–F7 and F9 tooling complete; F8 docs/perf/cross-browser open |

Related documents:

- [FEATURES.md](FEATURES.md) — complete feature inventory
- [TESTING.md](TESTING.md) — verification gates
- [COMPATIBILITY.md](COMPATIBILITY.md) — declared divergences
- [CONFIG.md](CONFIG.md) — configuration contract
- [UPSTREAM.md](UPSTREAM.md) — sync procedure
- [SHORTCODES.md](SHORTCODES.md) — shortcode reference
- [I18N.md](I18N.md) — internationalization contract
- [AUDIT.md](AUDIT.md) — file-by-file audit of upstream v7.6.0 (source of truth)

> Site-specific migration work is **not** part of this repository. This repo is
> public and generic; adopter-specific content is documented outside Git.

---

## 1. Decision log

| # | Decision | Value |
|---|---|---|
| D1 | Authoring syntax | Native Hugo shortcodes. kramdown IAL converted once, never emulated. |
| D2 | Search | Upstream search as theme default; Pagefind optional in the starter. |
| D3 | Visibility | Public repository from day one, MIT + attribution. |
| D4 | Scope | Theme and verification harness together. Adopter-specific site migration is out of scope and lives outside this repository. |
| D5 | Starting point | From scratch. The existing `geekifan` port is not used. |
| D6 | Verification | Jekyll (Ruby) as HTML oracle + Playwright pixel comparison. Both mandatory. |
| D7 | i18n | All 33 upstream locales are in scope from day one, not a later addition. |

---

## 2. Vision

A Hugo theme that renders **the same HTML, and therefore the same pixels**, as
Chirpy for the same content, while keeping upstream SCSS, JavaScript and image
assets byte-for-byte identical. Upstream releases must cost hours, not days.

### Core principle: a contract renderer

> Only the template layer is reimplemented. Everything else is copied from
> upstream. The emitted HTML must be equivalent to Jekyll's.

Consequences:

- Upstream JS works unmodified → `_javascript/` sync is trivial.
- Upstream SCSS works unmodified → `_sass/` sync is trivial.
- A release reduces to: asset diff (copy) + template diff (port).

All safety rules derived from this principle are in
[`AGENTS.md`](../AGENTS.md) §2.

---

## 3. Definition of Done — v1.0

1. Zero DOM diffs in the parity harness for all 12 fixtures, after canonicalization.
2. **Zero** visual diffs across `12 fixtures × 3 viewports × 2 themes`: not a
   percentage budget, a page is correct when no pixel differs. The only
   exceptions are the three declared rectangles of R3b in `AGENTS.md`.
3. `hugo --panicOnWarning --gc --minify` emits no warnings.
4. 100 % of the inventory in `FEATURES.md` is ✅ parity or 🟡 declared divergence.
5. All 33 locales have 100 % key coverage against `en`.
6. `html-validate` and `html-proofer` green, including internal anchors.
7. Axe: no `serious`/`critical`. Lighthouse ≥ 95 in all four categories.
8. `scripts/sync-upstream` runs end-to-end against `v7.6.0` with no undocumented step.
9. `starter/` produces a working site in under 5 minutes.
10. Every copied asset hash matches upstream.
11. Adoption gate green: `HugoBasicExample` and a fresh site with only the
    documented minimum configuration build with no warnings.

### Out of scope for v1.0

- Migrating any specific site. That work is adopter-specific, is documented
  outside this repository, and does not affect the theme contract.
- Content embedding Liquid tags.
- Emulating kramdown IAL at build time.

---

## 4. Upstream anatomy

| Area | Files | Notes |
|---|---|---|
| `_layouts/` | 10 | default, home, post, page, archives, categories, category, tag, tags, compress |
| `_includes/` | 45 | 6 analytics, 3 comments, 6 embeds, 30 structural |
| `_javascript/` | **27** | 9 Rollup entry points + 18 modules |
| `_sass/` | 30 | abstracts, base, components, layout, pages, themes |
| `_data/locales/` | 33 | one YAML per language |
| `_data/` | 39 | authors, contact, share, media, 2 origin files, 33 locales |

Jekyll plugin surface that must be replaced: `jekyll-paginate`,
`jekyll-seo-tag`, `jekyll-archives`, `jekyll-sitemap`, `jekyll-include-cache`,
`jekyll-redirect-from`, `jekyll-relative-links`, `jekyll-avatar`,
kramdown + Rouge, `jekyll-compress-html`.

Upstream does **not** use `jekyll-feed`: the Atom feed is a hand-written
template (`assets/feed.xml`). It does not use SRI either.

Build artifacts (`_sass/vendors/`, `assets/js/dist/`) are **git-ignored
upstream** and must be committed here (D-10). They do not have to be rebuilt:
the published gem ships both, byte-identical to what real sites serve, so they
are copied and hash-verified instead.

Mapping for each one is in [FEATURES.md](FEATURES.md) §4.1 and §4.13, with the
full evidence in [AUDIT.md](AUDIT.md).

---

## 5. The decisive finding: kramdown IAL

Upstream content relies on kramdown attribute lists:

```markdown
> **Tip**: something
{: .prompt-tip }

Create `_config.yml`{: .filepath }

```shell
command
```
{: .nolineno }

![img](/x.png){: .left }
```

Classes in use: `prompt-tip|info|warning|danger`, `filepath`, `nolineno`,
`light`, `dark`, `left`, `right`, `shadow`, `normal`.

**Goldmark has no IAL.** Block attribute lists exist in Hugo but are written
*before* the block; inline IAL does not exist at all.

| Mechanism | Hugo status | Solution |
|---|---|---|
| Block IAL (`nolineno`, `file=`) | Partial (`parser.attribute.block`) | Converter reorders; shortcode as alternative |
| Inline IAL (`code{: .filepath}`) | None | Explicit HTML or shortcode |
| Prompts | None | `{{< prompt tip >}}` shortcode |
| Image classes | None | Render hook with explicit attribute |

Plan: canonical shortcodes plus a one-shot, idempotent, dry-runnable
`scripts/convert-content.mjs`. Recorded as **D-01**.

---

## 6. Phases

Total ≈ 30 working days. Detailed tasks and acceptance criteria per phase below.

```
F0 (2d) → F0.5 (1d, GATE) → F1 (3d) → F2 (4d) → F3 (3d) → F4 (4d)
        → F5 (3d) → F6 (2d) → F7 (4d) → F8 (3d) → F9 (2d)
```

Gate 4 (HTML parity) and Gate 5 (visual parity) are created in F0.5 and
extended in F7. They are never deferred, because F8 depends on them.

---

### F0 — Specification and conformance corpus (2 d)

- [x] Audit upstream v7.6.0 file by file — see [AUDIT.md](AUDIT.md).
- [x] Pin upstream tag `v7.6.0` and commit sha in `tests/contract/ports.yml`
      (`152093879e6319dac342454d8df75a3c3572315f`, plus the gem as the source
      of the ten generated artifacts — D-10).
- [x] Inventory all 10 `_layouts/` files: purpose and Hugo target.
- [x] Inventory all 45 `_includes/` files: classify `copy` / `transform` / `manual`.
- [x] Inventory 27 JS files (9 entry points + 18 modules) and 30 SCSS partials; confirm all are `copy`.
- [x] Extract every parameter read by upstream templates →
      `tests/contract/params.json` (69 `site.*`, 32 `page.*`) and
      `scripts/extract-params.mjs --check` against `CONFIG.md`.
- [x] Write the 12 fixture specifications (`tests/fixtures/SPEC.md`).
- [x] Create `tests/oracle/` with `Gemfile` pinning `jekyll-theme-chirpy = 7.6.0`.
- [x] Create the 12 fixtures in Jekyll syntax and in Hugo syntax.
- [x] Verify all 12 fixtures build under Jekyll with no Liquid errors.
- [x] Draft `COMPATIBILITY.md` with D-01…D-11 (D-11 closed, D-12 added).
- [x] Answer audit questions Q1–Q4 (`AUDIT.md` §9.1) with a test each
      (`tests/qa/`; Q5–Q8 belong to F1, F0.5 and F6).
- [x] Gate: any fixture that cannot exist in both worlds is resolved here.

**Acceptance**: oracle builds; `ports.yml` covers 100 % of upstream templates;
fixtures documented.

Three findings changed the plan during F0: the gem ships the generated
artifacts (D-10 becomes a copy, not a build), inline code needs a class the SCSS
depends on (G-39), and `sort_natural` is reproducible after all (D-11 closed).

| # | Fixture | Covers |
|---|---|---|
| 1 | `post/full` | image, LQIP, TOC, lastmod, related, nav, edit link, pageviews |
| 2 | `post/code` | code blocks, line numbers, `nolineno`, `filepath`, many languages |
| 3 | `post/prompts` | all four prompt types |
| 4 | `post/math` | MathJax inline and block |
| 5 | `post/mermaid` | diagram |
| 6 | `post/embeds` | YouTube, Spotify, Bilibili, Twitch, audio, video |
| 7 | `post/images` | light/dark, left/right, shadow, normal, popup |
| 8 | `post/i18n-es` | accents, ñ, punctuation in headings (D-04) |
| 9 | `post/tables-footnotes` | tables, footnotes, internal/external links |
| 10 | `home/pinned` | pinned posts, pagination, long summaries (D-03) |
| 11 | `listing` | archives, hierarchical categories, tags, trending tags |
| 12 | `system` | search, PWA assets, RSS, 404, sitemap |

---

### F0.5 — Proof of concept (1 d) — decision gate

- [x] Port `baseof.html`, `head.html`, `seo.html`.
- [x] Port `home.html` and the post layout (plus the whole chrome, listings and
      render hooks: the fixtures cannot render without them).
- [x] Implement `render-codeblock.html` with Rouge-compatible markup (D-02).
- [x] Implement the parse5 canonicalizer (Gate 4).
- [x] Run Gate 4 on fixtures 1, 2 and the home page: 47 pages measured.
- [x] Run Gate 5 (Playwright): 84/84 pairs pixel-identical outside the three
      declared boxes, stable across consecutive runs.
- [x] Write the measured diff inventory: [`POC.md`](POC.md).
- [x] Go/No-Go review against `COMPATIBILITY.md`: **GO**, with D-02 rewritten,
      D-13 and D-14 added.

**Acceptance**: measured diff report, confirmed divergence list, decision.

Outcome: the architecture holds. All 47 pages are structurally identical after
canonicalization, and all 84 visual pairs are pixel-identical outside the three
declared rectangles. The four causes measured during F0.5 (token colours,
pagination URL, listing-page metadata, read-time base) are fixed or declared:
D-15 and D-16 are closed, D-02/D-09/D-18 are the measured boxes.

---

### F1 — Scaffolding (3 d) — done (one item moved to F9)

- [x] `LICENSE`, `NOTICE.md`, `README.md`, `AGENTS.md`, `theme.toml`.
- [x] Canonical theme skeleton: `archetypes/`, `content/`, `static/`, `images/`.
- [x] `go.mod` (module `github.com/cpalau/chirpy-hugo`) and
      `config/_default/{module,menus}.toml`.
- [x] `config/_default/params.toml` with **all defaults** (Hugo deep-merges
      `params`, so users never copy them).
- [x] Document the mandatory non-merging settings (`markup`, `outputs`) — see
      `docs/CONFIG.md` and `config/_default/{markup,hugo}.toml`.
- [ ] The build warning that prints the exact snippet when a mandatory setting
      is missing (belongs to `check-config.mjs`, F9).
- [x] `exampleSite/` self-contained demo with neutral content.
- [x] `images/screenshot.png` (1500×1000) and `images/tn.png` (900×600),
      captured from the demo by `scripts/screenshot.mjs`.
- [x] `scripts/sync-upstream.mjs` v1: `copy` and `transform`, hash verification.
- [x] Copy `_sass/` → `assets/scss/`, `_javascript/` → `assets/js/`, `_data/origin/` → `data/origin/`.
- [x] Commit `assets/js/dist/*.min.js` (9 bundles) and
      `assets/scss/vendors/_bootstrap.scss`, copied verbatim from the published
      gem and verified by sha256 (D-10).
- [x] ~~Generate the SCSS entry at build time~~ — superseded by D-13: the CSS is
      precompiled with dart-sass by `scripts/build-css.sh` and committed.
- [x] `scripts/i18n.mjs`: 33 locales normalised against `en`, so every locale
      has the same key tree (`--apply` / `--check`, wired as `test:i18n`).
- [x] ~~`package.json`: lint and verification toolchain (eslint, stylelint,
      rollup, purgecss)~~ — superseded by D-10: the assets are copies verified
      by sha256 (Gate 8), never rebuilt, so linting them would only check
      upstream's code.
- [x] `commitlint.config.js` + husky `commit-msg` hook; the whole history
      passes `commitlint`.
- [x] `CHANGELOG.md` (Keep a Changelog) and the PR rule that every change adds an entry.
- [x] CI `ci.yml`: pin, i18n, QA, warning-free demo build, adoption smoke test
      and Gate 4 against the Jekyll oracle.
- [x] Smoke build of an empty starter site (also enforced by CI).

**Acceptance**: empty site builds warning-free; asset hashes match upstream;
i18n key parity green.

---

### F2 — Base layer (4 d) — done except multilingual

- [x] `baseof.html`: document shell, `lang`, `dir`, `origin-type`.
- [x] `head.html`: charset, theme-color, viewport, title composition, metadata hook.
- [x] `seo.html`: description, canonical, OG, Twitter, JSON-LD, `fediverse:creator`, verifications.
- [x] `favicons.html` with the v7.4 favicon set.
- [x] `sidebar.html`: avatar, name, bio, contacts, theme toggle.
- [x] `topbar.html`: breadcrumb logic.
- [x] `footer.html`: copyright, license, meta string.
- [x] `datetime.html`, `media-url.html`.
- [ ] `language-alias.html`, `language-selector.html` (multilingual; F9).
- [x] `js-selector.html`: conditional script loading, self-host vs CDN (no SRI), jsDelivr combine.
- [x] `404.html`.
- [x] Contract selectors for sidebar/topbar/footer.
- [x] Gate 4 green for fixture 12.

**Acceptance**: chrome and SEO pixel-identical; JSON-LD validated.

Measured: every chrome page is byte-identical after canonicalization, and the
JSON-LD type is now derived from the page date exactly like `jekyll-seo-tag`
(D-15).

---

### F3 — Home and listings (3 d) — done

- [x] `home.html`: pinned first, then paginated.
- [x] `post-summary.html` replicating `markdownify | strip_html | truncate: 200` (D-03).
- [x] `post-paginator.html`.
- [x] `section.html` and archives grouped by year.
- [x] `update-list.html`.
- [x] `taxonomy.html` for categories and tags.
- [x] `term.html` with hierarchical category support.
- [x] `trending-tags.html`.
- [x] Gate 4 green for fixtures 10 and 11.

**Acceptance**: ordering, grouping, counts and summary text match byte-for-byte.

---

### F4 — Post and page (4 d) — done

- [x] `page.html` header: title, date, author, read time, lastmod.
- [x] `toc.html` and TOC enablement logic.
- [x] `post-nav.html`, `related-posts.html` (custom score), `post-sharing.html`.
- [x] `post-edit.html`, `read-time.html`, license notice.
- [x] `pageviews/goatcounter.html`.
- [x] Comments: disqus, utterances, giscus (with theme sync).
- [x] Embeds as shortcodes.
- [x] Contract selectors for the post page.
- [x] Gate 4 green for fixtures 1, 6, 9.

**Acceptance**: post page pixel-identical; comments follow the theme.

The read-time count now consumes the transformed content, which is what Jekyll
counts: `$$…$$` delimiters no longer add a phantom word.

---

### F5 — Render hooks and shortcodes (3 d) — done

- [x] `render-codeblock.html`: Rouge-compatible DOM, line numbers, `start_line`.
- [x] No line numbers for `plaintext`, `console`, `terminal`.
- [x] `nolineno` and `file=` support.
- [x] `render-image.html`: LQIP, light/dark, left/right, shadow, normal, `media_subpath`, `cdn`.
- [x] `render-heading.html`: anchors, `data-toc-skip`, ids (D-04).
- [x] Links and tables: no hook exists for either, so `_partials/content.html`
      reproduces `refactor-content.html` (documented replace rules, AGENTS §5.1).
- [x] `{{< prompt >}}` (4 types) and `{{< filepath >}}`.
- [x] MathJax and Mermaid wiring.
- [x] Gate 4 green for fixtures 2, 3, 4, 5, 7, 8.

**Acceptance**: highlighting DOM identical to Rouge for every fixture language;
accented heading ids identical.

---

### F6 — Special outputs (2 d) — done

- [x] `search.json` with the exact upstream schema, published at the path the
      search loader fetches (`/assets/js/data/search.json`).
- [x] `sw.min.js` and `swconf.js` output formats with cache list and `deny_paths`.
- [x] Manifest and installability. The upstream manifest is a Liquid asset, so
      the static copy would ship invalid JSON; it is now an output format.
- [x] Atom feed matching `assets/feed.xml` (5 posts, 400-character summary,
      upstream's `&` escaping); the generator credits Hugo (D-19).
- [x] `sitemap.xml` with the same URL set as Jekyll's, including pagination and
      excluding the section listing Hugo adds (D-19).
- [x] Subdirectory `baseURL`: every theme-generated URL now goes through
      `relURL`/`absURL` without a leading slash. Leading slashes make Hugo drop
      the base path, which broke the CSS, the icons and every taxonomy link.
- [x] Gate 4 green for fixture 12; `npm run test:outputs` covers the rest.

**Acceptance**: search returns identical results in Playwright; PWA installable;
feed valid.

---

### F7 — Verification harness completion (4 d) — gates implemented

- [x] Gate 1: build integrity — file set vs the oracle, required outputs, no
      Liquid residue, no empty files (`tests/build/check.mjs`).
- [x] Gate 2: `html-validate` compared with Jekyll per rule, plus a link and
      anchor checker (`tests/html/check.mjs`). Upstream markup is not
      spec-perfect, so the gate forbids *new* violations, not inherited ones.
- [x] Gate 3: DOM contract — the selectors upstream JavaScript needs, checked
      on the rendered pages (`tests/contract/selectors.mjs`).
- [x] Gate 4: canonicalizer, DOM diff, snapshot policy.
- [x] Gate 5: Playwright projects, determinism, route blocking, masking.
- [x] Gate 5: interaction suite (toc, search, theme, copy) —
      `tests/interactive/check.mjs`.
- [x] Gate 6: axe-core over six pages. A violation that exists in the Jekyll
      build too is reported as inherited (D-20); a new serious or critical one
      fails. Lighthouse budgets are still pending (F9).
- [x] Gate 7: i18n coverage (`npm run test:i18n`).
- [x] Gate 8: upstream drift and asset hashes (`fetch-upstream.mjs --check`).
- [x] Gate 9: adoption — fresh site, subdirectory `baseURL` and
      `HugoBasicExample` (`tests/adoption/check.mjs`).
- [x] `visual.yml` nightly and `upstream-watch.yml` weekly workflows.
- [ ] PR CI under 12 minutes (measure once the first run lands).

**Acceptance**: `npm run test:all` green; gates documented.

The gates are separate commands (`test:build`, `test:html`, `test:contract`,
`test:parity`, `test:outputs`, `test:visual`, `test:interactive`, `test:a11y`,
`test:i18n`, `test:upstream`, `test:adoption`) so a contributor can run the one
that covers their change; `ci.yml` runs the browser-free set and `visual.yml`
runs everything nightly.

---

### F8 — Convergence to zero diff (3 d) — parity reached

- [x] Iterate Gates 4 and 5 until zero diffs on all 12 fixtures.
- [x] Fix or formally declare every remaining difference.
- [ ] Finalize `COMPATIBILITY.md` (D-15 and D-16 closed; the `D-XX` template at
      the end of the file is still a template).
- [x] Performance budget check (`npm run test:perf`): desktop absolute,
      mobile comparative. D-21 records the inherited mobile ceiling.
- [x] Cross-browser spot check (Firefox, WebKit):
      `npm run test:browsers` loads the home page and a post in both engines,
      asserts the chrome is visible and the stylesheet applied, and writes a
      screenshot. WebKit needs its system libraries; CI installs them and runs
      in strict mode, a local host without them skips it.

**Acceptance**: DoD items 1–3, 5–7.

---

### F9 — Tooling, starter and docs (2 d) — tooling done

- [x] `sync-upstream.mjs` v2: report by mode (copy / manual / transform /
      retired), `--apply`, `--check`, and no writes without `--apply`.
- [x] `check-config.mjs`: every `params.*` a template reads has a default and is
      documented; the mandatory non-merging settings are declared. It found
      that `params.toml` nested everything under `params.params.*`, so no theme
      default was actually applied.
- [x] `convert-content.mjs`: IAL → shortcodes, `--dry-run`, `--write`,
      idempotent, and it reports what it cannot convert instead of guessing.
- [x] `starter/`: config with the mandatory sections, one post, the tab pages
      and the site-owned data. A Pagefind option is not shipped; the upstream
      search is the default.
- [x] `exampleSite/` finalized as living documentation.
- [x] Gallery assets captured from the demo (`scripts/screenshot.mjs`) and
      `theme.toml` verified.
- [x] Consumer README: module, submodule and local installation.
- [x] `scripts/release.mjs`: `--check`, `--notes`, `--prepare`.
- [ ] Release notes template and checklist exercised on a real tag. It waits on
      the two DoD items that are still open: Lighthouse budgets and the
      cross-browser spot check.
- [ ] Documentation complete and accurate (final pass).
- [ ] Tag `v1.0.0`.

**Acceptance**: DoD items 4, 8, 9.

---

## 7. Risks

| Risk | Prob. | Impact | Mitigation |
|---|---|---|---|
| D-02 (Rouge/Chroma) never reaches parity | Medium | High | F0.5 measures it in one day; fallback documented |
| D-04 heading ids break deep links | Medium | Medium | Accented fixture + anchor tests |
| Port rots after two releases | Medium | High | Gates 3 and 8 plus weekly watch |
| Visual CI slow or flaky | High | Low | Reduced PR matrix, nightly full, blocked external requests |
| Config not inherited (D-07) | High | Medium | `check-config` plus starter as source of truth |
| Upstream license change | Very low | High | MIT is irrevocable for published code; sha pinned |
| Bus factor | High | High | `AGENTS.md`, `UPSTREAM.md`, tests as living documentation |
| Screenshot drift across machines | Medium | Medium | Pinned container, fixed fonts and browser |

---

## 8. Environment (verified)

| Requirement | Status |
|---|---|
| Hugo extended | ✅ v0.168.0+extended |
| Node / npm | ✅ v24.22.1 / 11.19.1 |
| Go | ✅ 1.27.2 |
| Ruby / bundler (Jekyll oracle) | ✅ 3.4.10 / 4.0.3 |
| Python | ✅ 3.12.13 |
| Containers | ✅ podman 6.1.4 |
| GitHub CLI | ✅ `cpalau` |
| Playwright | ✅ chromium 1247 (local), resolved by `tests/lib/browser.mjs` |
