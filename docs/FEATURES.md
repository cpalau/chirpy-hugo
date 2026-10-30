# Feature Inventory and Hugo Mapping

> **Audited on 2026-10-30** against the code and the gate suite: **162** rows
> at parity, **16** with a declared divergence, **0** pending and **8** out of
> scope. Every parity row is proved by at least one gate (G1–G9, see
> `TESTING.md`); the divergences are the `D-xx` entries in
> `COMPATIBILITY.md`.
>
> The out-of-scope rows were checked against the pinned upstream tree, not
> assumed: v7.6.0 has no UI language selector, no `hreflang` alternates, no
> `dir="rtl"`, no per-language menus or posts, and it does not redistribute the
> external vendor bundle (`C31`). `language-alias.html` is the alias map for
> **code** languages, and it is ported as `code-language.html` (I8).
>
> A Hugo site can still be multilingual: the templates read
> `.Site.Language.Lang`, every string goes through `i18n`, and Hugo's own
> `translations`, `menus.<lang>` and `languages.toml` work. What does not exist
> is an upstream UI to port.

Complete inventory of everything `jekyll-theme-chirpy` v7.6.0 does, and how each
feature is implemented in Hugo.

Legend

- ✅ direct parity
- 🟡 parity with a declared divergence (see `COMPATIBILITY.md`)
- ⬜ not yet implemented
- ❌ out of scope

"Verify" is the gate that proves the feature from `TESTING.md`.

---

## 1. Configuration and site model

| # | Feature | Jekyll | Hugo | Status | Verify |
|---|---|---|---|---|---|
| C1 | Theme import | `theme: jekyll-theme-chirpy` | Hugo Module (`module.imports`) | ✅ | G1 |
| C2 | Site language | `lang` | `defaultContentLanguage`, `languageCode` | ✅ | G7 |
| C3 | Timezone | `timezone` | `timeZone` | ✅ | G4 |
| C4 | Title, tagline, description | `title`, `tagline`, `description` | `title`, `params.tagline`, `params.description` | ✅ | G4 |
| C5 | Canonical URL | `url` + `baseurl` | `baseURL` | ✅ | G4 |
| C6 | GitHub / Twitter handles | `github.username`, `twitter.username` | `params.github_username`, `params.twitter_username` | ✅ | G4 |
| C7 | Social identity | `social.name/email/links/fediverse_handle` | `params.social.*` | ✅ | G4 |
| C8 | Sidebar contacts | `_data/contact.yml` | `data/contact.yaml` (copied) | ✅ | G3 |
| C9 | Share targets | `_data/share.yml` | `data/share.yaml` (copied) | ✅ | G3 |
| C10 | Authors registry | `_data/authors.yml` | `data/authors.yaml` | ✅ | G4 |
| C10b | Media type map | `_data/media.yml` | `data/media.yaml` | ✅ | G4 |
| C11 | Post defaults | `defaults` | `cascade` | ✅ | G1 |
| C12 | Tabs collection | `collections.tabs` | content pages + `menus` + `permalinks` | ✅ | G4 |
| C13 | Pagination size | `paginate: 10` | `pagination.pagerSize` | ✅ | G4 |
| C14 | Post permalink | `/posts/:title/` | `permalinks.page` | ✅ | G2 |
| C15 | Category / tag permalinks | `/categories/:name/`, `/tags/:name/` | `permalinks.term` | ✅ | G2 |
| C16 | HTML compression | `compress_html` | `minify` | 🟡 D-05 | G4 |
| C17 | Sass output style | `sass.style: compressed` | `toCSS` + `minify` | ✅ | G5 |
| C18 | Self-hosted vendor assets | `assets.self_host.*` | `params.assets.self_host.*` | 🟡 parameters only, the vendor files are not shipped (C31) | G3 |
| C19 | CDN for media | `cdn` | `params.cdn` + `media-url` partial | ✅ | G4 |
| C20 | Custom meta injection | `metadata-hook.html` | partial override | ✅ | G4 |
| C21 | Webmaster verifications | `webmaster_verifications.*` | `params.webmaster_verifications.*` | ✅ | G4 |
| C22 | Analytics providers | `analytics.*` | `params.analytics.*` | ✅ | G4 |
| C23 | Pageviews provider | `pageviews.provider` | `params.pageviews.provider` | ✅ | G4 |
| C24 | Comment providers | `comments.*` | `params.comments.*` | ✅ | G4 |
| C25 | Edit-post action | `actions.edit_post.*` | `params.edit_post.*` | ✅ | G4 |
| C26 | PWA switches | `pwa.*` | `params.pwa.*` | ✅ | G4 |
| C27 | Theme mode default | `theme_mode` | `params.theme_mode` | ✅ | G5 |
| C28 | HTML lang override | `alt_lang` (optional site key) | `params.alt_lang` | ✅ | G7 |
| C29 | Pagination path | `paginate_path` (`/page:num/`) | `pagination.path` | 🟡 D-14 | G4 |
| C30 | Theme version (footer tooltip) | `theme.version` (gem) | `params.theme_version` | ✅ | G4 |
| C31 | Self-hosted vendor assets | external `chirpy-static-assets` repo at `/assets/lib` | module mount or documented dependency | ❌ | G9 |

