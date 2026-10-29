#!/usr/bin/env node
/**
 * Q4 — Can Liquid's `sort_natural` be reproduced in Hugo?
 *
 * Answer (measured): **yes**, but not with `sort`.
 *
 * Liquid implements `sort_natural` with `String#casecmp`: ASCII-only case
 * folding, then byte comparison. Hugo's `sort` uses a Unicode collator, so
 * digits, punctuation and accents land in a different order, and `lower` is not
 * a substitute either — it folds non-ASCII too, which swaps `Ávila` (C3 81) with
 * `árbol` (C3 A1).
 *
 * The reproduction is an explicit stable insertion sort keyed on an ASCII-only
 * fold. `lt` on strings in a Go template is a byte comparison, which is exactly
 * what `casecmp` does after folding. That also closes D-11.
 */

import { hugo, main, ruby, table, versions } from './lib.mjs';

const SEP = '\u0001';

const CORPUS = [
  'Zebra',
  'apple',
  'Ávila',
  'zeta',
  'Apple',
  'äpfel',
  '10',
  '2',
  '_x',
  'alpha',
  'árbol',
  'Zzz',
  'beta',
  'audio',
  'code',
  'design',
  'diagram',
  '中文',
  '🚀',
  '42',
  'ALPHA',
];

const RUBY = `# frozen_string_literal: true
require "json"
require "liquid"
klass = Class.new { include Liquid::StandardFilters }
list = JSON.parse($stdin.read)
puts JSON.generate(klass.new.sort_natural(list))
`;

// Stable insertion sort on an ASCII-only case fold. `lt` compares bytes.
const SORT_PARTIAL = String.raw`{{- $upper := split "ABCDEFGHIJKLMNOPQRSTUVWXYZ" "" -}}
{{- $lower := split "abcdefghijklmnopqrstuvwxyz" "" -}}
{{- $sorted := slice -}}
{{- range $item := . -}}
  {{- $key := $item -}}
  {{- range $i, $u := $upper -}}{{- $key = replace $key $u (index $lower $i) -}}{{- end -}}
  {{- $entry := dict "k" $key "v" $item -}}
  {{- $next := slice -}}
  {{- $placed := false -}}
  {{- range $existing := $sorted -}}
    {{- if and (not $placed) (lt $key $existing.k) -}}
      {{- $next = $next | append $entry -}}
      {{- $placed = true -}}
    {{- end -}}
    {{- $next = $next | append $existing -}}
  {{- end -}}
  {{- if not $placed -}}{{- $next = $next | append $entry -}}{{- end -}}
  {{- $sorted = $next -}}
{{- end -}}
{{- $out := slice -}}
{{- range $sorted -}}{{- $out = $out | append .v -}}{{- end -}}
{{- delimit $out "\u0001" -}}`;

function measure() {
  const jekyll = JSON.parse(ruby(RUBY, CORPUS));

  const files = {
    'data/corpus.json': JSON.stringify(CORPUS),
    'layouts/_partials/sort-natural.html': SORT_PARTIAL,
    'layouts/home.html': [
      `plain|{{ delimit (sort hugo.Data.corpus) "${SEP}" }}`,
      `lowered|{{ $l := slice }}{{ range hugo.Data.corpus }}{{ $l = $l | append (lower .) }}{{ end }}{{ delimit (sort $l) "${SEP}" }}`,
      `ported|{{ partial "sort-natural.html" hugo.Data.corpus }}`,
    ].join('\n'),
  };

  const lines = hugo('q4', files).trim().split('\n');
  const pick = (prefix) => lines.find((l) => l.startsWith(prefix)).slice(prefix.length).split(SEP);

  const plain = pick('plain|');
  const lowered = pick('lowered|');
  const ported = pick('ported|');

  const rows = [
    ['liquid', jekyll.join(' ')],
    ['hugo sort', plain.join(' ')],
    ['hugo sort(lower)', lowered.join(' ')],
    ['ported partial', ported.join(' ')],
  ];
  table(rows);

  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const result = {
    plain_matches: same(jekyll, plain),
    lowered_matches: same(jekyll, lowered),
    ported_matches: same(jekyll, ported),
  };

  console.log(`\n  plain sort: ${result.plain_matches ? 'matches' : 'differs'}`);
  console.log(`  lower-key sort: ${result.lowered_matches ? 'matches' : 'differs'}`);
  console.log(`  ported partial: ${result.ported_matches ? 'matches' : 'differs'}`);

  return {
    question: 'Q4: sort_natural reproduction',
    versions: versions(),
    conclusion:
      'sort_natural is String#casecmp: ASCII-only case folding + byte order, ' +
      'stable. Hugo sort uses a Unicode collator and lower folds non-ASCII, so ' +
      'neither matches. A stable insertion sort keyed on an ASCII-only fold with ' +
      'lt (byte comparison) matches exactly, which closes D-11.',
    corpus: CORPUS,
    liquid: jekyll,
    hugo_sort: plain,
    hugo_sort_lower: lowered,
    hugo_ported: ported,
    ...result,
  };
}

main('q4-sort-natural', measure);
