---
title: "Fixture 9: tables and footnotes"
date: 2026-01-09T09:00:00Z
author: example
description: "Wide tables that must scroll, footnotes with the Chirpy backlink, and internal and external links."
categories: ["guides"]
tags: ["tables", "Zebra"]
---

## A wide table

| Feature | Jekyll | Hugo | Notes |
|---|---|---|---|
| Template language | Liquid | Go templates | Different syntax, same output |
| Highlighting | Rouge | Chroma | The DOM must be rebuilt |
| Attribute lists | kramdown IAL | none | Shortcodes instead |
| Pagination | jekyll-paginate | native | Different page path defaults |
| Feed | hand-written Atom | output format | Same bytes |

## A table with alignment

| Left | Center | Right |
|:-----|:------:|------:|
| a | b | c |
| 1 | 2 | 3 |

## Footnotes

Jekyll and Hugo disagree about attribute lists[^ial], and about how code is
highlighted[^rogue]. Both differences are measurable[^measure].

[^ial]: kramdown writes the attribute list after the block; Goldmark has no
    inline attributes at all.

[^rogue]: Rouge and Chroma produce different markup around the same tokens.

[^measure]: The parity harness compares the rendered DOM, not the source.

## Links

An [internal link to another fixture](/posts/tables-footnotes/), an
[external link](https://gohugo.io/templates/shortcode/) and an
[anchor link](#a-wide-table).
