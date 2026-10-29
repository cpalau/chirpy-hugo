#!/usr/bin/env node
/**
 * Q1 — Does Jekyll's `number_of_words: 'auto'` match Hugo's `.WordCount`?
 *
 * Answer (measured): **no** for CJK, yes everywhere else. Jekyll counts every
 * Han, Katakana, Hiragana and Hangul character as one word on top of the
 * non-CJK runs; Hugo counts whitespace-delimited tokens.
 *
 * The script also proves that the difference is fixable: `WC_PARTIAL` below is a
 * faithful port of Jekyll's algorithm and must agree with Jekyll on every case.
 * That partial becomes `layouts/_partials/word-count.html` in F4.
 */

import { hugo, main, ruby, table, versions } from './lib.mjs';

const CASES = {
  english: 'The quick brown fox jumps over the lazy dog.',
  punctuation: 'one, two; three... four — five',
  hyphens: 'well-known state-of-the-art re-entry',
  numbers: '1,234 5.6 42 3.14159',
  spanish: 'El niño añadió azúcar al café, ¿verdad?',
  cyrillic: 'Быстрая коричневая лиса прыгает через ленивую собаку.',
  emoji: 'Ship it 🚀 today 🎉',
  markup: 'bold and code and a link',
  cjk_ja: '日本語のテキストです。',
  cjk_zh: '这是一段中文文本。',
  cjk_ko: '한국어 텍스트입니다.',
  cjk_mixed: 'Hello 世界, this is a mixed sentence.',
  empty: '',
};

// Faithful port of Jekyll::Filters#number_of_words(input, "auto").
// Note the double backslashes: Go template string literals need `\\p`, not `\p`.
const WC_PARTIAL = String.raw`{{- $s := . -}}
{{- $cjk := findRE "[\\p{Han}\\p{Katakana}\\p{Hiragana}\\p{Hangul}]" $s -}}
{{- $runs := findRE "[^\\p{Han}\\p{Katakana}\\p{Hiragana}\\p{Hangul}\\s]+" $s -}}
{{- if eq (len $cjk) 0 -}}{{- len $runs -}}{{- else -}}{{- add (len $cjk) (len $runs) -}}{{- end -}}`;

const RUBY = `# frozen_string_literal: true
require "json"
require "jekyll"

cases = JSON.parse($stdin.read)
filter = Object.new.extend(Jekyll::Filters)
out = cases.transform_values do |text|
  { "split" => text.split.length, "auto" => filter.number_of_words(text, "auto") }
end
puts JSON.generate(out)
`;

function measure() {
  const jekyll = JSON.parse(ruby(RUBY, CASES));

  const files = { 'layouts/_partials/word-count.html': WC_PARTIAL };
  for (const [name, text] of Object.entries(CASES)) {
    files[`content/${name}.md`] = `---\ntitle: "${name}"\n---\n\n${text}\n`;
  }
  files['layouts/home.html'] =
    '{{ range .Site.RegularPages }}{{ .Title }}={{ .WordCount }}|{{ partial "word-count.html" .Plain }}\n{{ end }}';

  const html = hugo('q1', files);
  const hugoValues = {};
  for (const line of html.trim().split('\n')) {
    const [title, rest] = line.split('=');
    const [wordcount, partial] = rest.split('|');
    hugoValues[title.trim()] = { wordcount: Number(wordcount), partial: Number(partial) };
  }

  const cases = Object.keys(CASES).map((name) => ({
    name,
    chars: [...CASES[name]].length,
    jekyll_split: jekyll[name].split,
    jekyll_auto: jekyll[name].auto,
    hugo_wordcount: hugoValues[name].wordcount,
    hugo_partial: hugoValues[name].partial,
    wordcount_matches: jekyll[name].auto === hugoValues[name].wordcount,
    partial_matches: jekyll[name].auto === hugoValues[name].partial,
  }));

  table(cases.map((c) => [c.name, `${c.jekyll_auto} / ${c.hugo_wordcount} / ${c.hugo_partial}`]));
  console.log('  (jekyll_auto / hugo_wordcount / hugo_partial)');
  console.log(
    `\n  .WordCount matches ${cases.filter((c) => c.wordcount_matches).length}/${cases.length}; ` +
      `the ported partial matches ${cases.filter((c) => c.partial_matches).length}/${cases.length}`,
  );

  return {
    question: 'Q1: number_of_words auto vs .WordCount',
    versions: versions(),
    conclusion:
      '`.WordCount` is whitespace-based and diverges for CJK (each Han/Kana/Hangul ' +
      'character counts as one word in Jekyll). The ported partial ' +
      '(findRE \\p{Han}\\p{Katakana}\\p{Hiragana}\\p{Hangul}) matches Jekyll on every case. ' +
      'Read time must use the partial, never .WordCount.',
    cases,
  };
}

main('q1-word-count', measure);
