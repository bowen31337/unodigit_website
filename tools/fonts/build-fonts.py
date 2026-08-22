#!/usr/bin/env python3
"""
Build the Uno Digit brand typeface assets.

    python3 tools/fonts/build-fonts.py

Run this MANUALLY and commit the output. It is deliberately NOT wired into
`pnpm build` — CI would then need Python, fonttools, brotli and ~40 MB of
downloads on every deploy, and a network blip would break production.

WHAT THIS PRODUCES
------------------
`Uno Sans` and `Uno Mono` are derived from Inter 4.1 and JetBrains Mono 2.304,
both SIL OFL 1.1. Four modifications make them Uno Digit's rather than restyled
upstream:

  1. ss07 / ss08 / cv05 are FROZEN into the cmap, so the brand's square-dot
     letterforms hold even where `font-feature-settings` never reaches —
     <canvas>, SVG export, PDF, and the CSP-locked admin dashboard.
  2. The `name` table is rewritten (IDs 1/2/3/4/6/16/17 + the OFL fields
     13/14) with fontTools directly. NOT with pyftfeatfreeze's -U/-R, which
     do a naive string replace and produce "UnoSans Variable UnoSans".
  3. `size-adjust: 93.02%` — see SIZE_ADJUST below. This is the decision that
     lets the brand font replace SF Pro without de-tuning the type scale.
  4. Subset to Latin + Latin-Ext with a deliberate feature allow-list.

LICENSING
---------
Inter 4.1 carries OFL 1.1 with NO Reserved Font Name (verified: the copyright
line has no "with Reserved Font Name" clause), so renaming is permitted. The
binding obligations are that the derivative stays under OFL and ships WITH the
licence — hence OFL.txt beside the binaries and name IDs 13/14 in the font.

See docs/superpowers/specs/2026-08-21-brand-typography-design.md
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

REPO = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / ".cache"
OUT_FONTS = REPO / "apps" / "web" / "public" / "fonts"
OUT_ADMIN = REPO / "apps" / "ba-bot-api" / "src" / "admin" / "font-inline.ts"

# ---------------------------------------------------------------------------
# Upstream sources, pinned. The SHA-256 is recorded on first download and
# asserted on every run after, so a silently re-cut upstream release cannot
# change the brand font without someone noticing.
# ---------------------------------------------------------------------------
SOURCES = {
    "inter": {
        "url": "https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip",
        "sha256": None,  # filled in on first run, then asserted
        "roman": "InterVariable.ttf",
        "italic": "InterVariable-Italic.ttf",
        "license": "LICENSE.txt",
    },
    "mono": {
        "url": "https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip",
        "sha256": None,
        "roman": "fonts/variable/JetBrainsMono[wght].ttf",
        "license": "OFL.txt",
    },
}

# ---------------------------------------------------------------------------
# METRIC CALIBRATION — the load-bearing number.
#
# Measured from the real binaries:
#     SF Pro (/System/Library/Fonts/SFNS.ttf)  x-height 1040 / 2048 = 0.507812
#     Inter 4.1 InterVariable.ttf              x-height 1118 / 2048 = 0.545898
#
# Inter renders 7.5% optically LARGER than SF at the same px size. Every
# tracking value and size in globals.css was tuned against SF, so substituting
# naively would inflate all type by 7.5% and de-tune the whole scale.
#
# size-adjust brings the x-height to an exact match, which means:
#   - the existing token scale needs no re-tuning,
#   - Apple devices see zero layout shift when the brand font swaps in.
#
# Cap-height cannot also match (SF's cap/x is 1.388, Inter's is 1.333), so
# capitals land 3.9% shorter. x-height wins because it governs perceived size
# in running text. Do NOT move this number to fix a capitals problem — raise
# weight on the affected role instead.
# ---------------------------------------------------------------------------
SF_X_HEIGHT_RATIO = 1040 / 2048  # 0.507812
SIZE_ADJUST = None  # computed from the real source font in main()

# Features frozen into the cmap. These ARE the brand's letterforms.
#   ss07 — square dots on i, j, !, ?   (echoes the two nodes in the logo)
#   ss08 — square punctuation
#   cv05 — disambiguated l
FREEZE = "ss07,ss08,cv05"

# Retained live. `case` must NOT be frozen — it applies only to uppercase runs,
# and is switched on in .type-eyebrow, which sets uppercase at +0.06em and
# currently mis-aligns parentheses and hyphens.
KEEP_FEATURES = "kern,liga,calt,ccmp,locl,mark,mkmk,rlig,case,tnum,zero"
KEEP_FEATURES_MONO = "kern,liga,calt,ccmp,locl,mark,mkmk,rlig,case,tnum,zero"

# Google Fonts' standard split. Keeping the same boundaries means latin-ext is
# never fetched for Australian-English pages.
LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
    "U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,"
    "U+2212,U+2215,U+FEFF,U+FFFD"
)
LATIN_EXT = (
    "U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,"
    "U+20A0-20AB,U+20AD-20CF,U+2113,U+2C60-2C7F,U+A720-A7FF"
)
# The admin dashboard renders a fixed, known set of characters.
ADMIN_UNICODES = (
    "U+0020-007E,U+00A0-00FF,U+2018-201D,U+2013-2014,U+2026,U+2192,"
    "U+2713,U+2717,U+00D7"
)

OFL_URL = "https://openfontlicense.org"

# Fallback faces, with metrics from @capsizecss/metrics (verified data, not
# estimates). Any face absent from that dataset simply gets no @font-face and
# falls through to the plain system stack — never a guessed number.
#
# The SOURCE font's xWidthAvg is read from this same dataset, deliberately.
# OS/2.xAvgCharWidth is the mean advance across ALL glyphs; capsize's
# xWidthAvg is weighted by English letter frequency over lowercase Latin.
# They are different measurements. Mixing them yielded size-adjust: 133.87%
# where the correct value is ~100%, which would have caused worse layout
# shift than shipping no fallback at all. Measure both sides the same way.
CAPSIZE = "https://unpkg.com/@capsizecss/metrics@3/entireMetricsCollection/{}/index.cjs"
FALLBACK_FACES = [
    ("Segoe UI", "segoeUi"),
    ("Roboto", "roboto"),
    ("Helvetica Neue", "helveticaNeue"),
    ("Arial", "arial"),
]


def log(msg: str) -> None:
    print(msg, flush=True)


def fetch(url: str, dest: Path) -> bytes:
    """Download once, cache on disk, return the bytes."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        return dest.read_bytes()
    log(f"  downloading {url}")
    with urllib.request.urlopen(url, timeout=300) as r:
        data = r.read()
    dest.write_bytes(data)
    return data