---

## 2. Content model and front matter

| # | Feature | Jekyll | Hugo | Status | Verify |
|---|---|---|---|---|---|
| F1 | Post title | `title` | `title` | ✅ | G4 |
| F2 | Date with timezone offset | `date` | `date` | ✅ | G4 |
| F3 | Hierarchical categories | `categories: [A, B]` | `categories` + custom term logic | ✅ | G4 |
| F4 | Tags | `tags` | `tags` | ✅ | G4 |
| F5 | Pinned posts | `pin: true` | `pin` | ✅ | G4 |
| F6 | Cover image | `image.path` or `image: url` | same | ✅ | G4 |
| F7 | Cover alt | `image.alt` | same | ✅ | G4 |
| F8 | LQIP (base64 blur) | `image.lqip` | same | ✅ | G5 |
| F9 | Media subpath | `media_subpath` | same | ✅ | G4 |
| F10 | Per-post TOC | `toc` | `toc` | ✅ | G4 |
| F11 | Per-post comments | `comments` | `comments` | ✅ | G4 |
| F12 | Per-post author | `author` | `author` | ✅ | G4 |
| F13 | Per-post description | `description` | `description` | ✅ | G4 |
| F14 | Math flag | `math` | `math` | ✅ | G4 |
| F15 | Mermaid flag | `mermaid` | `mermaid` | ✅ | G4 |
| F16 | Drafts | `_drafts` + `--drafts` | `draft: true` | 🟡 Hugo semantics, not a port gap | G1 |
| F17 | Last modified | `posts-lastmod-hook.rb` | `.Lastmod` + `enableGitInfo` | ✅ | G4 |
| F18 | Tab pages | `_tabs/*.md` | content pages + menu | ✅ | G4 |
| F19 | Redirects | `redirect_from` | `aliases` | ✅ | G2 |
| F20 | Multiple authors | `authors: [id]` (array) | same, `data/authors.yaml` | ✅ | G4 |
| F21 | Cover without background | `image.no_bg: true` | same | ✅ | G4 |
| F22 | Hidden posts | `hidden: true` | `hidden` | ✅ | G4 |

---

## 3. Layout, navigation and chrome

| # | Feature | Jekyll | Hugo | Status | Verify |
|---|---|---|---|---|---|
| L1 | Base document | `_layouts/default.html` | `baseof.html` | ✅ | G4 |
| L2 | Sidebar (avatar, name, bio, socials) | `sidebar.html` | `_partials/sidebar.html` | ✅ | G4 |
| L3 | Sidebar mobile collapse | `sidebar.js` | unchanged JS | ✅ | G3 |
| L4 | Topbar with breadcrumb | `topbar.html` | `_partials/topbar.html` | ✅ | G4 |
| L5 | Footer: copyright, license, meta | `footer.html` | `_partials/footer.html` | ✅ | G4 |
| L6 | Theme toggle (light/dark/system) | `mode-toggle.js` | unchanged JS | ✅ | G5 |
| L7 | Theme persistence | v7.6 localStorage | unchanged JS | ✅ | G5 |
| L8 | Back-to-top | `back-to-top.js` | unchanged JS | ✅ | G3 |
| L9 | Tooltips | `tooltip-loader.js` | unchanged JS | ✅ | G3 |
| L10 | Search overlay | `search-loader.js` | partial + unchanged JS | ✅ | G3 |
| L11 | PWA update notification | `notification.html` | partial + unchanged JS | ✅ | G5 |
| L12 | UI language selector | — (does not exist) | — | ❌ not an upstream feature | — |
| L13 | 404 page | `assets/404.html` (page layout) | `404.html` | ✅ | G2 |

