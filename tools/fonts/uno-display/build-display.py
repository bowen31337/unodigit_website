#!/usr/bin/env python3
"""
Compile Uno Display from the parametric system in glyphs.py.

    python3 tools/fonts/uno-display/build-display.py

OUTPUTS
-------
  masters/UnoDisplay-{Light,Regular,Medium,Bold}.otf  print — InDesign, Illustrator
  masters/uno-display-{300,400,500,700}.woff2         web
  masters/specimen.html                               for judging it by eye

WHY FOUR STATIC WEIGHTS AND NOT A VARIABLE FONT
-----------------------------------------------
A variable font needs interpolatable masters: identical contour count, point
count and point order at every weight. This family is built with BOOLEAN
operations, so a shape that merges at Bold may stay separate at Light and the
outlines are structurally different between weights. That is not a defect of
the drawing, it is what booleans do — and forcing interpolation would mean
abandoning the construction system that makes the letterforms good.

Uno Sans (the text face) carries the variable axes. Display ships static.
That division is normal for a brand type system.

WHY CFF/OTF RATHER THAN TRUETYPE
--------------------------------
The construction is cubic throughout — circles are cubic beziers with the
standard 0.5523 constant. CFF stores cubics natively, so nothing is
approximated. Converting to quadratic for TTF would introduce error into
exactly the curves this face is built from. Every browser that supports woff2
supports CFF inside it.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib import TTFont

sys.path.insert(0, str(Path(__file__).resolve().parent))

import glyphs as G  # noqa: E402

HERE = Path(__file__).resolve().parent
# NOT "dist": .gitignore line 11 ignores any directory named dist, which would
# have silently excluded the print masters from the repo — the exact files the
# brand needs for InDesign and Illustrator. "masters" is also the correct term.
DIST = HERE / "masters"
REPO = HERE.parents[2]
WEB_FONTS = REPO / "apps" / "web" / "public" / "fonts"

VERSION = "1.000"
FAMILY = "Uno Display"
DESIGNER = "Uno Digit"
FOUNDRY_URL = "https://unodigit.com.au"

# Kerning. A display face lives or dies on this — it is used at 80px in a
# logotype where every gap is visible. Values are in em units at 1000 upm.
# Only pairs that actually misfit are listed; blanket kerning makes type worse.
KERN_PAIRS = [
    (["A"], ["V", "W", "Y"], -58), (["V", "W", "Y"], ["A"], -58),
    (["A"], ["T"], -46), (["T"], ["A"], -46),
    (["F", "P"], ["A"], -40), (["A"], ["v", "w", "y"], -34),
    (["T"], ["a", "c", "e", "o", "s", "u", "r", "w", "y"], -84),
    (["V"], ["a", "c", "e", "o", "s", "u"], -50),
    (["W"], ["a", "c", "e", "o", "s", "u"], -40),
    (["Y"], ["a", "c", "e", "o", "s", "u"], -70),
    (["L"], ["T", "V", "W", "Y"], -76), (["L"], ["y"], -40),
    (["P"], ["comma", "period"], -96),
    (["F", "T", "V", "W", "Y"], ["comma", "period"], -80),
    (["r"], ["comma", "period"], -50),
    (["f"], ["comma", "period"], -30),
    (["o", "c", "e", "b", "p"], ["v", "w", "y", "x"], -22),
    (["v", "w", "y"], ["comma", "period"], -60),
    (["one"], ["one"], -30),
    (["r"], ["a", "c", "e", "o", "s", "d", "g", "q"], -20),
    (["k"], ["o", "e", "c"], -20),
    (["D", "O", "Q", "G"], ["A", "V", "W", "X", "Y"], -30),
    (["quotesingle", "quotedbl"], ["A"], -60),
    # FLAT-TO-FLAT CAP PAIRS. Two vertical stems facing each other is the
    # widest natural gap in the alphabet: U|N measured 147 against N|O's 116
    # at Regular, and it reads as a hole in the "UNO DIGIT" wordmark. This is
    # a shape-CLASS kern, not blanket kerning — every pair listed shares the
    # same flat-stem-to-flat-stem geometry, which is exactly the case real
    # fonts solve with kern classes.
    (["U", "H", "N", "I", "E", "F", "L", "B", "P", "R", "D", "M"],
     ["N", "H", "I", "U", "M", "E", "F", "L", "B", "P", "R"], -24),
    # T AGAINST FLAT STEMS. T carries a huge void beneath its arms, so a flat
    # stem beside it needs far more than the flat/flat class kern. I|T measured
    # 150 against N|O's 116 and T belonged to no class at all, which made it
    # the worst pair in "DIGIT". Both directions: the void is on both arms.
    (["I", "H", "N", "E", "F", "B", "P", "R", "D", "U", "M"], ["T"], -34),
    (["T"], ["I", "H", "N", "E", "F", "B", "P", "R", "D", "U", "M"], -34),
]


def build_feature_file() -> str:
    """A real GPOS kern feature, written as FEA and compiled by feaLib."""
    lines = ["languagesystem DFLT dflt;", "languagesystem latn dflt;", "",
             "feature kern {"]
    for left, right, val in KERN_PAIRS:
        lines.append(f"  pos [{' '.join(left)}] [{' '.join(right)}] {val};")
    lines += ["} kern;", ""]
    return "\n".join(lines)


def build_weight(weight: G.Weight) -> TTFont:
    order = [".notdef"] + list(G.GLYPHS.keys())
    charstrings: dict[str, object] = {}
    metrics: dict[str, tuple[int, int]] = {}
    cmap: dict[int, str] = {}

    # .notdef — a hollow box, the correct convention. A blank .notdef hides
    # missing glyphs instead of reporting them.
    nd_adv = int(weight.sb_flat * 2 + 320)
    nd = G.diff(G.rect(60, 0, nd_adv - 60, G.CAP),
                G.rect(60 + weight.stem, weight.stem, nd_adv - 60 - weight.stem,
                       G.CAP - weight.stem))
    pen = T2CharStringPen(nd_adv, None)
    nd.draw(pen)
    charstrings[".notdef"] = pen.getCharString()
    metrics[".notdef"] = (nd_adv, 60)

    for name, (char, fn) in G.GLYPHS.items():
        path, adv = fn(weight)
        adv = int(round(adv))
        pen = T2CharStringPen(adv, None)
        path.draw(pen)
        charstrings[name] = pen.getCharString()

        # Left sidebearing must be the real ink bounds, not the nominal
        # sidebearing — several glyphs (A, V, W) overhang their own.
        bounds = path.bounds
        lsb = int(round(bounds[0])) if bounds else 0
        metrics[name] = (adv, lsb)
        cmap[ord(char)] = name

    ps_name = f"UnoDisplay-{weight.name}"
    fb = FontBuilder(G.UPM, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupCFF(
        ps_name,
        {"version": VERSION, "FullName": f"{FAMILY} {weight.name}",
         "FamilyName": FAMILY, "Weight": weight.name,
         "Notice": f"{FAMILY} (c) 2026 {DESIGNER}. All rights reserved."},
        charstrings,
        {},
    )
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=int(G.ASC + 130), descent=int(G.DESC - 60), lineGap=0)

    subfamily = weight.name if weight.name in ("Regular", "Bold") else "Regular"
    fb.setupNameTable({
        "familyName": FAMILY if weight.name in ("Regular", "Bold") else f"{FAMILY} {weight.name}",
        "styleName": subfamily,
        "uniqueFontIdentifier": f"{DESIGNER}: {FAMILY} {weight.name}: 2026",
        "fullName": f"{FAMILY} {weight.name}",
        "version": f"Version {VERSION}",
        "psName": ps_name,
        "designer": DESIGNER,
        "designerURL": FOUNDRY_URL,
        "manufacturer": DESIGNER,
        "vendorURL": FOUNDRY_URL,
        "licenseDescription": (
            f"{FAMILY} is the proprietary brand typeface of Uno Digit. "
            "It is original work, drawn from a parametric construction system, "
            "and is not derived from any other typeface. Not for redistribution."
        ),
        "typographicFamily": FAMILY,
        "typographicSubfamily": weight.name,
    })
    fb.setupOS2(
        sTypoAscender=int(G.ASC), sTypoDescender=int(G.DESC), sTypoLineGap=0,
        usWinAscent=int(G.ASC + 130), usWinDescent=int(-G.DESC + 60),
        sxHeight=int(G.XH), sCapHeight=int(G.CAP),
        usWeightClass=weight.css,
        achVendID="UNOD",
        fsType=0,
        panose=dict(bFamilyType=2, bSerifStyle=11, bWeight=max(2, weight.css // 100 + 1),
                    bProportion=4, bContrast=2, bStrokeVariation=2, bArmStyle=2,
                    bLetterForm=2, bMidline=2, bXHeight=4),
    )
    fb.setupPost(isFixedPitch=0, underlinePosition=-120, underlineThickness=int(weight.stem * 0.7))

    fb.addOpenTypeFeatures(build_feature_file())
    return fb.font


def main() -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    WEB_FONTS.mkdir(parents=True, exist_ok=True)

    print(f"Uno Display {VERSION} — {len(G.GLYPHS)} glyphs drawn from the "
          f"parametric system\n")
    built = []
    for weight in (G.LIGHT, G.REGULAR, G.MEDIUM, G.BOLD):
        font = build_weight(weight)

        otf = DIST / f"UnoDisplay-{weight.name}.otf"
        font.save(otf)

        woff2 = DIST / f"uno-display-{weight.css}.woff2"
        f2 = TTFont(otf)
        f2.flavor = "woff2"
        f2.save(woff2)

        # Regular and Medium are the web cuts; Light and Bold are print-first.
        if weight.css in (400, 500, 700):
            (WEB_FONTS / woff2.name).write_bytes(woff2.read_bytes())

        built.append((weight, otf, woff2))
        print(f"  {weight.name:<8} stem {weight.stem:>5.0f}   "
              f"otf {otf.stat().st_size / 1024:6.1f} KB   "
              f"woff2 {woff2.stat().st_size / 1024:6.1f} KB")

    kerns = sum(len(l) * len(r) for l, r, _ in KERN_PAIRS)
    print(f"\n  {kerns} kerning pairs compiled into GPOS")
    print(f"  print masters : {DIST}")
    print(f"  web cuts      : {WEB_FONTS}")


if __name__ == "__main__":
    main()