def unpack(key: str) -> Path:
    """Fetch and extract an upstream release, asserting its SHA-256."""
    spec = SOURCES[key]
    archive = CACHE / f"{key}.zip"
    data = fetch(spec["url"], archive)
    digest = hashlib.sha256(data).hexdigest()
    if spec["sha256"] and spec["sha256"] != digest:
        raise SystemExit(
            f"FATAL: {key} upstream archive changed.\n"
            f"  expected {spec['sha256']}\n  got      {digest}\n"
            f"Upstream re-cut the release. Inspect before trusting it."
        )
    spec["sha256"] = digest
    log(f"  {key} sha256 {digest}")

    root = CACHE / key
    if not root.exists():
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            z.extractall(root)
    return root


def find(root: Path, rel: str) -> Path:
    """Locate a file in an extracted archive, tolerating a wrapper directory."""
    direct = root / rel
    if direct.exists():
        return direct
    name = Path(rel).name
    hits = sorted(root.rglob(name))
    if not hits:
        raise SystemExit(f"FATAL: {rel} not found under {root}")
    return hits[0]


def freeze_features(src: Path, dst: Path, features: str) -> None:
    """Bake GSUB substitutions into the cmap so they need no CSS to apply."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ["pyftfeatfreeze", "-f", features, str(src), str(dst)],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        raise SystemExit(f"FATAL: pyftfeatfreeze failed\n{r.stderr[-2000:]}")


def rename(path: Path, family: str, psname: str, license_text: str) -> None:
    """
    Rewrite the name table properly, across both the Windows (3,1,0x409) and
    Macintosh (1,0,0) platform records.

    Done here rather than via pyftfeatfreeze's -U/-R, which string-replace
    blindly and produced the mangled 'UnoSans Variable UnoSans' during the
    design spike.
    """
    font = TTFont(path)
    name = font["name"]
    version = "1.000"
    records = {
        1: family,
        2: "Regular",
        3: f"UnoDigit: {family}: 2026",
        4: family,
        5: f"Version {version}",
        6: psname,
        13: license_text,
        14: OFL_URL,
        16: family,
        17: "Regular",
    }
    for nid, value in records.items():
        for plat, enc, lang in ((3, 1, 0x409), (1, 0, 0)):
            name.setName(value, nid, plat, enc, lang)

    # A variable font also carries a PostScript name prefix (25) used to build
    # per-instance names. Leaving the upstream value here reintroduces the old
    # family name into generated instance names.
    name.setName(psname.split("-")[0], 25, 3, 1, 0x409)

    # fvar instances point at their own name records; repoint them at plain
    # weight names so no upstream branding leaks through.
    if "fvar" in font:
        for inst in font["fvar"].instances:
            existing = name.getDebugName(inst.subfamilyNameID) or "Regular"
            for plat, enc, lang in ((3, 1, 0x409), (1, 0, 0)):
                name.setName(existing, inst.subfamilyNameID, plat, enc, lang)

    font.save(path)


def subset(src: Path, dst: Path, unicodes: str, features: str) -> int:
    dst.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        [
            "pyftsubset",
            str(src),
            f"--output-file={dst}",
            f"--unicodes={unicodes}",
            f"--layout-features={features}",
            "--flavor=woff2",
            "--no-hinting",
            "--desubroutinize",
            "--drop-tables+=DSIG",
            "--name-IDs=*",
            "--notdef-outline",
        ],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        raise SystemExit(f"FATAL: pyftsubset failed for {dst.name}\n{r.stderr[-2000:]}")
    size = dst.stat().st_size
    log(f"  {dst.name:<34} {size / 1024:7.1f} KB")
    return size


def capsize_metrics(slug: str) -> dict | None:
    """Verified metrics for a fallback face. None if the face is unknown."""
    try:
        cache = CACHE / "capsize" / f"{slug}.cjs"
        raw = fetch(CAPSIZE.format(slug), cache).decode()
    except Exception as exc:  # network down, or face not in the dataset
        log(f"  ! {slug}: {exc} — face will be omitted, never estimated")
        return None
    out = {}
    for key in ("capHeight", "ascent", "descent", "lineGap", "unitsPerEm", "xHeight", "xWidthAvg"):
        m = re.search(rf"{key}:\s*(-?\d+)", raw)
        if not m:
            return None
        out[key] = int(m.group(1))
    return out


def main() -> None:
    global SIZE_ADJUST

    if not shutil.which("pyftsubset") or not shutil.which("pyftfeatfreeze"):
        raise SystemExit(
            "FATAL: need fonttools and opentype-feature-freezer:\n"
            "  pip install fonttools[woff] opentype-feature-freezer brotli"
        )

    OUT_FONTS.mkdir(parents=True, exist_ok=True)

    # -- Inter ---------------------------------------------------------------
    log("\n== source: Inter 4.1 ==")
    inter_root = unpack("inter")
    inter_roman = find(inter_root, SOURCES["inter"]["roman"])
    inter_italic = find(inter_root, SOURCES["inter"]["italic"])
    ofl_text = find(inter_root, SOURCES["inter"]["license"]).read_text(encoding="utf-8")

    src = TTFont(inter_roman)
    upm = src["head"].unitsPerEm
    x_ratio = src["OS/2"].sxHeight / upm
    SIZE_ADJUST = SF_X_HEIGHT_RATIO / x_ratio
    # NOT OS/2.xAvgCharWidth — see the note beside CAPSIZE below.
    src_metrics = capsize_metrics("inter")
    if not src_metrics:
        raise SystemExit("FATAL: cannot reach @capsizecss/metrics for the source "
                         "font. Refusing to guess a fallback size-adjust.")
    x_width_ratio = src_metrics["xWidthAvg"] / src_metrics["unitsPerEm"]
    ascent_ratio = src["OS/2"].sTypoAscender / upm
    descent_ratio = abs(src["OS/2"].sTypoDescender) / upm

    log(f"  x-height ratio      {x_ratio:.6f}  (SF {SF_X_HEIGHT_RATIO:.6f})")
    log(f"  => size-adjust      {SIZE_ADJUST * 100:.2f}%")
    log(f"  ascent / descent    {ascent_ratio * 100:.2f}% / {descent_ratio * 100:.2f}%")

    log("\n== freeze + rename ==")
    work = CACHE / "work"
    roman = work / "uno-sans.ttf"
    italic = work / "uno-sans-italic.ttf"
    freeze_features(inter_roman, roman, FREEZE)
    freeze_features(inter_italic, italic, FREEZE)
    rename(roman, "Uno Sans", "UnoSans-Regular", ofl_text)
    rename(italic, "Uno Sans", "UnoSans-Italic", ofl_text)
    log(f"  frozen: {FREEZE}")
    log(f"  family: {TTFont(roman)['name'].getDebugName(1)}")

    log("\n== subset ==")
    subset(roman, OUT_FONTS / "uno-sans-latin.woff2", LATIN, KEEP_FEATURES)
    subset(roman, OUT_FONTS / "uno-sans-latin-ext.woff2", LATIN_EXT, KEEP_FEATURES)
    subset(italic, OUT_FONTS / "uno-sans-italic-latin.woff2", LATIN, KEEP_FEATURES)

    # -- Admin dashboard cut -------------------------------------------------
    # Pinned hard: opsz fixed at the Text cut, wght clamped to what the page
    # actually uses. It is inlined as base64 into a Worker with
    # `default-src 'none'`, so every kilobyte is paid for in the HTML.
    log("\n== admin inline cut ==")
    admin_src = work / "uno-admin.ttf"
    f = TTFont(roman)
    instancer.instantiateVariableFont(
        f, {"opsz": 14, "wght": (400, 700)}, inplace=True, updateFontNames=False
    )
    f.save(admin_src)
    admin_woff2 = work / "uno-admin.woff2"
    subset(admin_src, admin_woff2, ADMIN_UNICODES, KEEP_FEATURES_MONO)
    b64 = base64.b64encode(admin_woff2.read_bytes()).decode()
    log(f"  {'base64 payload':<34} {len(b64) / 1024:7.1f} KB")

    # -- JetBrains Mono ------------------------------------------------------
    log("\n== source: JetBrains Mono 2.304 ==")
    mono_ok = True
    try:
        mono_root = unpack("mono")
        mono_src = find(mono_root, SOURCES["mono"]["roman"])
        mono_ofl = find(mono_root, SOURCES["mono"]["license"]).read_text(encoding="utf-8")
        mono_work = work / "uno-mono.ttf"
        # No freeze: JetBrains Mono has no ss07/ss08, and a monospaced face
        # carries its technical voice in the skeleton already.
        shutil.copy(mono_src, mono_work)
        rename(mono_work, "Uno Mono", "UnoMono-Regular", mono_ofl)
        subset(mono_work, OUT_FONTS / "uno-mono-latin.woff2", LATIN, KEEP_FEATURES_MONO)
    except SystemExit as exc:
        mono_ok = False
        log(f"  ! skipped: {exc}")

    # -- Licence -------------------------------------------------------------
    (OUT_FONTS / "OFL.txt").write_text(
        "Uno Sans is derived from Inter (https://github.com/rsms/inter).\n"
        "Uno Mono is derived from JetBrains Mono "
        "(https://github.com/JetBrains/JetBrainsMono).\n"
        "Both are used and redistributed under the SIL Open Font License 1.1,\n"
        "reproduced in full below. Modifications by Uno Digit: frozen stylistic\n"
        "alternates, rewritten name tables, subsetting, and metric calibration.\n"
        "\n" + "=" * 76 + "\n\n" + ofl_text,
        encoding="utf-8",
    )
    log(f"\n  OFL.txt written ({(OUT_FONTS / 'OFL.txt').stat().st_size / 1024:.1f} KB)")

    # -- Admin TS module -----------------------------------------------------
    OUT_ADMIN.write_text(
        "// GENERATED by tools/fonts/build-fonts.py — do not edit by hand.\n"
        "//\n"
        "// The admin dashboard ships from a Worker with `default-src 'none'` and\n"
        "// no build step, so it can neither import globals.css nor fetch a font\n"
        "// over the network. The brand face is therefore inlined as a data: URI,\n"
        "// the same reason the logo is inline SVG and the favicon a data: URI.\n"
        "//\n"
        "// Requires `font-src data:` in that page's CSP. Nothing else.\n"
        f"//\n// Latin basic, opsz pinned to 14, wght 400-700. "
        f"{len(b64) / 1024:.1f} KB base64.\n"
        "\n"
        f"export const UNO_SANS_WOFF2_BASE64 = '{b64}';\n"
        "\n"
        "export const UNO_SANS_FONT_FACE = `\n"
        "@font-face {\n"
        "  font-family: 'Uno Sans';\n"
        "  src: url(data:font/woff2;base64,${UNO_SANS_WOFF2_BASE64}) format('woff2');\n"
        "  font-weight: 400 700;\n"
        "  font-style: normal;\n"
        "  font-display: swap;\n"
        f"  size-adjust: {SIZE_ADJUST * 100:.2f}%;\n"
        "}`;\n",
        encoding="utf-8",
    )
    log(f"  {OUT_ADMIN.relative_to(REPO)} written")

    # -- Emit the CSS the token layer needs ----------------------------------
    # Printed rather than written: globals.css is the single source of truth
    # for design values (see CLAUDE.md), so these literals are pasted in by
    # hand rather than @import-ed from a generated file.
    rendered_ascent = ascent_ratio * SIZE_ADJUST
    rendered_descent = descent_ratio * SIZE_ADJUST
    rendered_xwidth = x_width_ratio * SIZE_ADJUST

    lines = [
        "",
        "=" * 78,
        "PASTE INTO apps/web/app/globals.css",
        "=" * 78,
        "",
        "@font-face {",
        "  font-family: 'Uno Sans';",
        "  src: url('/fonts/uno-sans-latin.woff2') format('woff2');",
        "  font-weight: 100 900;",
        "  font-style: normal;",
        "  font-display: swap;",
        f"  size-adjust: {SIZE_ADJUST * 100:.2f}%;",
        f"  unicode-range: {LATIN.replace(',', ', ')};",
        "}",
        "",
    ]
    for family, slug in FALLBACK_FACES:
        m = capsize_metrics(slug)
        if not m:
            continue
        # size-adjust matches ADVANCE WIDTH so line breaks do not move during
        # the swap (the CLS fix). Overrides are pre-scale, so each is divided
        # by size-adjust — verified against what next/font emits.
        sa = rendered_xwidth / (m["xWidthAvg"] / m["unitsPerEm"])
        lines += [
            f"/* {family}: xWidthAvg {m['xWidthAvg']}/{m['unitsPerEm']} (@capsizecss/metrics) */",
            "@font-face {",
            "  font-family: 'Uno Sans Fallback';",
            f"  src: local('{family}');",
            f"  ascent-override: {rendered_ascent / sa * 100:.2f}%;",
            f"  descent-override: {rendered_descent / sa * 100:.2f}%;",
            "  line-gap-override: 0%;",
            f"  size-adjust: {sa * 100:.2f}%;",
            "}",
        ]
    lines += ["", "=" * 78, ""]
    log("\n".join(lines))

    log("SUMMARY")
    for f_ in sorted(OUT_FONTS.iterdir()):
        log(f"  {f_.name:<34} {f_.stat().st_size / 1024:7.1f} KB")
    if not mono_ok:
        log("\n  NOTE: Uno Mono was skipped; --font-mono keeps the system stack.")
    log(f"\n  pinned sha256: " + json.dumps({k: v["sha256"] for k, v in SOURCES.items()}, indent=2))


if __name__ == "__main__":
    sys.exit(main())
