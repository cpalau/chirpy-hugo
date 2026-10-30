# Starter site

A minimal, working site that uses `chirpy-hugo`. Copy this directory, or use it
as the reference for what a site must declare itself.

```bash
# from a checkout of the theme, with the starter copied to ./mysite
cd mysite
hugo server --themesDir ../..
```

## What is here

| Path | Why |
|---|---|
| `hugo.toml` | the settings Hugo does not inherit from a theme (D-07) |
| `content/` | one post and the two optional tab pages |
| `data/` | author, contact, share and media data: site-owned, neutral defaults |
| `static/img/social-preview.png` | neutral Open Graph image; replace it with your own |

Everything else — layouts, styles, scripts, translations, parameters — comes
from the theme. `[params]` can be left empty; every option has a default. The
starter does set `social_preview_image` so a new site has an `og:image` from the
first build; point it at your own card when you have one.

## Install the theme

Pick one:

```bash
# Hugo Module (recommended)
hugo mod init example.com/mysite
hugo mod get github.com/cpalau/chirpy-hugo

# Git submodule
git submodule add https://github.com/cpalau/chirpy-hugo themes/chirpy-hugo

# Local checkout
hugo server --themesDir ../..
```
