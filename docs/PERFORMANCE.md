# Performance

How the port loads, what it measures, and what is still slow.

## Method

`npm run test:perf` runs Lighthouse over two pages in two profiles against the
fixture build, and compares the mobile profile with the Jekyll build of the same
content:

- desktop: absolute budgets (performance, best practices, SEO ≥ 95,
  accessibility ≥ 90, LCP < 2.5 s, CLS < 0.1, TBT < 200 ms);
- mobile: the port may not be more than 5 performance points or 1.5 s of LCP
  worse than Jekyll.

The test server compresses text responses, because GitHub Pages does and an
uncompressed server would report a compression opportunity that production does
not have.

Ad-hoc runs use the demo build, which is what visitors actually see:

```bash
hugo -s exampleSite --themesDir .. --theme chirpy-hugo -d .out/example
npx lighthouse http://127.0.0.1:4062/ \
  --chrome-flags="--headless=new --no-sandbox" \
  --output=json --output-path=/tmp/lh.json
```

## Baseline and result

Throttled mobile profile, same content, measured on 2026-10-30:

| Page | Perf before | Perf after | LCP before | LCP after |
|---|---|---|---|---|
| Home (fixture) | 66 | **97** | 6.3 s | **2.1 s** |
| Code-heavy post (fixture) | 66 | **69** | 6.7 s | **6.5 s** |
| Home (demo) | 72 | **91** | 4.9 s | **3.2 s** |
| Desktop (both) | 99 | **100** | 0.9 s | **0.6 s** |

The Jekyll build, with the same self-host configuration, scores 76 on mobile
home and 46 on the code post: the port is ahead, not behind.

## What changed (D-22)

1. **Self-hosted vendor assets.** Fonts, icons, search, tocbot, dayjs,
   glightbox, clipboard and the polyfill are copied byte-for-byte from
   `cotes2020/chirpy-static-assets` into `static/assets/lib/` by
   `scripts/vendor.mjs` (pinned commit, hashes in
   `tests/contract/vendor-hashes.json`). One origin instead of three.
2. **Non-blocking CSS** for icons, lightbox, the polyfill and the font
   stylesheet (`media="print"` + `onload`).
3. **Deferred theme bootstrap** (`theme.min.js` no longer blocks parsing).
4. **Preloads** for the LCP image and the body font.
5. **MathJax and Mermaid stay on the CDN**: ~23 MB, only on pages that use
   them.

Pixels are still measured with the real fonts: both builds self-host the same
files and the gate reports 84/84 (see D-22).

## What is still slow

- **Code-heavy posts.** Many Rouge tables are layout work the browser cannot
  start before the CSS arrives. The port is already faster than Jekyll here;
  going further means changing the code-block DOM.
- **Pages with MathJax or Mermaid.** The renderer costs hundreds of
  milliseconds of main-thread time. It is third-party, lazy, and only on pages
  that ask for it.
- **First visit vs repeat.** GitHub Pages caches unhashed asset URLs for about
  ten minutes; the service worker caches a second visit. Fingerprinting the
  asset names would break the DOM contract for a gain that only affects the
  first navigation.

## Vendor updates

```bash
node scripts/vendor.mjs --fetch      # clone the pinned vendor repository
node scripts/vendor.mjs --apply      # copy into static/assets/lib
node scripts/vendor.mjs --generate   # rewrite the hash manifest
node scripts/vendor.mjs --check      # verify (runs in CI)
```

Bump the `PIN` in `scripts/vendor.mjs` together with the upstream theme release.
