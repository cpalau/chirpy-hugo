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
| This port | Shortcodes (`{{< prompt >}}`, `{{< filepath >}}`, `{{< img >}}`) and fence attributes in the info string |
| Blast radius | Author syntax only. Rendered HTML is identical |

### Why it cannot be reproduced

Goldmark has no inline attribute lists. Hugo supports *block* attribute lists
(`markup.goldmark.parser.attribute.block`) but they are written **on the block's
own opening line** (a fence's info string, a heading's line), while kramdown
writes them on a separate line **after** the block. Inline IAL on a `code` span
or on an image inside a paragraph has no Goldmark equivalent at all.

Measured with Hugo 0.168.0 (`markup.goldmark.parser.attribute.block = true`):

| Input | Result |
|---|---|
| ```shell {.nolineno}``` on the info string | ✅ `class="highlight nolineno"` |
| `{.nolineno}` on the line **after** the closing fence | ❌ ignored |
| `![alt](/x.png){.shadow}` | ❌ emitted as `<img …>{.shadow}` — literal text, no attribute |
| `{{< prompt >}}**bold**{{< /prompt >}}` | ❌ `**bold**` stays literal |
| `{{% prompt %}}**bold**{{% /prompt %}}` | ❌ also literal: the HTML wrapper blocks the inner Markdown |
| `{{< prompt >}}` + `.Inner \| .Page.RenderString (dict "display" "block")` | ✅ `<p><strong>bold</strong></p>` |

The consequences are structural, not cosmetic: the prompt shortcode **must**
call `RenderString` with `display: block`, images need a shortcode, and code
attributes belong on the fence.


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

## D-02 — Syntax highlighting: structure yes, token palette no

| | |
|---|---|
| Status | open (measured in F0.5, see `docs/POC.md`) |
| Affects | Every code block; fixture 2 |
| Upstream | Rouge with `css_class: highlight`, `block.line_numbers: true`, `start_line: 1` |
| This port | Chroma token stream, Rouge's DOM rebuilt by `render-codeblock.html` |
| Blast radius | The colour of a few lexemes; **not** layout, spacing or wrapping |

### What is reproduced exactly

`div.language-X.highlighter-rouge` → `div.code-header` (label + copy button) →
`div.highlight > code > table.rouge-table > td.rouge-gutter.gl > pre.lineno` and
`td.rouge-code > pre`. Line count, `nolineno`, the `console`/`terminal`/
`plaintext` rule (gutter emitted, hidden by the SCSS), `file=` and the language
display name all match, byte for byte after canonicalization.

Measured: `tests/parity` reports **zero structural differences** inside code
blocks on fixture 2.

### What cannot be reproduced

Chroma and Rouge classify the same token differently:

| Token | Rouge | Chroma |
|---|---|---|
| `const` | `kd` | `kr` |
| `console` | `nf` | `nx` |
| `"string"` | `s2` | `sb` |
| `(` | `p` | `si` |
| `--flag` (shell) | `nt` | `na` |

`_sass/themes/_light.scss` and `_dark.scss` colour some of those classes
differently, so a few lexemes render in another colour:

| pair | light | dark |
|---|---|---|
| `kd` / `kr` | same | `#d28445` vs `#aa759f` |
| `s2` / `sb` | `#0a3069` vs `#0550ae` | same |
| `nf` / `nx` | `#8250df` vs default | same |

Reproducing Rouge would mean running Ruby's Rouge at build time. Hugo cannot
execute external highlighter binaries, and rewriting the SCSS is forbidden
(R1).

### Decision

- Accept. `tests/parity/ignore.yml` exempts the token markup (`<pre>` content is
  compared as text) and Gate G5 masks exactly `td.rouge-code > pre`; every pixel
  outside that box must be zero.
- Documented here so users know exactly what "not pixel perfect" means: the
  colour of some tokens, nothing else.
- A user who needs exact colours can post-process the output with Rouge outside
  the theme; that path is documented, not shipped.

### Fallback (rejected)

D-02b ("add Chroma wrapper CSS") was rejected: it patches the symptom for one
language and breaks the others, and it edits vendor SCSS.

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

Jekyll's `truncate: 200` (Liquid 4.0.4) is a **character slice**, nothing else:

```ruby
l = length - truncate_string.length          # 200 - 3 = 197
input.length > length ? input[0...l] + "..." : input
```

- counts **characters** (runes),
- **cuts inside words** — measured: a 201-character body renders as
  `body[0...197] + "..."`, ending in `…text o...`,
- appends `...` (three U+002E),
- returns the input untouched when it is 200 characters or shorter.

Hugo's `truncate`:

- counts characters,
- **breaks on a word boundary** when it can,
- appends `…` (single U+2026) unless a third argument is given.

The word-boundary behaviour is the trap: it is the "nicer" behaviour, and it is
wrong here.

### Decision

`_partials/post-summary.html` implements Jekyll's algorithm literally:
`strings.RuneCount` for the length test and `substr` (rune-based) for the cut,
then `"..."`. The pipeline also removes Rouge gutter markup before stripping
HTML, exactly as upstream does.