---

## 4. Home and listings

| # | Feature | Jekyll | Hugo | Status | Verify |
|---|---|---|---|---|---|
| H1 | Home post list | `home.html` | `home.html` | ✅ | G4 |
| H2 | Summary, 200 chars with `...` | `post-summary.html` | `post-summary.html` | 🟡 D-03 | G4 |
| H3 | Summary prefers `description` | same | same | ✅ | G4 |
| H4 | Pagination | `paginate` | `.Paginator` | ✅ | G4 |
| H5 | Pinned first | sort by `pin` | sort by `pin` | ✅ | G4 |
| H6 | Archives by year | `archives.html` | `GroupByDate` | ✅ | G4 |
| H7 | Categories index | `categories.html` | `taxonomy.html` | ✅ | G4 |
| H8 | Category page (hierarchical) | `category.html` | `term.html` | ✅ | G4 |
| H9 | Tags index | `tags.html` — `sort_natural` | `taxonomy.html` + `sort-natural.html` (Q4) | ✅ | G4 |
| H10 | Tag page | `tag.html` | `term.html` | ✅ | G4 |
| H11 | Trending tags | `trending-tags.html` — top 10, ties by `sort_natural` | `trending-tags.html` + `sort-natural.html` (Q4) | ✅ | G4 |
| H12 | Category collapse tree | `category-collapse.js` | unchanged JS | ✅ | G3 |
| H13 | Recently-updated list | `update-list.html` | `update-list.html` | ✅ | G4 |
| H14 | Hidden posts excluded | `home.html` (`hidden != true`) | same | ✅ | G4 |

---

## 5. Post page

| # | Feature | Jekyll | Hugo | Status | Verify |
|---|---|---|---|---|---|
| P1 | Post header | `post.html` | `page.html` | ✅ | G4 |
| P2 | TOC | `toc.html`, `toc-status.html` | `toc.html` | ✅ | G3/G4 |
| P3 | TOC desktop + mobile | `toc-desktop.js`, `toc-mobile.js` | unchanged JS | ✅ | G5 |
| P4 | Heading anchors | `refactor-content.html` | `_markup/render-heading.html` | 🟡 D-04 | G4 |
| P5 | Post navigation | `post-nav.html` | `post-nav.html` (`.PrevInSection` / `.NextInSection`, Q3) | ✅ | G4 |
| P6 | Related posts | `related-posts.html` — custom score (tag 1, category 0.5, top 3) | `related-posts.html` | ✅ | G4 |
| P7 | Share buttons | `post-sharing.html` | `post-sharing.html` | ✅ | G4 |
| P8 | Copy-link button | inline JS | unchanged JS | ✅ | G3 |
| P9 | License notice | `footer.html` + i18n | `footer.html` | ✅ | G4 |
| P10 | Edit-this-post link | `post-edit.html` | `post-edit.html` | ✅ | G4 |
| P11 | Read time | `read-time.html` — 180 wpm, `number_of_words: 'auto'` | `read-time.html` + `word-count.html` (never `.WordCount`, Q1) | ✅ | G4 |
| P12 | Pageviews | `pageviews/goatcounter.html` | same path | ✅ | G4 |
| P13 | Last-modified label | `datetime.html` | `datetime.html` | ✅ | G4 |

---

## 6. Markdown and rich text

