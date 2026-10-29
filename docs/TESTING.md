# Verification Strategy

Nine gates. Gates **G4** (HTML parity) and **G5** (visual parity) are the ones
that turn "pixel perfect" from a claim into a measurement.

The oracle is not a mock: it is a real build of the **Jekyll theme itself**, run
with local Ruby, rendering the same content as the Hugo build.

```
tests/fixtures/  ──┬──> Jekyll 7.6.0 build  ──> .out/oracle ──┐
                   └──> Hugo build          ──> .out/hugo   ──┴──> diff
```

---

## 1. Gate overview

| Gate | Name | Tool | Failure means |
|---|---|---|---|
| G1 | Build integrity | `hugo`, custom manifest test | Pages missing, warnings, orphan resources |
| G2 | HTML validity | `html-validate`, `html-proofer` | Invalid markup, broken links or anchors |
| G3 | DOM ↔ JS contract | custom selector extractor | Upstream JS will not work on our markup |
| G4 | HTML parity | parse5 canonicalizer + DOM diff | We render different HTML than Jekyll |
| G5 | Visual parity | Playwright + pixelmatch | We render different pixels than Jekyll |
| G6 | Accessibility and performance | axe-core, Lighthouse CI | Accessibility or budget regression |
| G7 | i18n | key-set comparison | Missing or divergent translations |
| G8 | Upstream drift | sha256 + ports coverage | Copied assets diverge from the pin |
| G9 | Adoption | fresh site + HugoBasicExample builds | The theme only works for its author |

Pass criteria are in [PLAN.md](PLAN.md) §3 (Definition of Done).

---

## 2. Test corpus: 12 fixtures

Both builds use the **same 12 scenarios**, expressed twice: once in Jekyll
syntax (`tests/oracle/`) and once in Hugo syntax (`tests/fixtures/`).

| # | Fixture | Covers |
|---|---|---|
| 1 | `post/full` | image, LQIP, TOC, lastmod, related posts, nav, edit link, pageviews |
| 2 | `post/code` | code blocks, line numbers, `nolineno`, `filepath`, many languages |
| 3 | `post/prompts` | tip, info, warning, danger |
| 4 | `post/math` | MathJax inline and block |
| 5 | `post/mermaid` | diagram |
| 6 | `post/embeds` | YouTube, Spotify, Bilibili, Twitch, audio, video |
| 7 | `post/images` | light/dark, left/right, shadow, normal, popup |
| 8 | `post/i18n-es` | accents, ñ, punctuation in headings (D-04) |
| 9 | `post/tables-footnotes` | tables, footnotes, internal and external links |
| 10 | `home/pinned` | pinned posts, pagination, long summaries (D-03) |
| 11 | `listing` | archives, hierarchical categories, tags, trending tags |
| 12 | `system` | search, PWA assets, RSS, 404, sitemap |

Additional multilingual fixtures are generated per locale for G7.

---

## 3. Gate 1 — Build integrity

```bash
hugo --panicOnWarning --gc --minify --printPathWarnings --destination .out/hugo
node tests/build/manifest.mjs
```

`manifest.mjs` asserts:

- The set of generated URLs equals the expected set (fixtures + taxonomies +
  pagination + `search.json` + `sw.js` + `swconf.js` + `index.xml` + `sitemap.xml`).
- No page rendered with an empty `.Title` that should have one.
- Every referenced asset exists in `.out/hugo`.
- No `resources/` cache entries left unused.

---

## 4. Gate 2 — HTML validity

```bash
npx html-validate ".out/hugo/**/*.html"
npx html-proofer --root-dir .out/hugo --checks Links,Images,Scripts
```

Checks:

- unique `id` attributes per document,
- valid nesting and required attributes,
- every `href="#..."` resolves to an existing id,
- every internal link resolves to a generated page,
- every `<img>` has `src` and `alt`.

---

## 5. Gate 3 — DOM ↔ JS contract

`tests/contract/ports.yml` declares the selectors each ported template must
expose. `tests/contract/selectors.mjs`:

