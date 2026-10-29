# Shortcodes and Authoring Syntax

Upstream Chirpy relies on kramdown attribute lists (IAL). Hugo's Goldmark does
not support them, so this theme replaces them with **native Hugo shortcodes**
(decision D1, divergence D-01).

The rendered HTML is identical; only the authoring syntax changes.

---

## 1. Migration cheat sheet

| Upstream (kramdown) | This theme (Hugo) |
|---|---|
| `` `_config.yml`{: .filepath} `` | `{{</* filepath "_config.yml" */>}}` |
| `> **Tip**: text`<br>`{: .prompt-tip }` | `{{</* prompt tip */>}}`<br>`**Tip**: text`<br>`{{</* /prompt */>}}` |
| ` ```shell … ``` `<br>`{: .nolineno }` | ` ```shell {.nolineno} … ``` ` — on the fence line |
| ` ```shell … ``` `<br>`{: file="_config.yml" }` | ` ```shell {file="_config.yml"} … ``` ` |
| `![alt](/x.png){: .left }` | `{{</* img src="/x.png" alt="alt" class="left" */>}}` |
| `![alt](/x.png){: .light }` | `{{</* img src="/x.png" alt="alt" class="light" */>}}` |
| `![alt](/x.png){: .shadow }` | `{{</* img src="/x.png" alt="alt" class="shadow" */>}}` |

Three of these are not cosmetic choices; they are the only forms that work.
Goldmark has no inline attributes at all, ignores attributes written after a
block, and does not render Markdown inside a plain shortcode. See
`COMPATIBILITY.md` D-01 for the measured evidence.

> The `{{</* … */>}}` notation above is only to keep this document from being
> rendered by Hugo itself. In real content, write `{{< filepath "_config.yml" >}}`.

---

## 2. `prompt`

Renders a blockquote with the `prompt-{type}` class, exactly like upstream.

```go-html-template
{{< prompt tip >}}
**Tip**: something useful.
{{< /prompt >}}
```

| Parameter | Values | Default |
|---|---|---|
| positional or `type` | `tip`, `info`, `warning`, `danger` | `info` |

Output:

```html
<blockquote class="prompt-tip">
  <p><strong>Tip</strong>: something useful.</p>
</blockquote>
```

Rules:

- The inner content is rendered as Markdown by the shortcode itself:
  `{{ .Inner | .Page.RenderString (dict "display" "block") }}`. Without
  `display: block`, Goldmark drops the `<p>` wrapper and the emitted DOM stops
  matching Jekyll.
- `{{% %}}` does **not** solve this: the wrapper element blocks the inner
  Markdown (measured, see D-01). Always use `{{< >}}` plus `RenderString`.
- Do not nest prompts.
- The class name must stay `prompt-{type}`: `_sass/base/_typography.scss`
  depends on it.

---

## 3. `filepath`

Renders an inline code span with the `filepath` class, matching upstream's
`{: .filepath}`.

```go-html-template
Edit {{< filepath "_config.yml" >}} to change the timezone.
```

Output:

```html
Edit <code class="language-plaintext filepath highlighter-rouge">_config.yml</code> to change the timezone.
```

All **three** classes are required, in that order. kramdown emits
`language-plaintext` and `highlighter-rouge` on every inline code span (G-39),
and `_sass/base/_syntax.scss` keys the inline-code background off
`code.highlighter-rouge` while `.filepath` cancels it. Emitting only
`class="filepath"` changes the rendering.

Notes:

- Escapes HTML by default; pass already-safe markup with `raw=true` only when
  the source is trusted.
- Do not wrap in backticks: the shortcode emits the `<code>` element.

---

## 4. Code blocks

### 4.1 Line numbers

Upstream enables line numbers globally for blocks, except `plaintext`,
`console` and `terminal`. That behaviour lives in
`layouts/_markup/render-codeblock.html`, not in content.

To disable them for one block:

````markdown
```shell {.nolineno}
command
```
````

An attribute list on a separate line after the closing fence is silently ignored
by Goldmark; the only valid place is the info string of the opening fence.

### 4.2 Filename label

````markdown
```yaml {file="_config.yml"}
timezone: Europe/Madrid
```
````

Matches upstream's `{: file="_config.yml" }`.

### 4.3 Start line — not supported