| # | Feature | Jekyll | Hugo | Status | Verify |
|---|---|---|---|---|---|
| M1 | Syntax highlighting | Rouge, `css_class: highlight` | Chroma + render hook | 🟡 D-02 | G4 |
| M2 | Line numbers (table layout) | Rouge `block.line_numbers` | hook emits Rouge markup | 🟡 D-02 | G4 |
| M3 | `nolineno` | kramdown IAL | shortcode / block attribute | 🟡 D-01 | G4 |
| M4 | `filepath` label | kramdown IAL | shortcode / codeblock attr | 🟡 D-01 | G4 |
| M5 | Prompts (tip/info/warning/danger) | kramdown IAL | `{{< prompt >}}` | 🟡 D-01 | G4/G5 |
| M6 | MathJax | `math: true` | same | ✅ | G4 |
| M7 | Mermaid | `mermaid: true` | same | ✅ | G5 |
| M8 | Embed YouTube | `embed/youtube.html` | shortcode | ✅ | G4 |
| M9 | Embed Bilibili | `embed/bilibili.html` | shortcode | ✅ | G4 |
| M10 | Embed Spotify | `embed/spotify.html` | shortcode | ✅ | G4 |
| M11 | Embed Twitch | `embed/twitch.html` | shortcode | ✅ | G4 |
| M12 | Embed audio | `embed/audio.html` | shortcode | ✅ | G4 |
| M13 | Embed video | `embed/video.html` | shortcode | ✅ | G4 |
| M14 | Dark/light images | kramdown IAL | `render-image` class | 🟡 D-01 | G5 |
| M15 | Left/right/normal/shadow images | kramdown IAL | `render-image` class | 🟡 D-01 | G5 |
| M16 | Image popup (glightbox) | `img-popup.js` | unchanged JS | ✅ | G5 |
| M17 | Lazy loading | `img-loading.js` | unchanged JS | ✅ | G5 |
| M18 | Tables | GFM | Goldmark + `render-table` | ✅ | G4 |
| M19 | Footnotes | `&#8617;&#xfe0e;` | `footnote.backlinkHTML` | ✅ | G4 |
| M20 | Strikethrough, task lists, autolinks | GFM | Goldmark extensions | ✅ | G4 |
| M21 | Raw HTML | kramdown allows | `unsafe = true` | ✅ | G4 |
| M22 | Code copy button | `clipboard.js` | unchanged JS | ✅ | G3 |
| M23 | Task list icons | `refactor-content.html` replaces checkbox inputs | `replaceRE` in content partial | ✅ | G4 |
| M24 | Code block language label | `refactor-content.html` + `language-alias.html` | `render-codeblock` + language map | ✅ | G4 |
| M25 | Table wrapper | `refactor-content.html` wraps tables | `render-table` hook | ✅ | G4 |

---

## 7. Search

| # | Feature | Jekyll | Hugo | Status | Verify |
|---|---|---|---|---|---|
| S1 | JSON index | Liquid-rendered `search.json` | output format `JSON` + jsonify wrapper (Q2) | ✅ | G4 |
| S2 | Index schema | `{title,url,categories,tags,date,content}` | identical, byte-verified | ✅ | G4 |
| S3 | Content extraction | `post-summary.html full_text=true` | `plainify` + normalization | ✅ | G4 |
| S4 | Result rendering | `search-results.html` + Day.js | unchanged JS | ✅ | G3 |
| S5 | Open/close/keyboard | `search-display.js` | unchanged JS | ✅ | G5 |
| S6 | Search hints (trending tags) | `search-results.html` | same partial | ✅ | G4 |

---

## 8. Comments, analytics, pageviews

| # | Feature | Jekyll | Hugo | Status | Verify |
|---|---|---|---|---|---|
| A1 | Disqus | `comments/disqus.html` | partial | ✅ | G4 |
| A2 | Utterances | `comments/utterances.html` | partial | ✅ | G4 |
| A3 | Giscus + theme sync | `comments/giscus.html` | partial | ✅ | G4/G5 |
| A4 | Google Analytics | `analytics/google.html` | partial | ✅ | G4 |
| A5 | GoatCounter | `analytics/goatcounter.html` | partial | ✅ | G4 |
| A6 | Umami | `analytics/umami.html` | partial | ✅ | G4 |
| A7 | Matomo | `analytics/matomo.html` | partial | ✅ | G4 |
| A8 | Cloudflare Analytics | `analytics/cloudflare.html` | partial | ✅ | G4 |
| A9 | Fathom | `analytics/fathom.html` | partial | ✅ | G4 |
| A10 | Pageview counter | `pageviews/goatcounter.html` | partial | ✅ | G4 |