1. Parses `assets/js/**/*.js` (the hash-verified copy of upstream
   `_javascript/`) and extracts:
   - `document.querySelector('…')`, `querySelectorAll('…')`
   - `getElementById('…')`
   - `element.classList.add/remove/toggle('…')`
   - `element.dataset.foo` → `[data-foo]`
   - `getAttribute('data-…')`
2. Loads the rendered fixture pages in a DOM (jsdom) plus a static HTML scan.
3. Asserts every selector resolves on at least one page that loads that script.
4. Fails with a table of `{script, selector, expected page}` when missing.

Result: an upstream JS change becomes a precise, named failure instead of a
silent visual bug.

---

## 6. Gate 4 — HTML parity (Jekyll vs Hugo)

### 6.1 Oracle setup

```
tests/oracle/
├── Gemfile          # jekyll + plugins; the theme comes from the published gem
├── Gemfile.lock     # committed
├── _config.yml      # same params as the Hugo fixture site
├── _data/           # authors, contact, media, share (the gem ships only locales/origin)
├── _posts/
├── _tabs/
├── assets/
└── build.sh
```

```bash
bash tests/oracle/build.sh          # → ../../.out/oracle
```

`build.sh` runs `bundle exec jekyll build` with `JEKYLL_ENV=production`, `TZ=UTC`
and the pinned `baseURL`.

Three details matter:

- **Production, not development.** Upstream's CSS entry `@use`s `main.bundle`
  only when `jekyll.environment == production`, and that is the only path that
  includes the purged Bootstrap. A development build renders without Bootstrap
  and would compare against a theme we do not ship.
- **No `compress_html`.** D-05 (minification) is verified by G1; feeding
  compressed HTML to G4 only adds noise.
- **No `jekyll-compress-html` gem.** It is not a gem: it is the Liquid layout
  `_layouts/compress.html`, which ships inside the theme.

The ten build artifacts (`_sass/vendors/_bootstrap.scss`, nine
`assets/js/dist` bundles) come from the published gem, byte-identical to what
real Chirpy sites serve. See D-10.

Ruby 3.4.10 and bundler 4.0.3 are available locally; CI uses `ruby/setup-ruby`.

### 6.2 Canonicalization

Raw string comparison is useless: Jekyll and Hugo differ in whitespace,
attribute order and entity encoding without any visual consequence. Both builds
are parsed and compared structurally.

`tests/parity/canonicalize.mjs` (parse5):

1. Parse to a DOM tree.
2. Remove comments and whitespace-only text nodes.
3. Collapse internal whitespace in text nodes (but **not** inside `<pre>`,
   `<code>`, `<textarea>`).
4. Sort attributes by name; normalize boolean attributes.
5. Normalize `class` token order.
6. Decode HTML entities to characters.
7. Drop volatile attributes (`data-timestamp`, build hashes) listed in
   `tests/parity/ignore.yml`.
8. Serialize deterministically.

### 6.3 Diff

- **Structural diff**: compare the two DOM trees node by node; report the first
  divergent path with context (`html > body > main > article > div.highlight`).
- **Text diff**: compare the normalized text content per page.
- Output: `tests/snapshots/parity/<page>.html` (golden) and
  `reports/parity/<page>.diff`.

Any non-zero diff must map to a `D-xx` in `COMPATIBILITY.md`, with an entry in
`tests/parity/ignore.yml` describing exactly which nodes are exempt and why.

### 6.4 Determinism

- `TZ=UTC` and `LANG=C.UTF-8` for both builds.
- Same `baseURL` (`http://localhost:4001/` for the oracle run).
- Fixed build date passed via config so `now()` does not drift.

---

## 7. Gate 5 — Visual parity (Playwright)

This is the literal pixel proof. It compares **the Jekyll build against the
Hugo build**, not against hand-made mocks.

### 7.1 Serving

Both builds must use the **same** `baseURL`, because absolute URLs appear in
`og:url`, canonical links, JSON-LD and share buttons. They are therefore
captured in two passes, not side by side:

```bash
npx http-server .out/oracle -p 4001 &   # pass 1 → .out/shots/oracle
# stop it
npx http-server .out/hugo   -p 4001 &   # pass 2 → .out/shots/hugo
```

`pixelmatch` then compares `shots/oracle/<page>.png` against
`shots/hugo/<page>.png` offline. This also keeps the comparison independent of
timing: nothing depends on both servers being alive at once.

