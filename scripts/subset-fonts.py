#!/usr/bin/env python3
"""Subsetea las fuentes del tema a lo que usa el sitio.

- FontAwesome (solid/regular/brands): a los iconos que aparecen en el HTML.
- Fuentes de texto (Source Sans Pro, Lato): al rango latino + los caracteres
  que realmente aparecen en las páginas.

Uso (con el sitio ya construido):
    uv run --with fonttools --with brotli scripts/subset-fonts.py \
        --html ~/proyectos/blog-chirpy/public \
        --fonts static/assets/lib/fontawesome-free \
        --fonts static/assets/lib/fonts

Es idempotente: si el subconjunto ya está aplicado, el resultado no cambia.
"""
from __future__ import annotations

import argparse
import html as html_mod
import io
import re
import sys
from pathlib import Path

from fontTools import subset

FA_CLASS = re.compile(r"\b(fa-[a-z0-9-]+)\b")
# Font Awesome 6: `.fa-angle-left{--fa:"\f104"}` (uno o varios selectores)
FA_BLOCK = re.compile(r'([^{}]+)\{--fa:"\\([0-9a-fA-F]+|.)"')
TAG = re.compile(r"<script.*?</script>|<style.*?</style>|<[^>]+>", re.S)
# Latín básico + extendido + puntuación: cubre español y Europa.
LATIN = list(range(0x0000, 0x0180)) + list(range(0x2000, 0x2070)) + [0x20AC, 0x2122]
SKIP_CLASSES = {"fa-fw", "fa-solid", "fa-regular", "fa-brands", "fa-lg", "fa-xs", "fa-sm"}


def html_text_and_classes(root: Path) -> tuple[str, set[str]]:
    text, classes = [], set()
    for f in root.rglob("*.html"):
        raw = f.read_text(errors="ignore")
        classes.update(FA_CLASS.findall(raw))
        text.append(html_mod.unescape(TAG.sub(" ", raw)))
    return "".join(text), classes


def subset_font(path: Path, unicodes: set[int], label: str) -> tuple[int, int]:
    before = path.stat().st_size
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.drop_tables += ["DSIG"]
    font = subset.load_font(str(path), opts)
    cmap: set[int] = set()
    for table in font["cmap"].tables:
        cmap.update(table.cmap.keys())
    keep = unicodes & cmap
    if not keep:
        print(f"  ! {label}: nada que conservar", file=sys.stderr)
        return before, before
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=keep)
    sub.subset(font)
    buf = io.BytesIO()
    subset.save_font(font, buf, opts)
    data = buf.getvalue()
    if len(data) < before * 0.98:
        path.write_bytes(data)
    after = path.stat().st_size
    print(f"  {label}: {before/1024:.0f} KB -> {after/1024:.0f} KB ({len(keep)} glifos)")
    return before, after


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", type=Path, required=True)
    ap.add_argument("--fonts", type=Path, action="append", required=True)
    args = ap.parse_args()

    text, classes = html_text_and_classes(args.html)
    print(f"HTML: {len(classes)} clases fa-*, {len(set(text))} caracteres distintos")

    total_before = total_after = 0
    for root in args.fonts:
        css = list(root.glob("**/*.css"))
        icon_map: dict[str, str] = {}
        for c in css:
            for selectors, cp in FA_BLOCK.findall(c.read_text(errors="ignore")):
                for name in FA_CLASS.findall(selectors):
                    icon_map.setdefault(name, cp)
        def cp_of(v: str) -> int:
            return int(v, 16) if re.fullmatch(r"[0-9a-fA-F]+", v) else ord(v)

        used_cp = {cp_of(icon_map[c]) for c in classes if c in icon_map}
        missing = sorted(c for c in classes if c not in icon_map and c not in SKIP_CLASSES)
        if missing:
            print(f"  aviso: clases sin codepoint conocido: {missing[:8]}")

        for font in sorted(root.glob("**/*.woff2")):
            name = font.name
            if name.startswith("fa-"):
                if name.startswith("fa-v4compat"):
                    continue
                b, a = subset_font(font, used_cp | {0x20, 0xA0}, name)
            elif root.name == "fonts":
                chars = {ord(ch) for ch in text if ch.strip()}
                b, a = subset_font(font, chars | set(LATIN), name)
            else:
                continue
            total_before += b
            total_after += a

    print(f"\nTotal: {total_before/1024/1024:.2f} MB -> {total_after/1024/1024:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
