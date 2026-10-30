# Example site

This is the demo deployed to <https://cpalau.github.io/chirpy-hugo/>.

It mirrors the upstream Chirpy demo ([chirpy.cotes.page](https://chirpy.cotes.page/))
so the two can be compared page by page:

| Page | Content |
|---|---|
| `/posts/text-and-typography/` | every writing feature: headings, lists, prompts, tables, code, math, Mermaid, images, video, footnotes |
| `/posts/writing-a-new-post/` | the authoring guide |
| `/posts/getting-started/` | installation and deployment |
| `/posts/customize-the-favicon/` | the favicon workflow |
| `/about/` | the theme description and feature list |

The prose is upstream's (MIT, see `../NOTICE.md`). Only the authoring syntax
changed: kramdown attribute lists became Hugo shortcodes through
`scripts/convert-content.mjs`. The images are vendored under `static/` so the
demo does not depend on the upstream CDN.

Run it locally:

```bash
hugo server -s exampleSite --themesDir ../.. --theme chirpy-hugo
```

The demo is not the template for a new site. `../starter/` is: neutral
identity, the mandatory configuration and one post.

## Comments

Comments use giscus, pointing at this repository's **Discussions** (category
`Announcements`, `pathname` mapping). The threads belong to
`cpalau/chirpy-hugo`, not to the upstream demo, so visitors' comments never
reach a third party.

GitHub requires one browser-only step: install the
[giscus app](https://github.com/apps/giscus/installations/new) on
`cpalau/chirpy-hugo`. Until it is installed the widget renders
"giscus is not installed on this repository". No redeploy is needed after the
installation; the widget starts working on the next page load.
