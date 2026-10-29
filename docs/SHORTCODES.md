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
| ` ```shell … ``` `<br>`{: .nolineno }` | ` ```shell {.nolineno} … ``` ` |
| ` ```shell … ``` `<br>`{: file="_config.yml" }` | ` ```shell {file="_config.yml"} … ``` ` |
| `![alt](/x.png){: .left }` | `![alt](/x.png){.left}` |
| `![alt](/x.png){: .light }` | `![alt](/x.png){.light}` |
| `![alt](/x.png){: .shadow }` | `![alt](/x.png){.shadow}` |

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

- The inner content is rendered as Markdown (use `{{% %}}` internally if the
  shortcode must render Markdown; the template decides).
- Do not nest prompts.
- The class name must stay `prompt-{type}`: `_sass/base/_typography.scss`
  depends on it.

---

## 3. `filepath`

Renders `<code class="filepath">`, matching upstream's `{: .filepath}`.

```go-html-template
Edit {{< filepath "_config.yml" >}} to change the timezone.
```

Output:

```html
Edit <code class="filepath">_config.yml</code> to change the timezone.
```

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

### 4.2 Filename label

````markdown
```yaml {file="_config.yml"}
timezone: Europe/Madrid
```
````

Matches upstream's `{: file="_config.yml" }`.

### 4.3 Start line

````markdown
```js {start_line=10}
const x = 1;
```
````

### 4.4 Supported attributes

| Attribute | Effect |
|---|---|
| `{.nolineno}` | hide line numbers |
| `{file="…"}` | filename label |
| `{start_line=N}` | first line number |
| `{linenos=inline\|table\|false}` | override the global mode |
| `{hl_lines=[…]}` | highlight specific lines (Chroma) |

The attribute list must be written in Goldmark's **prefixed** form
(`markup.goldmark.parser.attribute.block = true`), i.e. on the fence line.

---

## 5. Images

Hugo's built-in syntax supports attribute lists on images when
`markup.goldmark.parser.attribute.block` is enabled and the image is alone in a
paragraph:

```markdown
![Desktop view](/assets/img/mockup.png){.shadow}
```

Supported classes (identical to upstream):

| Class | Effect |
|---|---|
| `.light` | visible only in light mode |
| `.dark` | visible only in dark mode |
| `.left` | float left |
| `.right` | float right |
| `.shadow` | drop shadow |
| `.normal` | force no float |

The render hook `_markup/render-image.html` handles:

- `media_subpath` resolution,
- `cdn` prefixing,
- LQIP blur via the `lqip` attribute,
- `loading="lazy"` and `decoding="async"`.

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
