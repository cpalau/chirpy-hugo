# Fixture contract — the twelve parity scenarios

Two sites render the same twelve scenarios:

| Side | Path | Syntax |
|---|---|---|
| Reference | `tests/oracle/` | kramdown + Liquid + IAL |
| Port | `tests/fixtures/hugo/` | Goldmark + shortcodes + render hooks |

The reference is the definition of correct. A difference between the two is
either a bug in the port or a `D-xx` in `docs/COMPATIBILITY.md`. Never in
between.

Both sites share `baseURL = http://127.0.0.1:4001/`, `TZ=UTC`, `timezone: UTC`,
`paginate = 3`, `/posts/:slug/` permalinks and the same service configuration.
See `tests/oracle/README.md` for why each determinism setting exists.

---

## 1. The twelve scenarios

| # | Fixture | Jekyll source | URLs compared | Covers |
|---|---|---|---|---|
| 1 | `post/full` | `2026-01-01-full.md` | `/posts/full/` | cover + LQIP, TOC, lastmod, related posts, post nav, edit link, pageviews, comments |
| 2 | `post/code` | `2026-01-02-code.md` | `/posts/code/` | Rouge DOM, line numbers, `nolineno`, `file=`, console/terminal/plaintext |
| 3 | `post/prompts` | `2026-01-03-prompts.md` | `/posts/prompts/` | the four prompt types with inline Markdown |
| 4 | `post/math` | `2026-01-04-math.md` | `/posts/math/` | MathJax inline and display, `\(…\)`, `\[…\]`, `$…$`, `$$…$$` |
| 5 | `post/mermaid` | `2026-01-05-mermaid.md` | `/posts/mermaid/` | client-side Mermaid |
| 6 | `post/embeds` | `2026-01-06-embeds.md` | `/posts/embeds/` | YouTube, Bilibili, Twitch, Spotify, audio, video |
| 7 | `post/images` | `2026-01-07-images.md` | `/posts/images/` | `left`, `right`, `light`, `dark`, `shadow`, `normal`, popup, `w`/`h` |
| 8 | `post/i18n-es` | `2026-01-08-i18n-es.md` | `/posts/i18n-es/` | accented and repeated heading ids (D-04) |
| 9 | `post/tables-footnotes` | `2026-01-09-tables-footnotes.md` | `/posts/tables-footnotes/` | table wrapper, footnotes and backlink, internal/external/anchor links |
| 10 | `home/pinned` | `index.html` + 15 posts | `/`, `/page2/` … `/page5/` | pinned-first algorithm, pagination, `hidden`, summary truncation (D-03) |
| 11 | `listing` | `_tabs/*`, taxonomies | `/archives/`, `/categories/`, `/categories/<term>/`, `/tags/`, `/tags/<term>/` | year grouping, hierarchical categories, natural tag sort (D-11) |
| 12 | `system` | generated | `/search.json`, `/sw.min.js`, `/swconf.js`, `/feed.xml`, `/sitemap.xml`, `/robots.txt`, `/404.html`, `site.webmanifest` | search index, PWA, feed, 404, sitemap |

Supporting posts that exist only to feed fixtures 10 and 11: `pinned-a`,
`pinned-b`, `hidden`, `truncate-199`, `truncate-200`, `truncate-201`.

## 2. Front matter equivalence

| Jekyll | Hugo | Notes |
|---|---|---|
| `date: 2026-01-01 09:00:00 +0000` | `date: 2026-01-01T09:00:00Z` | RFC 3339 |
| `last_modified_at:` | `lastmod:` | the Jekyll plugin never runs here (the gem does not ship `_plugins/`), so both sides declare it |
| `categories: [a, b]` | `categories: ["a", "b"]` | same taxonomy names |
| `pin: true` | `pin: true` | Jekyll's `where` stringifies, Hugo must accept both `true` and `"true"` |
| `hidden: true` | `hidden: true` | home list only (G-41) |
| `media_subpath:` | `media_subpath:` | same key, same semantics |
| `image.{path,alt,lqip}` | `image.{path,alt,lqip}` | same shape |

## 3. Authoring equivalence

| Scenario | Jekyll | Hugo |
|---|---|---|
| Prompt | `> **Tip**: text` + `{: .prompt-tip }` | `{{< prompt tip >}}…{{< /prompt >}}` |
| Filepath | `` `_config.yml`{: .filepath } `` | `{{< filepath "_config.yml" >}}` |
| Code, no numbers | fence + `{: .nolineno }` | ` ```lang {.nolineno}` |
| Code, filename | fence + `{: file="_config.yml" }` | ` ```lang {file="_config.yml"}` |
| Image class | `![alt](x.png){: .left }` | `{{< img src="x.png" alt="alt" class="left" >}}` |
| Embed | `{% include embed/youtube.html id="…" %}` | `{{< embed/youtube id="…" >}}` |
| Footnote | `[^1]` | `[^1]` (same) |

The three non-obvious ones are not style choices; see `AGENTS.md` §5.1 and
`docs/COMPATIBILITY.md` D-01.

## 4. Invariants

- `tests/fixtures/hugo/static/assets/` is a **byte-identical copy** of
  `tests/oracle/assets/` (images and the media files of fixture 6). Hugo does not
  follow symlinks in `static/`, so the files are duplicated; a fixture run must
  `diff -r` them and fail on drift.
- The media files are real (one second, silent) so the browser's native audio
  and video controls render the same on both sides. With 404s the controls
  differ by a few pixels depending on when the error state is painted.
- `categories` and `tags` have **no content page** on the Hugo side: the
  taxonomy index replaces upstream's `_tabs/categories.md` and `_tabs/tags.md`.
  Creating them would collide with `/categories/` and `/tags/`.
- No fixture may depend on the network. Every URL is local or blocked.
- No fixture may depend on the clock. `swconf.js` is the only known trap (G-21).
