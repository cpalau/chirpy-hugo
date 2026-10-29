#!/usr/bin/env node
/**
 * Q2 — Does `jsonify` produce the same escaping as Jekyll's `jsonify`?
 *
 * Answer (measured): almost. Both escape `"`, `\`, control characters and
 * newlines identically, and both keep non-ASCII as raw UTF-8. Two differences:
 *
 *   1. Hugo escapes `<`, `>` and `&` as `\u003c`, `\u003e`, `\u0026`
 *      (Go's `encoding/json` HTML-safety); Ruby does not.
 *   2. Hugo escapes U+2028 and U+2029; Ruby emits them raw.
 *
 * The script proves that a five-substitution wrapper reproduces Ruby byte for
 * byte. `JSON_WRAPPER` becomes the `jsonify` used by `search.json` (F6).
 */

import { hugo, main, ruby, table, versions } from './lib.mjs';

const CASES = {
  plain: 'Fixture 1',
  quotes: 'He said "hi" and \'bye\'',
  backslash: 'C:\\path\\to\\file',
  newlines: 'line1\nline2\ttab',
  html: "<script>alert('x')</script> & <b>",
  ampersand: 'R&D and AT&T',
  unicode: 'áéíóú ñ 中文 🚀',
  separators: 'a\u2028b\u2029c',
  control: 'bell\u0007end',
  slashes: '/posts/a/ https://example.com/x',
  url: 'http://127.0.0.1:4001/posts/full/',
};

const RUBY = `# frozen_string_literal: true
require "json"
cases = JSON.parse($stdin.read)
out = cases.transform_values { |v| v.to_json }
puts JSON.generate(out)
`;

// Five substitutions: undo Go's HTML escaping and the JS line separators.
const NORMALIZER = String.raw`{{- $j := jsonify . -}}
{{- $j = replaceRE "\\\\u003c" "<" $j -}}
{{- $j = replaceRE "\\\\u003e" ">" $j -}}
{{- $j = replaceRE "\\\\u0026" "&" $j -}}
{{- $j = replaceRE "\\\\u2028" "\u2028" $j -}}
{{- $j = replaceRE "\\\\u2029" "\u2029" $j -}}
{{- $j | safeHTML -}}`;

function render(partial) {
  // A JSON output format renders with text/template, so nothing is HTML-escaped
  // — which is exactly how the theme will emit search.json.
  const files = {
    'hugo.toml': [
      'baseURL = "http://127.0.0.1:4001/"',
      'title = "q2"',
      'disableKinds = ["taxonomy", "term", "rss", "sitemap", "section"]',
      '[outputs]',
      '  home = ["json"]',
      '',
    ].join('\n'),
    'data/cases.json': JSON.stringify(CASES),
    'layouts/_partials/json.html': partial,
    'layouts/index.json':
      '{{ range $k, $v := hugo.Data.cases }}{{ $k }}\t{{ partial "json.html" $v }}\n{{ end }}',
  };
  const html = hugo('q2', files, { outFile: 'index.json' });
  const out = {};
  for (const line of html.trim().split('\n')) {
    const [key, value] = line.split('\t');
    out[key.trim()] = value;
  }
  return out;
}

function measure() {
  const jekyll = JSON.parse(ruby(RUBY, CASES));
  const raw = render(String.raw`{{ jsonify . }}`);
  const normalized = render(NORMALIZER);

  const cases = Object.keys(CASES).map((name) => ({
    name,
    input: CASES[name],
    jekyll: jekyll[name],
    hugo_jsonify: raw[name],
    hugo_normalized: normalized[name],
    identical_raw: jekyll[name] === raw[name],
    identical_normalized: jekyll[name] === normalized[name],
  }));

  table(
    cases.map((c) => [
      c.name,
      c.identical_raw ? 'same' : `raw differs: ${JSON.stringify(c.hugo_jsonify)}`,
    ]),
  );

  const rawMatches = cases.filter((c) => c.identical_raw).length;
  const normMatches = cases.filter((c) => c.identical_normalized).length;
  console.log(`\n  jsonify as-is: ${rawMatches}/${cases.length} identical`);
  console.log(`  with the wrapper: ${normMatches}/${cases.length} identical`);

  return {
    question: 'Q2: jsonify escaping vs Ruby JSON.generate',
    versions: versions(),
    conclusion:
      'Hugo escapes <, > and & as \\u003c/\\u003e/\\u0026 and U+2028/U+2029; Ruby ' +
      'emits them raw. Everything else is byte-identical. The five-substitution ' +
      'wrapper in tests/qa/q2-jsonify.mjs (NORMALIZER) reproduces Ruby exactly and ' +
      'must be used by every JSON output of the theme.',
    cases,
  };
}

main('q2-jsonify', measure);