### Verification

- Fixture 10 contains bodies of **199, 200 and 201** characters; the oracle
  renders them unchanged, unchanged and `body[0...197] + "..."` respectively.
- G4 compares the three cards.
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

## D-10 — Generated assets ship with the theme

| | |
|---|---|
| Status | closed |
| Affects | `assets/js/dist/`, `assets/scss/vendors/` |
| Upstream | Both are **git-ignored**; upstream CI runs `npm run build` before `jekyll build` |
| This port | Committed, copied **verbatim from the published gem** and hash-verified |
| Blast radius | Repository size (~200 KB) and upgrade discipline |

### Why

Hugo consumers install the theme as a module or submodule and **cannot run
npm**. Shipping the theme without compiled CSS/JS would break every user.

### Where the bytes come from

The published `jekyll-theme-chirpy` gem is not just the tag plus packaging: it
also ships the ten artifacts that upstream git-ignores.

```
_sass/vendors/_bootstrap.scss      purgecss output, used in production
assets/js/dist/*.min.js            nine rollup bundles
```

Verified at pin time: the gem and the tag share 136 files with **zero**
differences, and the gem adds exactly those ten. We therefore copy them from the
gem instead of rebuilding, which is both more faithful (they are the bytes real
Chirpy sites serve) and reproducible without a Node toolchain.

### Decision

- `_sass/vendors/_bootstrap.scss` and the nine bundles are `mode: copy` with
  `source: gem` in `tests/contract/ports.yml`.
- `upstream-hashes.json` records their sha256 and their provenance.
- Nothing in the release pipeline rebuilds them. `scripts/purgecss.mjs` and
  `rollup.config.mjs` exist only to **prove** the shipped files, never to
  produce them.
- Consumers never need Node.

### Consequence for purgecss

Upstream's purgecss globs are `_includes/`, `_layouts/` and `_javascript/`.
Because our templates must reproduce upstream's classes exactly, the shipped
`_bootstrap.scss` remains valid. If a future template introduced a Bootstrap
class the purge step did not see, Gate G5 would fail — which is the desired
coupling.

### Verification

- G8: sha256 of every committed artifact equals the gem's copy (`--check`).
- G8: a new gem-only artifact with no `source: gem` declaration fails coverage.
- G5: the visual suite consumes the committed artifacts, exactly like a user.

---

## D-18 — Native media controls

| | |
|---|---|
| Status | open (harness limitation, not a theme difference) |
| Affects | `post/embeds`, the `audio` and `video` elements |
| Upstream | the browser draws the controls from the UA shadow DOM |
| This port | identical element, attributes and `<source>` list |
| Blast radius | 20–190 pixels inside the control bar, only under headless Chromium |

The control bar's time text paints non-deterministically while the media
buffers, which produced differences that flipped between runs. Gate G5 masks
the `audio`/`video` boxes; the element itself, its dimensions and its sources
are compared by G4, and the page height is compared by the pixel gate.

---

## D-15 — Taxonomy index metadata

| | |
|---|---|
| Status | open |
| Affects | `/categories/`, `/tags/` (head only) |
| Upstream | the `_tabs` placeholders are pages with a date, so jekyll-seo-tag emits `og:type=article` plus `article:published_time` |
| This port | Hugo generates the taxonomy index, which has no page date, so it emits `og:type=website` |
| Blast radius | two `<meta>` tags; no pixels |

Upstream's date is the **file mtime** of the tab file, which is not reproducible
in any case. The fixture pins it, but a Hugo taxonomy page cannot carry front
matter. Making the theme invent a date would be worse than the missing tag.

Pixel impact: none (proved by G5). Tracked in `docs/POC.md` §5.

---

## D-16 — Footnote markup

| | |
|---|---|
| Status | open |
| Affects | `post/tables-footnotes` |
| Upstream | kramdown: `id="fn:<label>"`, `class="footnote"`, `rel="footnote"` |
| This port | Goldmark: `id="fn:<n>"`, `class="footnote-ref"`, no `rel` |
| Blast radius | footnote anchors; the visible text and rules are identical |

Hugo has no footnote render hook, so the ids cannot be rewritten without
re-implementing the extension. What *is* reproduced: no `<hr>` before the list
(Goldmark adds one), `class="footnote"` on the reference with `rel="footnote"`,
`class="reversefootnote"` on the backlink, and the space before it. The classes
matter visually: `.footnote` carries margins and padding in
`_sass/base/_typography.scss`.

Pixel impact: none (proved by G5, six viewport/theme pairs). Internal `#fn:1`
anchors differ from upstream's `#fn:<label>`.

---

## D-17 — Display math written with `$$`

| | |
|---|---|
| Status | closed |
| Affects | `post/math` |
| Upstream | kramdown rewrites `$$ … $$` as `\[ … \]` |
| This port | a `replaceRE` in `_partials/content.html` does the same |
| Blast radius | none |

