# Releasing

How this project records changes, versions them and publishes them.

The terminology matters, so it is stated explicitly:

| Concept | Technical name | Standard |
|---|---|---|
| Commit message format | **Conventional Commits** | [1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) |
| Version numbers | **Semantic Versioning (SemVer)** | [2.0.0](https://semver.org/) |
| Changelog structure | **Keep a Changelog** | [1.1.0](https://keepachangelog.com/en/1.1.0/) |
| What users read at release time | **Release notes** | GitHub Releases |
| The generated history | **Changelog** (`CHANGELOG.md`) | — |
| Automation | **semantic-release** (optional) | — |

---

## 1. Commits

Every commit is **in English** and follows Conventional Commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### 1.1 Types

| Type | Meaning | Version impact |
|---|---|---|
| `feat` | new user-visible capability | MINOR |
| `fix` | bug fix | PATCH |
| `perf` | performance improvement | PATCH |
| `refactor` | internal change, no behaviour change | none |
| `docs` | documentation | none |
| `test` | tests and fixtures | none |
| `build` | build pipeline or dependencies | none |
| `ci` | CI configuration | none |
| `chore` | maintenance | none |
| `revert` | revert of a previous commit | depends |

### 1.2 Scopes

`partials`, `layouts`, `shortcodes`, `markup`, `assets`, `config`, `i18n`,
`scripts`, `tests`, `docs`, `upstream`, `starter`, `release`.

### 1.3 Breaking changes

Signalled twice:

```
feat(config)!: rename params.comments.provider to params.comments.engine

BREAKING CHANGE: sites using params.comments.provider must rename the key.
Run scripts/check-config.mjs --fix to migrate automatically.
```

The `!` marks it for tooling; the footer explains it for humans.

### 1.4 Enforcement

- `commitlint.config.js` validates the message in a `commit-msg` hook.
- CI validates every commit in the PR range (`npx commitlint --from … --to …`).
- A PR with a non-conforming commit cannot be merged.

### 1.5 Anti-patterns

```
wip
fix stuff
Update files
arreglar el sidebar
feat: changes
```

All rejected.

---

## 2. Changelog

`CHANGELOG.md` follows Keep a Changelog and is updated **in the same PR** as the
change.

```markdown
## [Unreleased]

### Added
- ...

### Changed
- ...

### Deprecated
- ...

### Removed
- ...

### Fixed
- ...

### Security
- ...
```

Rules:

- One entry per user-visible change, written for a user, not for the author.
- Reference the issue or PR number.
- Do not write "various fixes" or "improvements".
- `docs`/`ci`/`test`-only PRs may omit the entry.
- Internal refactors with no user impact go under a single "Internal" line or
  are omitted from the release notes but kept in the changelog.

---

## 3. Versioning

SemVer, with theme-specific rules:

| Change | Version |
|---|---|
| New feature, new param, new shortcode, new locale | **MINOR** |
| Bug fix, parity fix, upstream patch sync | **PATCH** |
| Removing/renaming a param or shortcode, changing a template path users may override, changing a CSS class or DOM contract the JS depends on | **MAJOR** |
| Sync to a new upstream minor with no breaking change for users | **MINOR** |
| Sync to an upstream major | **MAJOR** (and say so in the title) |

`0.y.z` is used until v1.0.0 (the parity milestone).

The version appears in three places and must match:

1. the git tag (`vX.Y.Z`),
2. `package.json`, the source of truth,
3. `data/theme.yaml`, which the footer renders and links to the GitHub release
   (`scripts/release.mjs --prepare` writes both).

`params.theme_version` is **not** this theme's version: it records the upstream
Chirpy release the port reproduces, and `release.mjs --check` keeps it equal to
the pin in `ports.yml`.

---

## 4. Release notes — required content

A release is **not** a tag plus an auto-generated commit list. The release notes
must let a user who never reads the diff understand what changed and what to do.

### 4.1 Mandatory sections

1. **Highlights** — 1–3 bullets: why this release matters.
2. **Added** — every new feature, with a short explanation and a usage example.
3. **Changed** — behaviour changes a user could notice.
4. **Fixed** — each bug: symptom → cause → fix.
5. **Breaking changes** — what stops working and the exact migration step.
6. **Upstream sync** — Chirpy version tracked, what was ported, what is pending.
7. **Parity status** — Gate G4 (HTML) and G5 (visual) results.
8. **Upgrade** — commands and manual steps.
9. **Credits** — upstream authors when the work originates there.

Omission is a release blocker. "It is in the commits" is not an answer.

### 4.2 Template

```markdown
# Chirpy Hugo vX.Y.Z

Tracks upstream `cotes2020/jekyll-theme-chirpy` **vA.B.C**.
Parity: Gate G4 ✅ · Gate G5 ✅ (12 fixtures × 3 viewports × 2 themes).

## Highlights

- ...

## Added

- **`{{< prompt >}}` shortcode** — replaces kramdown's `{: .prompt-tip }`.
  ```go-html-template
  {{</* prompt tip */>}}
  **Tip**: something useful.
  {{</* /prompt */>}}
  ```
- ...

## Changed

- `post-summary` now matches Jekyll's truncation byte-for-byte (D-03).

## Fixed

- **Sidebar email link opened a blank page in Firefox.** The contact entry now
  uses the same `javascript:void` form as upstream v7.6.0.

## Breaking changes

- **`params.comments.provider` renamed to `params.comments.engine`.**
  Migration:
  ```bash
  sed -i 's/comments\.provider/comments.engine/' config/_default/params.toml
  ```

## Upstream sync

Ported from v7.5.0 → v7.6.0:

- edit-this-post link
- theme preference persistence
- PWA update notification redesign
- giscus theme synchronisation
- Firefox `mailto` fix
- iOS safe-area fix

Pending: none.

Divergences updated: D-09 (footer branding) unchanged, D-10 (generated assets)
unchanged.

## Upgrade

```bash
hugo mod get -u github.com/cpalau/chirpy-hugo@vX.Y.Z
node scripts/check-config.mjs
```

No manual step required.

## Credits

Upstream work by Cotes Chung and the Chirpy contributors.
```

### 4.3 Rules for writing them

- English, present tense, user-facing language.
- Name the symptom before the fix; users search for symptoms.
- Every breaking change has a runnable migration command.
- Never link only to the diff.
- Keep the changelog and the release notes consistent (the release notes are
  the changelog section plus the upstream/parity/upgrade sections).

---

## 5. Release procedure

### 5.1 Pre-flight

- [ ] `main` is green: Gates G1–G9.
- [ ] `CHANGELOG.md` `[Unreleased]` is complete.
- [ ] `ports.yml` records the current upstream tag and sha.
- [ ] `data/theme.yaml` and the tag match (checked by `test:release`).
- [ ] `params.theme_version` still matches the upstream pin.
- [ ] The visual snapshots in the PR were reviewed.

### 5.2 Cut the release

```bash
# 1. Move Unreleased to a version section
node scripts/release.mjs --prepare X.Y.Z   # CHANGELOG, package.json, data/theme.yaml

# 2. Verify
npm run test:fast && npm run test:parity && npm run test:plugins

# 3. Commit and tag
git add CHANGELOG.md package.json data/theme.yaml
git commit -m "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --follow-tags
```

### 5.3 Publish

- Create the GitHub Release from the tag.
- Title: `Chirpy Hugo vX.Y.Z`.
- Body: the release notes from §4.2.
- Attach nothing (Hugo Modules consume the tag).

### 5.4 Post-flight

- [ ] `hugo mod get -u github.com/cpalau/chirpy-hugo@vX.Y.Z` works from a clean site.
- [ ] Gate G9 against the published tag.
- [ ] Announcement (if any) links to the release, not to the commits.

---

## 6. Hotfixes

For a security or parity bug on a released version:

1. Branch from the tag: `hotfix/X.Y.Z`.
2. One `fix` commit, plus the changelog entry.
3. Cut `X.Y.(Z+1)` following §5.
4. Release notes explain the impact, the affected versions and the mitigation.

Never force-push or move a published tag.

---

## 7. Upstream sync releases

A sync release (see [`UPSTREAM.md`](UPSTREAM.md)) uses the same process plus:

- `chore(upstream): sync to vA.B.C` commit.
- An "Upstream sync" section listing every ported change.
- An explicit statement of what was **not** ported and why.
- Updated `D-xx` divergences if upstream changed behaviour.

---

## 8. Automation (optional)

`semantic-release` can derive the version and the changelog from the commits,
but it does **not** write the upstream-sync, parity or upgrade sections. If it
is adopted:

- it runs on `main` after CI,
- it creates the tag and the GitHub Release draft,
- a human must complete §4.1 sections 6–8 before publishing.

Until then, releases are manual and gated by the checklist in §5.

---

## 9. Definition of Done for a release

- [ ] Complete release notes (all nine sections).
- [ ] `CHANGELOG.md` updated and linked.
- [ ] Version consistent in tag, `package.json` and `data/theme.yaml`.
- [ ] Gates G1–G9 green on the tag.
- [ ] Upgrade instructions tested on a clean site.
- [ ] Upstream pin recorded.
