# Declared Divergences

Anything this port cannot or should not reproduce exactly is recorded here with
an ID, the reason, the blast radius, and the test that proves it is harmless.

**Rule:** a divergence without an ID is a bug. A `D-xx` must have a matching
entry in `tests/parity/ignore.yml` when it affects Gate G4.

Status values: `open` (accepted, not yet implemented), `closed` (implemented and
tested), `retired` (upstream no longer relevant).

---

## D-01 — kramdown attribute lists become Hugo shortcodes

| | |
|---|---|
| Status | open |
| Affects | Markdown authoring; fixtures 2, 3, 7 |
| Upstream | kramdown IAL: `{: .prompt-tip }`, `` `x`{: .filepath } ``, `{: .nolineno }`, `{: .light }` |
| This port | Shortcodes (`{{< prompt >}}`, `{{< filepath >}}`) and explicit attributes |
| Blast radius | Author syntax only. Rendered HTML is identical |

### Why it cannot be reproduced

Goldmark has no inline attribute lists. Hugo supports *block* attribute lists
(`markup.goldmark.parser.attribute.block`) but they are written **before** the
block, while kramdown writes them **after**. Inline IAL on a `code` span or
image inside a paragraph has no Goldmark equivalent at all.

### Decision

Shortcodes are idiomatic Hugo and keep the build free of magic. A one-shot
converter rewrites legacy content:

```bash
node scripts/convert-content.mjs --dry-run content/
node scripts/convert-content.mjs --write content/
```

The converter is idempotent and produces a diff for review.

### Verification

- G4 on fixtures 2, 3, 7 proves output HTML equality.
- `SHORTCODES.md` documents each mapping.
- The converter has unit tests over a corpus of upstream Markdown samples.

---

## D-02 — Rouge markup is rebuilt from Chroma tokens

| | |
|---|---|
| Status | open |
| Affects | All code blocks; fixture 2 |
| Upstream | Rouge with `css_class: highlight`, `block.line_numbers: true`, `start_line: 1` |
| This port | Chroma tokens assembled into Rouge's DOM by `render-codeblock.html` |
| Blast radius | None if the hook is correct; otherwise every code block |

### Why it matters

Upstream `_sass/base/_syntax.scss` targets Rouge's structure:

```
div.highlight
  table
    td.rouge-gutter.gl > pre.lineno
    td.rouge-code > pre
```

Chroma's default output differs (`table.lntable`, different wrappers). Using
Chroma's default markup would require editing the SCSS, which violates R1.

### Decision

`layouts/_markup/render-codeblock.html` reconstructs Rouge's exact DOM using
`transform.Highlight` with `noClasses=false`, then re-wraps:

- Outer: `<div class="highlight"><div class="chroma">…</div></div>` replaced by
  Rouge's `<div class="highlight"><table>…</table></div>` shape.
- Line numbers in `td.rouge-gutter.gl > pre.lineno`.
- Code in `td.rouge-code > pre`.
- `plaintext`, `console`, `terminal` get no line numbers (upstream behaviour).
- `start_line` honoured.

### Verification

- G4 fixture 2 compares the entire code block subtree.
- G5 catches spacing differences (`padding-bottom: .75rem`, line-height 1.4rem).
- Unit-ish test: a fixture with 12 languages and all option combinations.

### Fallback

If exact DOM parity proves impossible, the contingency is a **minimal,
documented** addition to the SCSS for Chroma's wrapper only, recorded here as
D-02b. It must remain under 20 lines and never touch vendor code.

---

## D-03 — Summary truncation semantics

| | |
|---|---|
| Status | open |
| Affects | Home listing, search index, fixtures 10 |
| Upstream | `markdownify \| strip_html \| truncate: 200` |
| This port | Custom partial replicating Jekyll's `truncate` exactly |
| Blast radius | Text of summaries; no layout impact |

### The difference

Jekyll's `truncate: 200`:

- counts **characters**,
- does **not** cut inside a word,
- appends `...` (three U+002E).

Hugo's `truncate`:

- counts characters,
- cuts on word boundary by default,
- appends `…` (single U+2026) unless a third argument is given.

### Decision

`_partials/post-summary.html` implements Jekyll's algorithm explicitly and
passes `"..."` as the ellipsis. The pipeline also removes Rouge gutter markup
before stripping HTML, exactly as upstream does.

