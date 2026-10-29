# Upstream Synchronization

How this port stays current with `cotes2020/jekyll-theme-chirpy` without ever
performing a `git merge`.

---

## 1. Why not a fork or a merge

The upstream repository is a Jekyll theme: `_layouts/`, `_includes/`,
`_sass/`, `_javascript/`, `_data/`. This repository is a Hugo theme:
`layouts/`, `assets/`, `i18n/`, `data/`. The directory trees do not correspond,
so Git has nothing meaningful to merge. A GitHub fork would only mislead
contributors into expecting a diffable relationship.

Instead:

- upstream is registered as a **read-only remote** for diffing,
- a manifest (`tests/contract/ports.yml`) maps every upstream file to its
  destination and its synchronization mode,
- a script performs the mechanical work and reports the manual work.

---

## 2. One-time setup

```bash
git remote add upstream https://github.com/cotes2020/jekyll-theme-chirpy.git
git fetch upstream --tags
```

---

## 3. The manifest

`tests/contract/ports.yml` is the single source of truth: the pin, one entry per
upstream file, and the mode. Its companion `upstream-hashes.json` records the
sha256 of everything that is copied or transformed.

```yaml
upstream:
  repo: cotes2020/jekyll-theme-chirpy
  tag: v7.6.0
  sha: 152093879e6319dac342454d8df75a3c3572315f
  gem: jekyll-theme-chirpy
  gem_version: 7.6.0

files:
  "_includes/head.html":
    target: layouts/_partials/head.html
    mode: manual

  "_sass/":
    target: assets/scss/
    mode: copy
```

Invariants enforced by `scripts/fetch-upstream.mjs --check` (Gate G8):

- **every** file in the pinned tag tree is mapped or explicitly ignored
  (currently 225 of 225);
- **every** gem-only artifact is declared with `source: gem` (currently 10);
- every `copy`/`transform` file matches its recorded sha256;
- any local copy that already exists still matches upstream.

Two sources are needed and both are pinned: the tag ships the sources, the gem
ships the sources **plus** the ten build artifacts that upstream git-ignores.
See `tests/contract/README.md`.

The full inventory, with the purpose and expected output of every file, is in
[`AUDIT.md`](AUDIT.md).

---

## 4. Workflow

### 4.1 Detect

```bash
git fetch upstream --tags
git tag --list 'v*' --sort=-v:refname | head -5
```

Compare the newest tag with the `tag` recorded in `ports.yml`.

### 4.2 Inspect

```bash
node scripts/sync-upstream.mjs --check --tag v7.7.0
```

Produces `reports/upstream-v7.7.0.md`:

```markdown
# Upstream v7.7.0 — 2026-09-01

Pinned: v7.6.0 → Candidate: v7.7.0

## Automatic (copy): 14 files
- _sass/pages/_post.scss
- _javascript/modules/components/toc.js
- _data/origin/basic.yaml
…

## Generated (transform): 2 locales
- da-DK.yml (new)
- sv-SE.yml (changed)

## Manual (templates): 3 files
### _includes/head.html
<diff>
Reason: new meta tag `fediverse:creator`.
Port to: layouts/_partials/head.html

### _includes/post-summary.html
<diff>
Port to: layouts/_partials/post-summary.html

## Config impact
- New param: `params.something` → update CONFIG.md
- Removed param: `params.old`

## Changelog highlights
- feat: …
- fix: …
```

### 4.3 Apply

```bash
node scripts/sync-upstream.mjs --apply
```

- Copies `copy` files and verifies hashes.
- Regenerates `i18n/` from `_data/locales/` (33 files, including the two with
  U+2011 non-breaking hyphens in their names).
- Copies the ten build artifacts from the **published gem** and verifies them
  (D-10); nothing is rebuilt with npm.
- Does **not** touch `manual` files.
- Writes a work list to `reports/TODO-v7.7.0.md`.

### 4.4 Port

For each manual file:

1. Open the annotated diff.
2. Apply the equivalent change to the Go template.
3. Update `ports.yml` if the file was renamed or split.
4. Add or adjust a fixture if behaviour changed.

### 4.5 Verify

```bash
npm run test:all
```

Gates G4 (HTML parity) and G5 (visual parity) are the acceptance criteria.
A release is not adopted until both are green again.

### 4.6 Record

- Bump `tag`, `sha` and `gem_version` in `ports.yml`, then run
  `node scripts/fetch-upstream.mjs --generate` and commit the new manifest.
- Update the table in `UPSTREAM.md` §7.
- Update `docs/CONFIG.md` if params changed.
- Commit with `chore(upstream): sync to v7.7.0`.

---

## 5. Classification rules

A file is `copy` when:

- it contains no Liquid and no Jekyll-specific front matter,
- it is processed by our own pipeline identically (SCSS, JS modules, data).

A file is `transform` when its content is data that must change shape
(locales: YAML nesting and key naming).

A file is `manual` when it contains Liquid or Jekyll page objects.

When in doubt, treat it as `manual`. A wrongly-classified `copy` file silently
breaks output; a wrongly-classified `manual` file only costs time.

### Special cases

| Upstream file | Handling |
|---|---|
| `_javascript/**` with `insertFrontmatter()` in Rollup | The frontmatter is a Jekyll-ism; the Rollup plugin is bypassed for our build |
| `_sass/vendors/` and `assets/js/dist/` | Git-ignored upstream, generated by npm — but **shipped by the published gem**. Copied from the gem, committed and hash-verified (D-10); never rebuilt |
| `assets/css/jekyll-theme-chirpy.scss` | Contains Liquid; our SCSS entry is generated at build time |
| `purgecss.js` content globs | Patched locally (documented, not copied): `_includes/` → `layouts/` |
| `assets/js/data/search.json` (Liquid) | Not copied; reimplemented as an output format |
| `assets/js/data/swconf.js` (Liquid) | Not copied; reimplemented as an output format |
| `assets/js/data/mathjax.js` | Copied verbatim |
| `_plugins/posts-lastmod-hook.rb` | Not copied; replaced by `.Lastmod` + `enableGitInfo` |
| `_layouts/compress.html` | Not copied; replaced by `minify` |
| `assets/feed.xml` | Hand-written Atom; reimplemented as an output format |
| `assets/robots.txt`, `assets/404.html` | Reimplemented as templates |
| `_includes/language-alias.html` | It maps *code* languages, not locales |

These exceptions are listed in `ports.yml` under `special_cases` so that Gate G8
does not report them as missing.

---

## 6. Cadence and budget

Chirpy publishes roughly 2–4 releases per year.

| Release type | Work |
|---|---|
| Assets only | ~15 minutes (script + tests) |
| Small template fix | 1–2 hours |
| New feature (e.g. new embed) | 2–6 hours |
| Template refactor | ~1 day |

Estimated annual cost: **8–16 hours**.

---

## 7. Sync history

| Date | Upstream | Notes |
|---|---|---|
| — | v7.6.0 | Baseline, pinned at project start |

---

## 8. Automation

- `upstream-watch.yml` runs weekly: fetches tags, runs `--check`, opens an issue
  with the report if a new tag exists.
- It never opens a PR and never merges.
- Gate G8 runs on every PR so drift cannot accumulate unnoticed.

---

## 9. Recovering from a bad sync

1. `git revert` the sync commit (never `reset --hard` on shared branches).
2. Restore the previous `tag`/`sha` in `ports.yml`.
3. Run `node scripts/sync-upstream.mjs --apply --force` to restore copied files.
4. Re-run the gates.

Snapshots are versioned, so a bad visual change is visible in the revert diff.
