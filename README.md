<!-- markdownlint-disable-next-line -->
<div align="center">

  <!-- markdownlint-disable-next-line -->
  # Chirpy Hugo Theme

  A minimal, responsive, and feature-rich Hugo theme for technical writing.

  A port of the Chirpy Jekyll theme that renders the same HTML, and therefore
  the same pixels.

  [![CI][badge-ci]][ci]&nbsp;
  [![GitHub license][badge-license]][license]&nbsp;
  [![Release][badge-release]][release]&nbsp;
  [![Demo][badge-demo]][demo]

  [**Live Demo** →][demo]

  [![Devices Mockup](images/devices-mockup.png)][demo]

</div>

> **This is an adaptation.** `chirpy-hugo` is an independent Hugo port of
> [**Chirpy**][upstream], the Jekyll theme created by
> [Cotes Chung][cotes] and its contributors. All design, stylesheets,
> JavaScript, imagery and demo content are theirs; this repository
> reimplements the template layer and proves the output matches. It is not
> endorsed by the upstream author.
>
> Upstream is MIT licensed and that license is preserved here: see
> [`LICENSE`](LICENSE) and [`NOTICE.md`](NOTICE.md) for the full attribution.

## Features

- **Design & UX** - Responsive layout, Dark/Light modes, Localized UI language
  (33 locales), and Dark mode images.
- **Content Management** - Pinned posts, Hierarchical categories, Trending
  tags, Auto-generated Table of Contents, and Last modified dates.
- **Rich Text Support** - Syntax highlighting, Mathematical expressions,
  Mermaid diagrams & flowcharts, Prompts, and Embedded media.
- **Interactivity & Outreach** - Built-in search, Multiple comment systems
  (Disqus, Utterances, Giscus), Atom feeds, and sharing.
- **System & Optimization** - PWA support, integrated Web analytics, advanced
  SEO, and an Atom feed and sitemap generated as Hugo outputs.

Everything above is the upstream feature set. What this port adds is proof: a
[Jekyll oracle](tests/oracle) builds the same content, and the two outputs are
compared page by page.

### SEO beyond the original (opt-in)

The Jekyll original predates several things search engines now expect. This port
adds them **off by default**, so the rendered HTML stays byte-identical until a
site turns one on (see [`docs/SEO.md`](docs/SEO.md#11-beyond-upstream)):

- `hreflang` alternates and `x-default` for translated pages, and `dir="rtl"`
  for right-to-left languages — automatic, silent on monolingual LTR sites.
- `noindex` for hidden posts and for pages that ask for it.
- Feed autodiscovery, `BreadcrumbList` structured data, `article:section/tag/author`,
  an Open Graph image type and dimensions read from the asset, a character cap
  for the meta description, a JSON-LD image fallback, and a warning when the
  sitemap outgrows the 50,000-URL protocol limit.

Every one is validated against the Open Graph, Twitter card and schema.org
requirements, not only against Jekyll.

## Quick start

Requirements: **Hugo extended ≥ 0.150** (tested with 0.168). Node is only
needed for the verification harness, not to build a site.

```bash
hugo new site my-blog && cd my-blog
hugo mod init example.com/my-blog
hugo mod get github.com/cpalau/chirpy-hugo
```

Import the theme and copy the mandatory settings from
[`starter/hugo.toml`](starter/hugo.toml) — the sections Hugo does not merge from
a theme (`outputs`, `outputFormats`, `markup`, `menus`, `enableRobotsTXT`).
Everything else has a default: a site with an empty `params` table works.

A complete minimal site lives in [`starter/`](starter/); the demo in
[`exampleSite/`](exampleSite) mirrors [the upstream demo][upstream-demo] page by
page and is what the [live demo][demo] serves.

## Documentation

| Document | Contents |
|---|---|
| [`docs/CONFIG.md`](docs/CONFIG.md) | Every parameter, its default and the settings a site must declare |
| [`docs/SHORTCODES.md`](docs/SHORTCODES.md) | Prompts, filepaths, images and embeds, with the kramdown equivalents |
| [`docs/I18N.md`](docs/I18N.md) | The 33 locales and the generation contract |
| [`docs/UPSTREAM.md`](docs/UPSTREAM.md) | How to sync with a new Chirpy release |
| [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) | Every declared divergence (`D-01`…`D-21`) and why it cannot be reproduced |
| [`docs/TESTING.md`](docs/TESTING.md) | The nine gates: build, HTML, DOM contract, DOM, pixels, a11y, i18n, upstream, adoption |
| [`docs/PLAN.md`](docs/PLAN.md) | The plan and the Definition of Done |
| [`AGENTS.md`](AGENTS.md) | The rules a change must follow |
| [`docs/releases/`](docs/releases) | Release notes |

## Parity, measured

| Gate | Result |
|---|---|
| HTML (Gate 4) | **47/47** pages identical to Jekyll after canonicalization |
| Pixels (Gate 5) | **84/84** pairs identical outside three declared rectangles |
| Feed, sitemap, search, service worker, manifest | identical content to the Jekyll build |
| Adoption | fresh site, subdirectory `baseURL` and `HugoBasicExample` build warning-free |

Run the suite with `npm run test:build`, `test:html`, `test:contract`,
`test:parity`, `test:outputs`, `test:visual`, `test:a11y`, `test:i18n`,
`test:upstream`, `test:adoption`. The Jekyll oracle and every fixture live under
[`tests/`](tests).

## Contributing

Contributions — pull requests, issues and discussions — are welcome. Before
opening one, read [`AGENTS.md`](AGENTS.md): the DOM and the pixels are a
contract, and a change that moves either needs a measurement and, if it cannot
be avoided, a declared divergence. Every commit follows
[Conventional Commits](https://www.conventionalcommits.org/), and every change
adds a [`CHANGELOG.md`](CHANGELOG.md) entry.

## Credits

This project stands on the work of the Chirpy community:

- [**Chirpy**][upstream], created by [Cotes Chung][cotes] and contributors,
  MIT licensed. The stylesheets, JavaScript, vendored Bootstrap, favicons,
  demo prose and demo imagery come from there.
- The Jekyll ecosystem and the libraries Chirpy integrates.
- The avatar and favicon artwork sourced from ClipartMAX by the upstream
  project.

The Hugo template layer, the shortcodes, the migration and synchronization
tooling, and the verification harness are original work in this repository.

## License

MIT. The original copyright notice is preserved in [`LICENSE`](LICENSE) and the
attribution is detailed in [`NOTICE.md`](NOTICE.md).

[badge-ci]: https://img.shields.io/github/actions/workflow/status/cpalau/chirpy-hugo/ci.yml?logo=github
[badge-license]: https://img.shields.io/github/license/cpalau/chirpy-hugo?color=goldenrod
[badge-release]: https://img.shields.io/github/v/release/cpalau/chirpy-hugo?logo=github
[badge-demo]: https://img.shields.io/badge/demo-online-brightgreen
[ci]: https://github.com/cpalau/chirpy-hugo/actions/workflows/ci.yml
[license]: https://github.com/cpalau/chirpy-hugo/blob/main/LICENSE
[release]: https://github.com/cpalau/chirpy-hugo/releases
[demo]: https://cpalau.github.io/chirpy-hugo/
[upstream]: https://github.com/cotes2020/jekyll-theme-chirpy
[upstream-demo]: https://chirpy.cotes.page/
[cotes]: https://github.com/cotes2020
