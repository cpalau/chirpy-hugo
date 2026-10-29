# Visual parity harness (Gate 5)

Proves that the port renders **the same pixels** as the Jekyll original.

```bash
node tests/visual/capture.mjs oracle            # three-fixture set → .out/shots/oracle
node tests/visual/capture.mjs hugo              # same pages        → .out/shots/hugo
node tests/visual/capture.mjs oracle --all      # the twelve fixtures, three listings
node tests/visual/capture.mjs hugo /posts/math/ # one page, while iterating
node tests/visual/compare.mjs                   # pixelmatch; diff images in reports/visual
```

## The rule is zero pixels

`AGENTS.md` R3b: a page is correct when **zero** pixels differ. There is no
percentage budget.

Two regions are exempt because they cannot be reproduced, and both are measured
on every run:

| D-xx | Region | Why |
|---|---|---|
| D-02 | `td.rouge-code > pre` | Chroma classifies tokens differently from Rouge; two pairs are coloured differently |
| D-09 | `footer > p:nth-of-type(2)` | the footer must credit Hugo, not claim Jekyll |
| D-18 | `audio`, `video` | native controls live in the UA shadow DOM and do not paint deterministically in headless Chromium |

`capture.mjs` writes the bounding box of those regions next to each screenshot
(`*.masks.json`, in document coordinates, because the shot is full-page).
`compare.mjs` counts the differing pixels **outside** the union of the boxes and
fails on a single one. Inside the boxes it still reports the count, so a change
in the code colouring is visible instead of hidden.

## Two passes, same port

Both builds must use the same `baseURL`, because absolute URLs appear in
`canonical`, `og:url`, JSON-LD and the share links. They are therefore captured
one after the other on port 4001, not side by side, and compared offline.

## Speed

The whole matrix (14 pages × 3 viewports × 2 themes = 84 comparisons) takes
about **66 seconds**. If it takes longer, something is hanging:

- external requests are aborted by default (`--with-vendor` for the faithful
  pass); a stalled CDN `fetch` used to cost five minutes per page;
- `domcontentloaded` + `document.fonts.ready` + 150 ms, never `load`;
- one tall viewport instead of a stitched full-page screenshot (stitching
  scrolls, and scroll-driven widgets change mid-shot);
- `CAPTURE_TIMEOUT_MS=<ms>` arms a watchdog, and a wedged page is skipped.

## Determinism checklist

Every item is implemented in `capture.mjs`; removing one reintroduces flakiness.

- fixed clock (`Date` is patched before any script runs);
- `colorScheme` forced per project, and `data-bs-theme` set the same way the
  theme toggle does it (not through `localStorage`, which the theme may reject);
- `reducedMotion: 'reduce'`, `animations: 'disabled'`, `caret: 'hide'`;
- route allowlist: local, fonts, icons and vendor scripts; analytics, comments,
  embeds and pageview counters aborted;
- `document.fonts.ready` before the shot;
- MathJax: waits for `MathJax.startup.promise` **with a 5 s cap** (a failed CDN
  must not hang the run);
- Mermaid: waits for the generated `svg`;
- native media: waits for `readyState >= 4` and no seeking, because the control
  bar's time text paints differently while the metadata is still loading;
- 1.2 s settle after everything else.

## Interpreting a failure

The comparator prints the count outside the declared boxes, the bounding box of
the difference and the height delta. `reports/visual/<page>-diff.png` highlights
the pixels.

- A difference **inside** a mask is D-02 or D-09 by definition.
- A difference **outside** is a bug. Find the element with the geometry probe
  described in `docs/POC.md`, fix it, and re-run. Never widen a mask to make a
  page pass: `AGENTS.md` §2 R3b forbids it.
- A whole-page difference is usually a missing asset (a 404 makes the JS layer
  die silently) — check `requestfailed` first.
