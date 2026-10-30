---
title: "Welcome"
date: 2026-01-02T09:00:00Z
author: example
categories: ["Guides"]
tags: ["hugo", "chirpy"]
pin: true
description: "What this demo shows, and how to run it."
---

This site is the demo of **chirpy-hugo**, a Hugo port of the Jekyll theme
Chirpy. It is a normal Hugo site: the theme provides the layout, the demo
provides the content.

## Run it locally

```shell
hugo server --themesDir ../.. --theme chirpy-hugo
```

## What to look at

- the pinned post at the top of the home page;
- categories and tags in the sidebar;
- the archive page, grouped by year;
- a post with code, math and a diagram.

{{< prompt tip >}}
**Tip**: the theme ships the upstream stylesheet and JavaScript unchanged, so
everything behaves like the Jekyll original.
{{< /prompt >}}

## A table

| Feature | Jekyll | Hugo |
|---|---|---|
| Templates | Liquid | Go templates |
| Highlighting | Rouge | Chroma |
| Data files | `_data` | `data` |