### 7.2 Matrix

| Dimension | Values |
|---|---|
| Pages | the 12 fixtures |
| Viewports | 375×812, 768×1024, 1280×800 |
| Themes | light, dark |
| States (nightly) | default, TOC open, search open, image lightbox, hover, focus |

PR run: 12 × 3 × 2 = **72 comparisons**. Nightly adds states and locales.

### 7.3 Determinism checklist

Every item is mandatory; without them the suite is flaky and therefore useless.

- [ ] Fixed container image and pinned Playwright browser build.
- [ ] `deviceScaleFactor` fixed per project, `colorScheme` forced per project.
- [ ] `page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'))`.
- [ ] `animations: "disabled"`, `caret: "hide"`.
- [ ] **All external requests blocked** via `page.route('**', …)`; fonts,
      analytics, comments and CDN scripts are stubbed locally.
- [ ] Local fonts only; no network font loading during tests.
- [ ] `mask` on dynamic regions: pageviews, comment widgets, relative dates.
- [ ] `reducedMotion: 'reduce'`.
- [ ] Same HTTP server and same `baseURL` shape for both builds.

### 7.4 Comparator

```ts
expect(page).toHaveScreenshot(`…png`, {
  threshold: 0.1,          // pixelmatch per-pixel colour tolerance
  maxDiffPixelRatio: 0.001 // 0.1 % of pixels
});
```

**The rule is zero pixels, not a ratio** (`AGENTS.md` R3b). The capture step
records the bounding box of every declared exception (D-02 code tokens, D-09
footer, D-18 native media controls) in a `.masks.json` next to each screenshot;
the comparator counts the differing pixels **outside** those boxes and fails if
there is a single one. Inside the boxes the count is reported, never hidden.

Implementation notes, learned the hard way:

- **Offline by default.** Every external request is aborted; `--with-vendor`
  serves fonts and icons from `.out/vendor-cache` for the faithful pass. Without
  this, MathJax and Mermaid cost 30 s per page.