Upstream advertises `{: start_line="10" }`, but it is **broken in Jekyll itself**:
`refactor-content.html` mangles the gutter of any block that carries it
(`docs/AUDIT.md` G-38). Only the global `syntax_highlighter_opts.block.start_line`
default works, and it is always `1`.

The port therefore ignores per-block start lines, on purpose. Do not document or
use the attribute: reproducing a broken gutter is not parity worth having.

### 4.4 Supported attributes

| Attribute | Effect |
|---|---|
| `{.nolineno}` | hide line numbers |
| `{file="…"}` | filename label |
| `{hl_lines=[…]}` | highlight specific lines (Chroma) |

The attribute list must be written in Goldmark's **prefixed** form
(`markup.goldmark.parser.attribute.block = true`), i.e. on the fence line.
`{linenos=…}` is deliberately absent: line numbers are decided by the render hook
from the language (`plaintext`, `console`, `terminal` never get them), exactly as
upstream does, so a per-block override would only create differences.

---

## 5. Images

Goldmark has **no inline attribute list**, and the block attribute extension does
not apply to images: `![alt](/x.png){.shadow}` renders the braces as literal
text inside the paragraph. Images with classes therefore use the `img`
shortcode.

```markdown
{{</* img src="/assets/img/mockup.png" alt="Desktop view" class="shadow" */>}}
```

| Parameter | Values |
|---|---|
| `src` | local path or URL (goes through `cdn` and `media_subpath`) |
| `alt` | alternative text (required) |
| `class` | `left`, `right`, `light`, `dark`, `shadow`, `normal` |
| `width`, `height` | integers |
| `lqip` | base64 data URI for the blurred placeholder |
| `link` | `true` (default on non-home pages), `false` to disable the popup |

Supported classes are identical to upstream. The shortcode and the
`_markup/render-image.html` hook emit the same DOM:

- home: `<div class="preview-img …"><img …></div>`
- elsewhere: `<a href="src" class="popup img-link …"><img …></a>`

Both handle:

- `media_subpath` resolution,
- `cdn` prefixing,
- LQIP blur (`data-src`, `data-lqip`, `.blur`),
- `loading="lazy"`.

A plain `![alt](src)` still works: it goes through the render hook and gets the
wrapper, without extra classes.

---

## 6. Embeds

Each upstream `_includes/embed/*.html` becomes a shortcode with the same
parameter names.

```go-html-template
{{< embed-youtube id="dQw4w9WgXcQ" >}}
{{< embed-spotify type="track" id="4uLU6hMCjMI75M1A2tKUQC" >}}
{{< embed-bilibili bvid="BV1xx411c7mD" >}}
{{< embed-twitch channel="channelname" >}}
{{< embed-audio src="/audio/file.mp3" >}}
{{< embed-video src="/video/file.mp4" >}}
```

All of them honour `params.cdn` and `media_subpath`, and emit the same markup as
upstream so the SCSS and JS keep working.

---

## 7. Math and Mermaid

Per post:

```yaml
---
math: true
mermaid: true
---
```

- Math uses MathJax with `assets/js/data/mathjax.js` copied from upstream.
- Mermaid loads only when the flag is set, as upstream does.

---

## 8. Content converter

`scripts/convert-content.mjs` rewrites legacy kramdown syntax:

```bash
node scripts/convert-content.mjs --dry-run content/
node scripts/convert-content.mjs --write content/
```

Behaviour:

- Idempotent: running twice changes nothing.
- Reports every change with file and line.
- Never touches fenced code blocks' contents.
- Converts:
  - `` `x`{: .filepath} `` → `{{< filepath "x" >}}`
  - `> …` + `{: .prompt-X }` → prompt shortcode
  - fence + `{: .nolineno }` → `{.nolineno}` on the fence
  - fence + `{: file="…" }` → `{file="…"}` on the fence
  - `![…](…){: .class }` → `![…](…){.class}`
- Leaves anything it cannot convert untouched and reports it as manual work.

Exit codes: `0` success, `1` unconvertible constructs found (with `--strict`).

---

## 9. Writing conventions for this theme

1. One blank line around block shortcodes.
2. Prefer `{{< >}}` for HTML-producing shortcodes, `{{% %}}` only when the
   inner content must be rendered as Markdown by the outer renderer.
3. Never hard-code class names that the SCSS does not define.
4. Internal links use `{{< relref "post.md" >}}` or plain relative paths; never
   absolute URLs to your own site.
5. Headings that need a stable anchor can pin it: `## Título {#custom-id}`.
