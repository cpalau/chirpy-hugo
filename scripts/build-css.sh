#!/usr/bin/env bash
# Compile the theme CSS with Dart Sass. Output goes to static/ so it is served
# verbatim at /assets/css/ (D-13).
#
# Why not at build time: Hugo cannot inject `@use ... with ($theme: ...)` for a
# theme (the entry has to be a real file, and the include paths of a module are
# not exposed), and not every Hugo build ships Dart Sass — the Arch package does
# not. Consumers must not need Node or Sass, so the CSS ships precompiled, like
# the JS bundles (D-10).
#
# Requirements: dart-sass 1.107.0 (pin it, the output must be reproducible).
#   https://github.com/sass/dart-sass/releases
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SASS="${SASS:-sass}"

command -v "$SASS" >/dev/null || { echo "error: dart-sass not found (set SASS=…)" >&2; exit 1; }

cd "$ROOT"
mkdir -p static/assets/css
for mode in dual light dark; do
  case "$mode" in
    dual)  file="static/assets/css/jekyll-theme-chirpy.css" ;;
    light) file="static/assets/css/jekyll-theme-chirpy-light.css" ;;
    dark)  file="static/assets/css/jekyll-theme-chirpy-dark.css" ;;
  esac
  "$SASS" --no-source-map --style=compressed "assets/scss/entry-$mode.scss" "$file"
  printf '%-55s %s bytes\n' "$file" "$(wc -c < "$file")"
done