- **One tall viewport, not a stitched full-page shot.** Stitching scrolls the
  page, and scroll-driven widgets (tocbot's active item) change mid-shot.
- **No blocking waits.** `domcontentloaded`, `document.fonts.ready`, and a
  150 ms settle. Renderers and media get their own bounded waits behind
  `--with-renderers`.
- **Bounded.** `CAPTURE_TIMEOUT_MS` arms a watchdog; a wedged page is skipped
  instead of killing the batch.
- **Speed.** The fourteen-page matrix (84 comparisons) takes about 66 s.

A failure writes three artifacts to `test-results/`: expected (Jekyll),
actual (Hugo), diff (highlighted). The diff image is the review artifact; it is
attached to the CI run and must be reviewed before updating snapshots.

### 7.5 Interaction suite

Pixels are not enough: behaviour must match too.

- TOC highlights the section in view while scrolling.
- Search opens, filters, and renders results with the same markup.
- Theme toggle switches and persists across navigation.
- Copy-code and copy-link buttons write to the clipboard.
- Image lightbox opens and closes.
- Sidebar collapse on mobile.
- PWA update notification appears with a stubbed service worker.

---

## 8. Gate 6 — Accessibility and performance

```bash
npx playwright test tests/a11y
npx lhci autorun
```

- `@axe-core/playwright` on every fixture, both themes: **zero**
  `serious`/`critical` violations, and no new `moderate` ones.
- Lighthouse CI budgets:

| Metric | Budget |
|---|---|
| Performance | ≥ 95 |
| Accessibility | ≥ 95 |
| Best practices | ≥ 95 |
| SEO | ≥ 95 |
| LCP | < 2.5 s |
| CLS | < 0.1 |
| Total blocking time | < 200 ms |

Budgets are stored in `lighthouserc.json` and compared against the Jekyll build
to ensure the port did not regress.

---

## 9. Gate 7 — i18n

```bash
node scripts/i18n.mjs --check
node tests/i18n/keys.mjs
```

- Exactly 33 locale files, matching upstream.
- Every locale has the same key set as `en` (no missing, no extra).
- No empty values.
- No untranslated placeholder (`TODO`, `TRANSLATE`, the English string copied
  verbatim where upstream has a translation).
- One render per locale produces no template errors and no `i18n` fallback
  warnings.
- RTL locales set `dir="rtl"`.
- `hreflang` alternates present for every translated page.

See [I18N.md](I18N.md) for the transform contract.

---

## 10. Gate 8 — Upstream drift

```bash
node scripts/fetch-upstream.mjs --check
node scripts/sync-upstream.mjs --check
```

- sha256 of every file in `assets/scss/`, `assets/js/`, `data/`,
  `assets/img/favicons/` equals the pinned upstream file (`tag` or `gem`,
  whichever the contract declares).
- `i18n/` regenerates byte-identically from `_data/locales/`.
- `ports.yml` covers 100 % of upstream `_layouts/` and `_includes/`: a new
  upstream file with no mapping fails the gate.
- Once a phase closes, its targets are no longer allowed to be missing: pending
  counts must reach zero (`--strict-targets`).

---

## 11. Gate 9 — Adoption (works for strangers)

This gate is what makes the theme usable by other people. It answers one
question: *can someone install this without reading our source?*

```bash
npm run test:adoption
```

Four independent scenarios, each in a temporary directory:

### 11.1 Fresh site, empty params

```bash
hugo new site /tmp/adopt-fresh
cd /tmp/adopt-fresh
hugo mod init example.com/fresh
hugo mod get github.com/cpalau/chirpy-hugo
# hugo.toml: only module.imports + baseURL + title
hugo build
```

Assertions:

- build exits 0 with no `WARN`/`ERROR`,
- `public/index.html` exists and is non-empty,
- empty `content/` does not crash,
- no missing-resource errors (avatar, fonts, icons).

### 11.2 `HugoBasicExample`

```bash
git clone --depth 1 https://github.com/gohugoio/HugoBasicExample /tmp/adopt-basic
# install the theme as a module
hugo build
```

This is the canonical compatibility test used by the Hugo theme gallery. It
proves the theme tolerates generic content, unknown sections and arbitrary
front matter.

### 11.3 Documented minimum configuration

A site that copies **only** the settings listed as mandatory in
[`CONFIG.md`](CONFIG.md) (`markup`, `outputs`) must produce the full feature set:
`search.json`, `sw.js`, `swconf.js`, feed and sitemap.

### 11.4 Hostile configuration

A site that defines its own `markup` section without our required keys must:

- still build (no hard failure),
- print a warning naming the missing key and the exact snippet to add.

This proves D-07's warning path.

### 11.5 Reusability checklist (asserted by the gate)

- [ ] Works with `baseURL` in a subdirectory (`https://example.com/blog/`).
- [ ] Works monolingual and multilingual.
- [ ] Works with zero posts, one post and 500 posts.
- [ ] Works without `avatar`, `image`, `author` or `social`.
- [ ] Every credential-dependent feature is off by default.
- [ ] No absolute personal URL anywhere in the rendered output.
- [ ] Templates can be overridden from the project directory.

---

## 12. CI

```yaml
# .github/workflows/ci.yml (PR)
jobs:
  build:      # G1, G2
  contract:   # G3
  parity:     # G4  (installs Ruby, builds the oracle)
  visual:     # G5  (72 comparisons)
  quality:    # G6
  i18n:       # G7
  drift:      # G8
  adoption:   # G9  (fresh site, HugoBasicExample, hostile config)
```

- PR: all gates, target under 12 minutes.
- Nightly: full visual matrix, all locales, cross-browser (Chromium, Firefox,
  WebKit).
- Weekly: `upstream-watch.yml` — fetches upstream tags, generates
  `reports/upstream-<tag>.md`, opens an issue. Never auto-merges.

Caching: `bundle` and `node_modules` cached by lockfile hash; Playwright
browsers cached by version; Hugo binary cached by version.

---

## 13. Snapshot policy

- Snapshots only change when the output legitimately changes.
- Every snapshot update must be accompanied by a reviewed diff image (G5) or
  diff report (G4) in the PR description.
- A snapshot update without a matching upstream change or documented
  divergence is rejected in review.
- `npm run test:visual:update` must never be run blindly in CI.
