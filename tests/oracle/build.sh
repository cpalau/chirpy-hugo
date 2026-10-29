#!/usr/bin/env bash
# Build the Jekyll oracle: the HTML reference for the Hugo port.
#
#   bash tests/oracle/build.sh
#
# Output: .out/oracle
#
# Determinism rules (see docs/TESTING.md §6):
#   · JEKYLL_ENV=production  → the CSS entry uses main.bundle, which is the only
#     path that includes the purged Bootstrap. A development build would render
#     a theme we do not ship.
#   · TZ=UTC + LANG=C.UTF-8  → dates and collation are stable.
#   · no compress_html        → D-05 is verified by G1, not by G4.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/.out/oracle"

export JEKYLL_ENV=production
export TZ=UTC
export LANG=C.UTF-8
export BUNDLE_PATH="$HERE/vendor/bundle"
export BUNDLE_FROZEN=true

cd "$HERE"

if ! bundle check >/dev/null 2>&1; then
  echo "installing gems (first run)…" >&2
  bundle install
fi

rm -rf "$OUT"
bundle exec jekyll build --quiet --destination "$OUT"

# A build without the compiled stylesheet means the gem did not ship the
# purgecss artifact; fail loudly instead of producing a half-styled oracle.
test -f "$OUT/assets/css/jekyll-theme-chirpy.css" \
  || { echo "error: oracle CSS missing (theme gem broken?)" >&2; exit 1; }
test -f "$OUT/assets/js/dist/theme.min.js" \
  || { echo "error: oracle JS bundles missing (theme gem broken?)" >&2; exit 1; }

echo "oracle: $OUT"
