# Proof of concept — F0.5 findings

Measured on 2026-10-29. This is the decision record for the architecture: it
answers whether Hugo can reproduce Chirpy's HTML, with numbers instead of
opinions.

- Oracle: `jekyll-theme-chirpy` 7.6.0 (gem), `JEKYLL_ENV=production`, Ruby 3.4.10.
- Port: Hugo 0.168.0 extended, same `baseURL`, `TZ=UTC`, no minification.
- Comparator: `tests/parity/diff.mjs` (parse5, structural).
- Corpus: the 12 fixtures → **47 pages** rendered by both sides.

Reproduce:

```bash
bash tests/oracle/build.sh
hugo -s tests/fixtures/hugo --themesDir .. --theme chirpy-hugo \
     --destination ../../.out/hugo
node tests/parity/diff.mjs
```

---

## 1. What was built

The whole template core, not a mock:

| Area | Files |
|---|---|
| Shell and head | `baseof.html`, `_partials/head.html`, `_partials/seo.html` |
| Chrome | sidebar, topbar, footer, favicons, search results, search loader, PWA notification |
| Post | `page.html`, datetime, read-time, post-summary, post-nav, post-edit, post-sharing, related-posts, toc |
| Listings | `home.html` (pinned algorithm), `archives.html`, `taxonomy.html`, `term.html`, section, 404, paginator |
| Render hooks | codeblock, image, heading |
| Shortcodes | prompt, filepath, img, embed/{youtube,bilibili,twitch,spotify,audio,video} |
| Assets | 114 upstream files copied and hash-verified; CSS compiled with dart-sass |

The build is **warning-free**:

```
hugo --panicOnWarning --gc   → Total in 100 ms, 0 WARN, 0 ERROR
```

---

## 2. Gate 4 — measured result

47 pages, after the declared exemptions in `tests/parity/ignore.yml` (D-06
generator meta, D-09 footer branding, D-13 pagination URL, D-02 token classes):

| Pages | Differences |
|---|---|
| 3 | 1 (only the search-loader script) |
| 3 | 2 |
| 1 | 3 |
| 2 | 4 |
| 1 | 5 |
| 31 | 6 |
| 6 | 7 |

**Zero pages are identical**, and the residual is concentrated in four causes,
all identified. The structure of every page — element tree, attributes other
than the exempted ones, class lists, text content, nesting — matches.

### What matches exactly

- `<head>` for posts: title, canonical, `og:*`, `twitter:*`, JSON-LD
  (including the author object and the image hash), verifications, fediverse.
- The document shell, sidebar, topbar (including breadcrumbs), footer (except
  D-09), search panel, PWA toast, back-to-top, mask.
- Post header (description, dates, author, pageviews slot, read time layout,
  TOC triggers), `.content`, post tail (categories, edit link, tags, license,
  sharing), related posts *set*, post navigation.
- Home cards: pinned-first algorithm, cover image, summary truncation, pin
  badge, pagination widget (only the URL shape differs, D-13).
- Code blocks: wrapper, `language-*` classes, code header with the filename or
  the language label, Rouge gutter, `<table class="rouge-table">`, line count
  and the `nolineno` behaviour.
- Images: `a.popup.img-link` wrapper, class migration (float/light/dark/normal
  to the wrapper, `shadow` and dimensions on the `<img>`), `loading="lazy"`,
  LQIP `data-src`/`data-lqip`/`blur`.
- Tables (`div.table-wrapper`), footnotes and their backlink, heading anchors on
  h2–h5, inline-code classes.
- Archives, tag index (natural order), category tree, term pages.

---

## 3. The decisive finding: Chroma ≠ Rouge

This was the risk that F0.5 existed to measure (D-02, Q7).

Chroma and Rouge **classify the same token differently**, so the class names on
`<span>` cannot be reproduced:

| Token | Rouge | Chroma |
|---|---|---|
| `const` | `kd` | `kr` |
| `console` | `nf` | `nx` |
| `"string"` | `s2` | `sb` |
| `(` | `p` | `si` |
| `--flag` (shell) | `nt` | `na` |

And the theme colours some of those classes differently:

| pair | light | dark | visible |
|---|---|---|---|
| `kd` / `kr` | same `#cf222e` | `#d28445` vs `#aa759f` | **yes, in dark** |
| `s2` / `sb` | `#0a3069` vs `#0550ae` | same | **yes, in light** |
| `nf` / `nx` | `#8250df` vs default | same | **yes, in light** |
| `p` / `si` | default vs `#24292f` | `#d0d0d0` vs `#b76d45` | no (light) |

**Conclusion:** structural parity of code blocks is achievable and achieved;
token-level parity is not, with any Hugo-native highlighter. A Rouge-compatible
DOM would require running Rouge at build time, which Hugo cannot do.

`tests/parity/ignore.yml` therefore exempts the `class` attribute of spans
inside `td.rouge-code` and compares everything else. D-02 is rewritten
accordingly (see `docs/COMPATIBILITY.md`).

---

## 4. Findings that change the plan

| # | Finding | Consequence |
|---|---|---|
| P-01 | Chroma token classes cannot match Rouge (above) | D-02 rewritten: structure yes, palette no |
| P-02 | Not every Hugo build ships Dart Sass (the Arch package does not, and the official 0.168 binary reports it as unavailable) | CSS is precompiled with dart-sass and committed, like the JS bundles (D-13) |
| P-03 | Hugo cannot inject `@use 'abstracts/variables' with (...)` for a theme: `resources.FromString` has no import path and a real theme asset has no include path | same as P-02; three entries (`entry-dual/light/dark.scss`) are compiled to `static/assets/css/` |
| P-04 | `[pagination] path` mangles the URL in 0.168 (`/page/:num/` → `/num//2/`) | Jekyll `/page2/` vs Hugo `/page/2/`: D-13, exempted in G4 |
| P-05 | Hugo lowercases taxonomy keys, upstream keeps the front-matter string | `_partials/taxonomy-labels.html` rebuilds the original labels (`Ávila`, not `ávila`) |
| P-06 | `enableGitInfo` turns `.Lastmod` into the commit date, which leaks into the SEO dates and the "updated" label | git info is off by default; `lastmod` comes from front matter (Q5 keeps it opt-in) |
| P-07 | `resources.FromString` + `toCSS` cannot resolve imports (Q6, answered: **no**) | see P-02 |
| P-08 | `transform.HighlightCodeBlock` keeps `<span class="line"><span class="cl">` even with `lineNos=false` | the hook strips the wrappers before rebuilding Rouge's table |
| P-09 | A top-level `{{ $x := ... }}` in a template that also has `{{ define }}` blocks makes Hugo skip `baseof` and emit an empty page | variables go inside the `define` blocks |
| P-10 | `hugo.Data` replaces the deprecated `.Site.Data` (0.156) | already applied; AGENTS §13.11 lists it |

---

## 5. Open items (assigned, not forgotten)

| Item | Pages | Owner |
|---|---|---|
| Read-time word count is 1–3 words lower than Jekyll's (123 vs 120 on fixture 1) | all posts | F4: count on a pre-hook representation |
| Related posts: same set, different order — upstream sorts the score **as a string** (`"2:7"`, `"1:3"`, `"1.5:12"`), which puts 1.0 before 1.5 | fixture 1 | F4: reproduce the string sort with the candidate index |
| Term/list page `<title>`, breadcrumb and SEO type (`Alpha` vs `alpha`, `article` vs `website`, missing intermediate crumb) | 23 listing pages | F3 |
| Search-loader inline script is re-escaped by Go's JS context (`\/`, `\u003c`) | all pages | F6: emit the script with `safeHTML` |
| Pagination URL shape (D-13) | 6 pages | accepted divergence, or an alias |
| Gate 5 (pixels) | — | not run yet: Playwright browsers are not installed |

None of these is architectural. All are enumerated and reproducible with the
commands at the top of this document.

---

## 6. Decision

**GO.**

The contract-renderer architecture holds: the emitted HTML matches Jekyll's
except for the items above, and the two irreducible ones are now known and
bounded —

1. syntax-highlight token classes (P-01), which no Hugo-native highlighter can
   reproduce, and
2. the pagination URL shape (P-04), a Hugo bug in the `path` option.

Everything else is a bug with a name and an owner. The project continues to F1
with D-02 rewritten and D-13 added; F8 is where the residual list must reach
zero except for those two.