---

## 9. SEO and metadata

| # | Feature | Jekyll (`jekyll-seo-tag`) | Hugo | Status | Verify |
|---|---|---|---|---|---|
| O1 | `<title>` composition | Liquid in `head.html` | custom partial | ✅ | G4 |
| O2 | Meta description | seo-tag | custom partial | ✅ | G4 |
| O3 | Canonical link | seo-tag | `.Permalink` | ✅ | G4 |
| O4 | Open Graph | seo-tag | custom partial | ✅ | G4 |
| O5 | Twitter cards | seo-tag | custom partial | ✅ | G4 |
| O6 | JSON-LD `BlogPosting` | seo-tag | custom partial | 🟡 D-06 | G4 |
| O7 | Author resolution | `authors.yml` | `data/authors.yaml` | ✅ | G4 |
| O8 | Social preview image | `head.html` | custom partial | ✅ | G4 |
| O9 | Webmaster verifications | config + seo-tag | params | ✅ | G4 |
| O10 | `fediverse:creator` | `head.html` | custom partial | ✅ | G4 |
| O11 | Metadata hook | include | partial override | ✅ | G4 |
| O12 | Favicon set (v7.4) | `favicons.html` | partial + assets | ✅ | G2 |
| O13 | Atom feed | **hand-written** `assets/feed.xml` (5 posts, summary 400 chars) | custom output format reproducing it | ✅ | G4 |
| O14 | Sitemap | `jekyll-sitemap` | built-in | ✅ | G2 |
| O17 | `robots.txt` | `assets/robots.txt` (`Disallow: /norobots/`) | template | ✅ | G2 |
| O16 | `hreflang` alternates | — (does not exist) | — | ❌ not an upstream feature | — |

SEO is a first-class feature, not an afterthought: items O1–O11 are part of the
Definition of Done and are verified by the HTML parity gate against a real
`jekyll-seo-tag` build.

---

## 10. PWA

| # | Feature | Jekyll | Hugo | Status | Verify |
|---|---|---|---|---|---|
| W1 | Manifest | `site.webmanifest` | copied | ✅ | G2 |
| W2 | Service worker | `pwa/sw.js` → `sw.min.js` | output format | ✅ | G4 |
| W3 | SW config with cache list | `assets/js/data/swconf.js` | output format | ✅ | G4 |
| W4 | Offline cache, `deny_paths` | `pwa.cache.*` | `params.pwa.cache.*` | ✅ | G5 |
| W5 | Installable | manifest + SW | same | ✅ | G6 |
| W6 | iOS safe area (v7.6) | CSS | inherited | ✅ | G5 |

---

## 11. Internationalization (first-class, not optional)

All 33 upstream locales are in scope from day one (decision **D7**).

| # | Feature | Jekyll | Hugo | Status | Verify |
|---|---|---|---|---|---|
| I1 | Locale files (33) | `_data/locales/*.yml` | `i18n/*.yaml` generated | ✅ | G7 |
| I2 | UI string lookup | `site.data.locales[lang].x` | `{{ i18n "x" }}` | ✅ | G7 |
| I3 | Nested key structure | `layout.post`, `tabs.home` | identical dotted keys | ✅ | G7 |
| I4 | Multiline strings (`>-`) | YAML folded scalars | preserved in transform | ✅ | G7 |
| I5 | Interpolation | `:LICENSE_NAME`, `:THEME`, `:PLATFORM` | `{{ i18n "k" (dict "LICENSE_NAME" $v) }}` | ✅ | G7 |
| I6 | Localized date formats | `df.*.strftime` + `df.*.dayjs` | mapping table + `time.Format` | ✅ | G4 |
| I7 | RTL locales (v7.4) | locale metadata | `dir="rtl"` on `<html>` | ❌ not an upstream feature | G7 |
| I8 | Code-language aliases | `language-alias.html` | `code-language.html` | ✅ | G4 |
| I9 | Language selector UI | sidebar select | `language-selector.html` | ❌ not an upstream feature | G7 |
| I10 | `hreflang` alternates | `language-alias.html` | `.AllTranslations` | ❌ not an upstream feature | G7 |
| I11 | Per-language menus | tabs collection + lang | `menus.<lang>` | ❌ not an upstream feature | G7 |
| I12 | Per-language content | `_posts/<lang>/...` | content translation keys | ❌ not an upstream feature | G7 |
| I13 | Fallback to `en` | Jekyll default | Hugo `defaultContentLanguage` | ✅ | G7 |
| I14 | Missing-key detection | — | `scripts/i18n.mjs --check` | ✅ | G7 |
| I15 | Locale-aware fonts/shaping | CSS | inherited | ✅ | G5 |