Goldmark's passthrough keeps the `$$` delimiters verbatim; kramdown converts
them. The theme converts them too, so the rendered text matches. Passthrough is
also enabled (`markup.goldmark.extensions.passthrough`) because without it
Goldmark eats LaTeX escapes such as `\,`.

---

## D-13 — CSS is precompiled and committed

| | |
|---|---|
| Status | closed |
| Affects | `static/assets/css/*.css` |
| Upstream | Jekyll compiles `assets/css/jekyll-theme-chirpy.scss` per site, with Liquid injecting `$theme` |
| This port | Three files compiled with dart-sass and committed (`jekyll-theme-chirpy.css`, `-light.css`, `-dark.css`) |
| Blast radius | None for consumers; the CSS must be rebuilt when the SCSS changes |

### Why

Two independent reasons, both measured in F0.5:

1. **Hugo cannot inject `@use … with ($theme: …)` for a theme.** The entry must
   be a real file, and a theme asset has no include path that dart-sass can use
   (`resources.FromString` gives `<stream>:1:1: Can't find stylesheet`).
2. **Not every Hugo build ships Dart Sass.** The Arch package and the official
   0.168 extended binary both answer "this feature is not available". Requiring
   it would break consumers for a reason that has nothing to do with the theme.

### Decision

`scripts/build-css.sh` compiles the three entries with a pinned dart-sass
(1.107.0) into `static/assets/css/`, which Hugo serves verbatim. The template
picks the file from `params.theme_mode`. The output is committed and verified
like the JS bundles (D-10).

---

## D-14 — Pagination URL shape

| | |
|---|---|
| Status | open |
| Affects | Home pagination; 6 pages in the fixture set |
| Upstream | Jekyll `paginate_path` default → `/page2/`, `/page3/` |
| This port | Hugo → `/page/2/`, `/page/3/` |
| Blast radius | Bookmarks and external links to page N of the home listing |

### Why

`[pagination] path` is broken in Hugo 0.168: `/page/:num/` produces
`/num//2/`, `/page/num/` produces `/num/2/`. The default (`/page/2/`) is the
only sane value, and it is not what Jekyll emits.

### Decision

Keep Hugo's shape, declare it, and exempt `link[rel=next]`/`link[rel=prev]`
in G4. A site migrating from Jekyll can add server redirects; the theme cannot
invent them.

---

## D-12 — Edit link path

| | |
|---|---|
| Status | open |
| Affects | The "Edit this post" link; fixture 1 |
| Upstream | `page.path`, relative to the Jekyll source root (`_posts/2026-01-01-x.md`) |
| This port | `.File.Path`, relative to `content/` (`posts/2026-01-01-x.md`) |
| Blast radius | One URL, and only when `actions.edit_post.static_url` is `false` |

### Why it cannot be identical

Jekyll and Hugo have different content layouts, so the same file has a different
path. No template can recover the other convention.

### Decision

- `static_url: true` is the documented default for parity: one URL for every
  post, identical in both worlds.
- With `static_url: false` the theme appends `.File.Path`. Sites migrating from
  Jekyll must either accept the new path shape or set `static_url: true`.
- Fixture 1 uses `static_url: true`, so G4 compares the link normally.
- A dedicated assertion checks the dynamic form against a fixed expectation.

### Verification

- G4 fixture 1: the link `href` must be identical.
- A contract test asserts `static_url: false` appends the content-relative path.


---

## D-11 — Natural sorting

| | |
|---|---|
| Status | **closed** — reproducible without a divergence |
| Affects | Tags index (`tags.html`), trending tags |
| Upstream | Liquid `sort_natural` |
| This port | `_partials/sort-natural.html`: stable insertion sort on an ASCII-only fold |
| Blast radius | None, if the partial is used everywhere a list is sorted by name |

### What `sort_natural` actually is

Not locale-aware, despite its name. Liquid 4.0.4 implements it with
`String#casecmp`: **ASCII-only** case folding, then byte comparison, and the
sort is stable. Measured (`tests/qa/q4-sort-natural.mjs`, 21-item corpus):

```
10  2  42  _x  alpha  ALPHA  apple  Apple  audio  beta  code  design
diagram  Zebra  zeta  Zzz  Ávila  árbol  äpfel  中文  🚀
```

Three traps, all measured:

- Hugo's `sort` uses a **Unicode collator**: `_x` and `🚀` sort first, and
  `äpfel` sorts as `apfel`.
- Sorting by `lower` is not a substitute: `lower` folds non-ASCII, which swaps
  `Ávila` (C3 81 in `casecmp`) with `árbol` (C3 A1).
- `lt` on strings in a Go template **is** a byte comparison, which is the
  primitive needed.

### Decision

`_partials/sort-natural.html` folds A–Z to a–z only (26 replacements), then
insertion-sorts with `lt`. It is stable by construction, because an item is only
placed before an existing one when its key is strictly smaller. Cost is O(n²)
with n = number of tags, which is tens, not thousands.

### Verification

- `tests/qa/q4-sort-natural.mjs`: the ported partial matches Liquid on all 21
  cases, while `sort` and `sort(lower)` do not.
- G4 fixture 11 compares the full tag order on the real page.


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
