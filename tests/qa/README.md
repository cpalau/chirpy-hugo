# Upstream questions (Q1–Q4)

Four behaviours that could not be assumed, so they are measured against real
Jekyll and real Hugo and frozen. Each script fails when either side changes, which
forces a human to re-read the conclusion instead of silently shipping a
regression.

```bash
node tests/qa/q1-word-count.mjs
node tests/qa/q2-jsonify.mjs
node tests/qa/q3-page-order.mjs
node tests/qa/q4-sort-natural.mjs

node tests/qa/q1-word-count.mjs --update   # only after re-reading the conclusion
```

Each script prints a table, compares against `expected/<question>.json` and exits
non-zero on drift. The Hugo side runs in `.out/qa/`, the Ruby side uses the
oracle's bundle (`tests/oracle/Gemfile`), so no extra setup is needed.

## Answers

| # | Question | Answer | Consequence |
|---|---|---|---|
| Q1 | `number_of_words: 'auto'` vs `.WordCount` | Equal for Latin, Cyrillic and emoji; **different for CJK** (Jekyll counts each Han/Kana/Hangul character). | Read time uses `_partials/word-count.html`, never `.WordCount`. The ported partial matches 13/13 cases. |
| Q2 | `jsonify` escaping | Hugo escapes `<`, `>`, `&`, U+2028 and U+2029; Ruby does not. Everything else is byte-identical. | JSON outputs use the five-substitution wrapper (`NORMALIZER`), which matches 11/11. |
| Q3 | `page.previous`/`page.next` vs `.Prev`/`.Next` | Same direction (previous = older, next = newer), **different scope**: Hugo's `.Prev` walks every regular page, so `about` becomes a neighbour of the oldest post. | Use `.PrevInSection` / `.NextInSection`. |
| Q4 | Is `sort_natural` reproducible? | Yes. It is `String#casecmp`: ASCII-only case folding, then byte order, stable. Hugo's `sort` uses a Unicode collator and `lower` folds non-ASCII. | A stable insertion sort keyed on an ASCII-only fold matches 21/21. D-11 is closed. |

Q5–Q8 are answered in their own phases: Q5 (git info) and Q6 (`@use … with`)
in F1, Q7 (Chroma vs Rouge) in F0.5, Q8 (`swconf.js` clock) in F6.

## Why these are tests and not notes

A note rots silently. These scripts encode the *measurement*, so the answer is
only allowed to change with a reviewed diff: the frozen file changes, and whoever
changes it must also edit the conclusion in `docs/AUDIT.md` §9.1 and the affected
rows of `docs/FEATURES.md`.

## Ported fragments

The scripts carry the three fragments the theme will use. They are duplicated
here on purpose: the harness must prove the fragment before it becomes a
template, and a copy that silently diverges from the shipped partial would be
worse than no test.

| Fragment | Becomes |
|---|---|
| `WC_PARTIAL` (q1) | `layouts/_partials/word-count.html` |
| `NORMALIZER` (q2) | the `jsonify` wrapper used by `search.json` |
| `SORT_PARTIAL` (q4) | `layouts/_partials/sort-natural.html` |
