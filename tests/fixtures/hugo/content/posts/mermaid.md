---
title: "Fixture 5: mermaid"
date: 2026-01-05T09:00:00Z
author: example
description: "A Mermaid diagram rendered on the client."
categories: ["science"]
tags: ["diagram"]
mermaid: true
---

## Flowchart

```mermaid
graph TD
  A[Markdown] --> B{Goldmark}
  B -->|attribute lists| C[HTML]
  B -->|no IAL| D[Shortcodes]
  C --> E[Parity]
  D --> E
```

## Sequence

```mermaid
sequenceDiagram
  participant J as Jekyll
  participant H as Hugo
  J->>H: same HTML?
  H-->>J: measured, not asserted
```