Contract details, including the transform rules and the date-format mapping,
are in [`I18N.md`](I18N.md).

---

## 12. Build pipeline and developer tooling

| # | Feature | Jekyll | Hugo | Status | Verify |
|---|---|---|---|---|---|
| B1 | JS bundling (9 bundles) | Rollup → `assets/js/dist` (**git-ignored upstream**) | copied from the published gem, **committed** (D-10) | ✅ | G8 |
| B2 | CSS vendor purge | `purgecss.js` → `_sass/vendors/_bootstrap.scss` (**git-ignored upstream**) | copied from the published gem, **committed** (D-10) | ✅ | G8 |
| B3 | CDN vendor URLs (no SRI) | `_data/origin` + `jsdelivr-combine` | copied data + partial | ✅ | G3 |
| B4 | JS/SCSS lint | ESLint, Stylelint | not shipped | 🟡 the assets are copies verified by sha256 (D-10); linting them would lint upstream | G1 |
| B5 | HTML validation | `html-proofer` | `html-validate` + `html-proofer` | ✅ | G2 |
| B13 | Theme-scoped SCSS build | `@use 'abstracts/variables' with ($theme: '{{ site.theme_mode }}')` | generated SCSS entry + `toCSS` | 🟡 D-13 | G5 |
| B14 | Deterministic committed artifacts | — | `assets/js/dist`, `assets/scss/vendors` (D-10) | ✅ | G8 |
| B6 | Theme metadata | `jekyll-theme-chirpy.gemspec` | `theme.toml` | ✅ | G9 |
| B7 | Demo site | theme repo `_posts`/`_tabs` | `exampleSite/` | ✅ | G9 |
| B8 | Gallery assets | — | `images/screenshot.png`, `images/tn.png` | ✅ | manual |
| B9 | Works on generic sites | — | `HugoBasicExample` build | ✅ | G9 |
| B10 | Works with empty config | — | empty `params`, zero posts | ✅ | G9 |
| B11 | Subdirectory `baseURL` | `baseurl` | `baseURL` path | ✅ | G9 |
| B12 | Template override by user | — | standard Hugo precedence | ✅ | G9 |

---

## 13. Explicit non-goals

| Feature | Reason |
|---|---|
| Liquid tags inside post content | Requires a Liquid engine; converted to shortcodes |
| kramdown IAL at build time | Not implementable in Goldmark; converted once |
| `render_with_liquid: true` | Same |
| Jekyll `_drafts` directory semantics | Replaced by `draft: true` |
| Jekyll plugin compatibility layer | Out of scope; Hugo-native equivalents only |

---

## 14. Where each feature is proven

| Inventory section | Gate | Document |
|---|---|---|
| §1 Configuration | G1, G4 | `CONFIG.md` |
| §2 Content model | G4 | `PLAN.md` F0 fixtures |
| §3 Chrome | G3, G4, G5 | `TESTING.md` |
| §4 Listings | G4 | `TESTING.md` |
| §5 Post page | G3, G4, G5 | `TESTING.md` |
| §6 Markdown | G4, G5 | `SHORTCODES.md`, `COMPATIBILITY.md` |
| §7 Search | G3, G4, G5 | `TESTING.md` |
| §8 Comments/analytics | G4 | `TESTING.md` |
| §9 SEO | G4 | `COMPATIBILITY.md` D-06 |
| §10 PWA | G2, G4, G5, G6 | `TESTING.md` |
| §11 i18n | G7, G4 | `I18N.md` |
| §12 Build pipeline and distribution | G1, G3, G5, G8, G9 | `UPSTREAM.md`, `CONFIG.md` |