### Verification

- G4 fixture 10 with summaries of 199, 200, 201 and 400 characters, and with
  accented characters and code blocks.
- A unit test with the exact upstream algorithm ported line by line.

---

## D-04 — Heading ID generation

| | |
|---|---|
| Status | open |
| Affects | Anchors, TOC, deep links; fixture 8 |
| Upstream | kramdown `auto_ids` |
| This port | Goldmark `autoHeadingID` with `autoIDType` tuned to match |
| Blast radius | Anchor URLs only |

### The difference

Both slugify headings, but differ on accents, `ñ`, punctuation, repeated
headings and leading digits. Spanish content makes this visible immediately.

### Decision

1. Fix `markup.goldmark.parser.autoIDType` to the closest kramdown behaviour.
2. Where a difference remains, `render-heading.html` applies an explicit `id`
   computed by a documented slugify partial.
3. Document the rule in `SHORTCODES.md` so authors can pin an id manually
   (`## Título {#custom-id}`).

### Verification

- Fixture 8 includes: `Introducción`, `¿Qué es?`, `Niño`, `Añadir`, `C++`,
  `1. Primer paso`, a repeated heading, and emoji.
- G2 asserts every internal anchor resolves.
- A golden list of `heading → id` pairs is committed and diffed.

---

## D-05 — HTML compression

| | |
|---|---|
| Status | open |
| Affects | Byte-level output only |
| Upstream | `jekyll-compress-html` (`compress_html`) |
| This port | Hugo `minify` |
| Blast radius | None visually |

Both remove whitespace and comments; the exact byte output differs. Gate G4
canonicalizes whitespace, so the structural diff is clean.

### Decision

Accept. Additionally, `tests/parity/ignore.yml` exempts nothing for this case
because canonicalization already handles it.

---

## D-06 — `jekyll-seo-tag` output

| | |
|---|---|
| Status | open |
| Affects | `<head>` of every page |
| Upstream | `jekyll-seo-tag` gem |
| This port | `_partials/seo.html` reproducing tags and JSON-LD |
| Blast radius | SEO metadata |

### What must match

- Tag order and attribute names.
- `<title>` composition rules per page type.
- `og:*` and `twitter:*` sets.
- JSON-LD `BlogPosting`: `@context`, `@type`, `headline`, `datePublished`,
  `dateModified`, `author`, `publisher`, `image`, `mainEntityOfPage`,
  `description`, `keywords`.
- `fediverse:creator` (v7.5).

### Decision

Reimplement rather than use Hugo's `internal/opengraph` and `internal/schema`,
because those emit different markup. The partial is the single source of truth.

### Verification

- G4 on all 12 fixtures, `<head>` subtree only.
- A JSON-LD validator run over every fixture.
- A dedicated test asserting no duplicate `og:` or `twitter:` tags.

---

## D-07 — Non-merging configuration categories

| | |
|---|---|
| Status | open |
| Affects | Every user site |
| Upstream | Jekyll merges the theme `_config.yml` with the site config, deeply |
| This port | Hugo merges theme config per category: `params` deep, but `markup`, `outputs`, `permalinks`, `module`, `languages` are **replaced**, not merged |
| Blast radius | A user who defines `markup` or `outputs` can silently drop settings the theme needs |

### What Hugo does

Hugo merges theme/module configuration with project configuration, project
first. The `_merge` strategy is per category:

- `params`: `deep` → defaults ship with the theme and users override keys.
- `menus`, `outputformats`, `mediatypes`: `shallow`.
- `markup`, `outputs`, `permalinks`, `module`, `languages`, `pagination`,
  `build`, `security`, `sitemap`: `none` → **the project's section replaces the
  theme's section entirely**.

### Decision

1. All `params` defaults live in the theme's `config/_default/params.toml`, so a
   user never has to copy them. `docs/CONFIG.md` remains the contract.
2. Settings the theme **requires** in non-merging categories are documented as
   mandatory and validated:
   - `markup.goldmark.renderer.unsafe = true` (upstream content uses raw HTML),
   - `markup.goldmark.parser.attribute.block = true` (image and fence classes),
   - `outputs` for the pages that emit `search.json`, `sw.js`, `swconf.js`.
