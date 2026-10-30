---
title: "Code, math and diagrams"
date: 2026-01-05T09:00:00Z
author: example
categories: ["Guides"]
tags: ["code", "math"]
math: true
mermaid: true
description: "The three renderers the theme wires up, and where the output comes from."
---

## Highlighted code

```go-html-template
{{ range .Site.RegularPages }}
  <a href="{{ .RelPermalink }}">{{ .Title }}</a>
{{ end }}
```

With a filename header:

```shell {file="sync.sh"}
hugo mod get -u github.com/cpalau/chirpy-hugo
```

## Math

Inline math: \(E = mc^2\). Display math:

$$
\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

## Diagram

```mermaid
graph LR
  A[Jekyll] --> B[HTML]
  B --> C[Hugo]
  C --> B
```
