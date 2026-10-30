---
title: "Writing content"
date: 2026-01-07T09:00:00Z
author: example
categories: ["Guides"]
tags: ["markdown"]
description: "Shortcodes, images and footnotes as the theme documents them."
---

## Shortcodes

The theme ships the upstream feature set as native Hugo shortcodes.

{{< prompt type="tip" >}}
Prompts keep their Markdown: **bold**, `code` and lists all render.
{{< /prompt >}}

Inline code carries the language class the stylesheet expects:
`syntax.scss` styles `code.highlighter-rouge`.

## Footnotes

Attribute lists are the one syntax that does not survive the move[^ial]. The
theme documents the equivalent shortcode instead.

[^ial]: kramdown writes them after the block; Goldmark has none.

## Links

An [external link](https://gohugo.io/) and an [internal one](/about/).
