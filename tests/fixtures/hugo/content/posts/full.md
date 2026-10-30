---
title: "Fixture 1: full post"
date: 2026-01-01T09:00:00Z
lastmod: 2026-01-03T12:30:00Z
author: example
description: "A post that exercises the complete header: cover image, LQIP, table of contents, last modification date, related posts, navigation, edit link and pageviews."
categories: ["guides", "advanced"]
tags: ["alpha", "beta"]
image:
  path: /assets/img/fixtures/cover.png
  alt: "Cover image for fixture 1"
  lqip: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==
toc: true
---

## Introduction

This fixture exists to exercise the whole post header and footer at once, and
to give the parity harness a page with every optional element enabled.

### What it covers

- A cover image declared in the front matter, with a low-quality image
  placeholder and an alternative text.
- A table of contents generated from the `h2` and `h3` headings.
- A last modification date that differs from the publication date.
- An edit link, a pageview counter and a comments block.

{{< img src="/assets/img/fixtures/img-normal.png" alt="A plain body image" >}}

### Inline elements

Text with **bold**, *italic*, ~~strikethrough~~, `inline code`, an
[external link](https://example.com/external) and a [link to another
post](/posts/code/).

## Conclusion

The footer of this page carries the categories, the tags, the license notice,
the sharing buttons, the related posts and the navigation to the neighbouring
posts.