3. If a required setting is missing, the theme emits a **build warning with the
   exact snippet to copy**, instead of failing silently.
4. `scripts/check-config.mjs` compares the effective merged configuration with
   the requirements and fails CI on drift.

### Verification

- G1 builds a site with an empty `params`.
- G9 (adoption) builds `HugoBasicExample` and a fresh site with the documented
  minimum configuration, and also a site that defines its own `markup` section
  to prove the warning path works.
- A test asserts every documented param changes output (no dead params).

---

## D-08 — *(retired)* Related posts algorithm

Removed after the audit. `_includes/related-posts.html` does **not** use
Jekyll's `site.related_posts`: it is Chirpy's own scoring function
(+1 per shared tag, +0.5 per shared category, top 3). It is fully reproducible
in Hugo, so it is a normal porting task, not a divergence. See `AUDIT.md` §7,
G-11.

---

## D-09 — Footer branding

| | |
|---|---|
| Status | open |
| Affects | Footer of every page; fixture 12 |
| Upstream | `Using the :THEME theme for :PLATFORM.` where PLATFORM = **Jekyll** and THEME links to the upstream repo, with `title="v{theme.version}"` |
| This port | PLATFORM = **Hugo**, THEME links to this repository, version from `params.theme_version` |
| Blast radius | Visible text and one link |

### Why it cannot be identical

A Hugo port cannot claim to run on Jekyll, and must not link users to a
different project's repository for version information. Keeping the original
string would be misleading.

### Decision

- Rendered text: `Using the Chirpy Hugo theme for Hugo.`
- `title` tooltip: `v{{ params.theme_version }}`.
- The i18n key shape is preserved (`meta` with `:THEME` and `:PLATFORM`), so
  translations keep working.
- `tests/parity/ignore.yml` exempts `footer > p:nth-of-type(2)` text and the
  theme anchor `href`/`title`.

### Verification

- G4 ignores only that subtree; everything else in the footer is compared.
- G5 masks that paragraph.

---

## D-10 — Generated assets are committed

| | |
|---|---|
| Status | open |
| Affects | `assets/js/dist/`, `assets/scss/vendors/` |
| Upstream | Both are **git-ignored**; CI runs `npm run build` before `jekyll build` |
| This port | Committed to the repository and verified reproducible |
| Blast radius | Repository size (~200 KB) and upgrade discipline |

### Why

Hugo consumers install the theme as a module or submodule and **cannot run
npm**. Shipping the theme without compiled CSS/JS would break every user.

### Decision

- `assets/js/dist/*.min.js` (9 bundles) and `assets/scss/vendors/_bootstrap.scss`
  are committed.
- `npm run build:assets` regenerates them from the pinned upstream sources.
- Gate G8 rebuilds and compares hashes; a mismatch fails CI.
- The build is pinned (Node version, lockfile) so output is deterministic.

### Verification

- G8: `npm ci && npm run build:assets` then `git diff --exit-code`.
- G5: the visual suite consumes the committed artifacts, exactly like a user.

---

## D-11 — Natural sorting

| | |
|---|---|
| Status | open |
| Affects | Tags index (`tags.html`), trending tags |
| Upstream | Liquid `sort_natural` — case-insensitive, locale-aware ordering |
| This port | Hugo `sort` plus a normalisation comparator |
| Blast radius | Display order of tags when case or accents differ |

### Decision

1. Normalise with `lower` before sorting, then sort by the normalised key while
   preserving the original label.
2. If accents still diverge, extend the comparator with a documented
   transliteration table.
3. Cover with fixture 11 containing `apple`, `Zebra`, `Ávila`, `árbol`, `Zzz`.

### Verification

- G4 compares the full tag list order on fixture 11.
- A golden list of expected order is committed.

---

## Adding a new divergence

Copy this template at the end of the file:

```markdown
## D-XX — Short title

| | |
|---|---|
| Status | open |
| Affects | Which features / fixtures |
| Upstream | What Jekyll does |
| This port | What we do instead |
| Blast radius | What can go wrong |

### Why it cannot be reproduced

### Decision

### Verification

### Fallback
```

Then:

1. Add the exemption to `tests/parity/ignore.yml` if G4 is affected.
2. Reference the ID from `FEATURES.md`.
3. Mention it in the PR description.
