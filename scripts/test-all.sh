#!/usr/bin/env bash
# Run every gate and record the result for the pre-push hook.
#
# The marker ties the green run to the exact commit: the hook refuses to push a
# commit that has not been verified, and a stale marker (another HEAD) does not
# count. Keep this list in sync with docs/TESTING.md.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MARKER="$ROOT/.out/test-all.json"

run() {
  local name="$1"
  shift
  printf '\n== %s\n' "$name"
  if ! "$@"; then
    echo "GATE FAILED: $name" >&2
    exit 1
  fi
}

run "build fixture" npm run -s build:fixture
run "build integrity" npm run -s test:build
# Browser gates can lose their Chrome tab when the machine is short on memory.
run "lighthouse" bash -c 'npm run -s test:perf || npm run -s test:perf'
run "html" npm run -s test:html
run "outputs" npm run -s test:outputs
run "seo demo" npm run -s test:seo:demo
run "seo extensions" npm run -s test:seo:ext
run "lcp" npm run -s test:lcp
run "deploy" npm run -s test:deploy
run "contract" npm run -s test:contract
run "parity" npm run -s test:parity
# G5 was outside this list, so a pixel regression shipped for several
# releases while every other gate stayed green.
run "visual" npm run -s test:visual
run "config" npm run -s test:config
run "vendor" npm run -s test:vendor
run "i18n" npm run -s test:i18n
run "qa" npm run -s test:qa
run "release" npm run -s test:release
run "ui" bash -c 'npm run -s test:ui || npm run -s test:ui'
run "a11y" npm run -s test:a11y

sha="$(git rev-parse HEAD)"
mkdir -p "$(dirname "$MARKER")"
printf '{"sha":"%s","date":"%s"}\n' "$sha" "$(date -Is)" > "$MARKER"
echo
echo "all gates green for ${sha:0:7}"
