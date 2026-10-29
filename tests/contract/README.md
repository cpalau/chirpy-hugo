# Contract

Two files define what "upstream" means for this project:

| File | Role |
|---|---|
| `ports.yml` | Human contract: the pin, and what happens to every upstream file. |
| `upstream-hashes.json` | Machine manifest: sha256 of every copied or transformed file, generated from the pin. |

## The pin

```yaml
upstream:
  repo: cotes2020/jekyll-theme-chirpy
  tag: v7.6.0
  sha: 152093879e6319dac342454d8df75a3c3572315f
  gem: jekyll-theme-chirpy
  gem_version: 7.6.0
```

Two sources are needed, because they are not the same set of files:

- the **tag** ships the sources (`_sass/`, `_javascript/`, `_data/`, `_includes/`, …);
- the **published gem** additionally ships the build artifacts that upstream
  git-ignores: `_sass/vendors/_bootstrap.scss` and the nine
  `assets/js/dist/*.min.js` bundles. The gem's copies of the sources are
  byte-identical to the tag (verified at pin time).

Artifacts are therefore **copied from the gem**, never rebuilt (D-10).

## Modes

| Mode | Meaning | Verified by |
|---|---|---|
| `copy` | upstream bytes kept verbatim | sha256 |
| `transform` | generated from upstream by a script | sha256 of the source |
| `manual` | reimplemented for Hugo | Gates G4/G5 |
| `retired` | absorbed by a Hugo mechanism, no file | review |
| `new` | Hugo-only file | review |

## Commands

```bash
node scripts/fetch-upstream.mjs --fetch     # download tag + gem into .out/upstream/
node scripts/fetch-upstream.mjs --check     # coverage + pin + hashes (offline after --fetch)
node scripts/fetch-upstream.mjs --generate  # rewrite upstream-hashes.json
```

`--check` fails when:

1. `ports.yml` and the manifest disagree on the pin;
2. an upstream file has no mapping and is not under `ignored:`;
3. the gem ships an artifact nobody declared with `source: gem`;
4. a manifest hash does not match the pinned tree;
5. a local copy that already exists differs from upstream.

Missing local targets are reported as **pending**, not as a failure: the theme
is built in phases, so `assets/`, `data/` and `i18n/` fill up over time. Gate G8
turns pending targets into a failure once the phase that creates them is closed.

## Adding an upstream file

Run `--generate` after editing `ports.yml`; never edit the manifest by hand.
If the new file is a template, map it to a Hugo target and a mode. If it is a
new gem-only artifact, declare it with `source: gem` and a `note` explaining
where it comes from.
