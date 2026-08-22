#!/usr/bin/env python3
"""
Branded QR generator for Uno Digit.

WHY WE RENDER THE SVG BY HAND INSTEAD OF USING A LIBRARY'S STYLED OUTPUT
segno gives us the module matrix; everything visual below is ours. That matters
because the three things that make a QR *scan* are the three things a generic
"pretty QR" preset gets wrong:

 1. FINDER PATTERNS.  A decoder does not read a QR by looking at it. It scans
    lines across the image hunting for the run-length ratio 1:1:3:1:1 — the
    signature of the three corner eyes. Rounding those corners preserves the
    ratio. Recolouring them preserves it. Turning them into circles, splitting
    them into dots, or putting a logo over one DESTROYS it, and the symbol
    becomes unfindable no matter how much error correction you bought.
    So: the eyes here are restyled (rounded, two-tone) but never re-shaped.

 2. DARK AREA.  The fashionable "dots" style draws each module as a circle
    inset inside its cell, which throws away ~21% of every dark module's area
    and leaves white gaps between neighbours. Under a phone camera at a metre,
    on ink that has spread on matte vinyl, that is the difference between an
    instant read and a three-second hunt. We instead draw FULL-SIZE modules and
    round only the corners that face light neighbours — so isolated modules
    look like dots, runs of modules look like smooth capsules, and no dark area
    is sacrificed anywhere. It is the premium look with none of the cost.

 3. THE LOGO KNOCKOUT IS AN ERROR BUDGET, NOT A DECORATION.  Level H recovers
    30% of codewords. A centred plaque of side 0.26 x symbol side destroys
    0.26^2 = 6.8% of the area — comfortably inside the budget with room left
    for a scratch, a fold, or a bad print. Pushing the plaque to look bigger is
    spending real reliability. Don't.

COLOUR
The gradient runs cyan-500 (the literal logo colour) to violet-600, along the
diagonal — the same two hues as the mark. The finder eyes deliberately step to
the DEEPER stops (cyan-700 ring, violet-600 pupil): they are what the decoder
must find first, so they get the highest-contrast paint in the palette, and the
ring/pupil split echoes the logo's cyan stroke with violet nodes.

A `mono` variant in near-black is emitted alongside every code. Use it whenever
reliability outranks flair — business cards, single-colour print, engraving,
anything smaller than 25mm, anything that will be photocopied.
"""
from __future__ import annotations
import json, pathlib, sys
import segno

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
BRAND = json.loads((ROOT / "brand.json").read_text())
C = BRAND["color"]
LOGO = BRAND["logo"]

# ── palette ────────────────────────────────────────────────────────────────
THEMES = {
    "brand": {
        "grad": (C["cyan500"], C["violet600"]),
        "ring": C["cyan700"],
        "pupil": C["violet600"],
        "bg": C["paper"],
        "plaque": C["paper"],
    },
    # For dark surfaces (roller banner base, story backgrounds). Inverted QR
    # codes scan on every modern phone, but only when the QUIET ZONE is dark
    # too — a light-on-dark symbol floated on a light page reads as noise.
    # render_qr() therefore always paints its own background.
    "brand-dark": {
        "grad": (C["cyan400"], C["violet300"]),
        "ring": C["cyan400"],
        "pupil": C["violet300"],
        "bg": C["nearBlack"],
        "plaque": C["nearBlack"],
    },
    "mono": {
        "grad": (C["nearBlack"], C["nearBlack"]),
        "ring": C["nearBlack"],
        "pupil": C["nearBlack"],
        "bg": C["paper"],
        "plaque": C["paper"],
    },
}

QUIET = 4          # modules. The spec minimum. Never go below it.
R = 0.42           # data-module corner radius, as a fraction of one module
PLAQUE = 0.22      # logo plaque side, as a fraction of the padded canvas.

# ── Finder-pattern corner radii: DERIVED, not chosen by eye ────────────────
# A decoder samples each module at its CENTRE. The corner module of the 7x7
# ring has its centre 0.5 modules in from each edge, so a corner fillet of
# radius k keeps that centre inside the ink only while
#
#       |0.5 - k| * sqrt(2)  <=  k
#
# The first version of this file used k = 1.75, which gives 1.768 <= 1.75 —
# outside by 0.018 of a module. The eyes looked perfect and DECODED ZERO
# TIMES, because those same corner modules are where the timing patterns
# (row 6 and column 6) start: losing them destroys both the 1:1:3:1:1 finder
# signature and the grid every other module is located against.
#
# k = 1.2 gives 0.99 <= 1.2 — inside with 0.21 modules of margin, and still
# visibly a squircle rather than a hard square. verify_qr.py re-checks this
# module-by-module on every run so it cannot silently regress.
# A SECOND, INDEPENDENT ceiling turned up in testing: OpenCV's QRCodeDetector
# refuses any symbol whose eyes are rounded beyond k = 1.0, while zxing-cpp
# (the lineage behind most phone scanners) reads them happily all the way to
# 1.2+. Colour, rounded data modules and the logo knockout bother neither
# decoder — eye rounding alone is what OpenCV rejects. Measured, per-choice:
#
#   mono, square modules, ROUND eyes   zxing PASS   opencv FAIL
#   mono, ROUND modules, square eyes   zxing PASS   opencv PASS
#   brand gradient + logo, square eyes zxing PASS   opencv PASS
#
# So k = 1.0 is the largest value that keeps BOTH — visually still a clear
# squircle, and no longer dependent on which decoder the visitor happens to
# have. Do not raise it for looks; you would be trading away every scanner
# built on OpenCV (a lot of Android kiosk and PoS software) for ~2mm of radius.
EYE_OUTER_R = 1.0
EYE_HOLE_R = 0.83
EYE_PUPIL_R = 0.75


def matrix(url: str, ecc: str = "h", boost: bool = True):
    """Module matrix WITHOUT the quiet zone — we add our own.

    `boost` must be False whenever the ECC level was chosen deliberately.
    segno's boost_error silently raises the level when there is spare capacity
    in the chosen version, which is a good default for a short URL and quietly
    undoes the density trade for a long vCard payload.
    """
    qr = segno.make(url, error=ecc, boost_error=boost)
    rows = [[bool(m) for m in row] for row in qr.matrix]
    return rows, qr.version, len(rows)


def finder_cells(n: int) -> set[tuple[int, int]]:
    """The three 7x7 eyes plus their one-module light separator.

    We exclude these from the freeform module renderer and draw them by hand,
    so the 1:1:3:1:1 run-length signature is guaranteed intact regardless of
    what the styling code does.
    """
    cells: set[tuple[int, int]] = set()
    for r0, c0 in ((0, 0), (0, n - 7), (n - 7, 0)):
        for dr in range(-1, 8):
            for dc in range(-1, 8):
                r, c = r0 + dr, c0 + dc
                if 0 <= r < n and 0 <= c < n:
                    cells.add((r, c))
    return cells


def module_path(mat, skip, n) -> str:
    """One SVG path covering every data module (finders excluded).

    Each module is drawn at FULL cell size; only the corners facing light
    neighbours are rounded. So an isolated module renders as a dot, a run
    renders as a smooth capsule, an area renders as a rounded blob — the
    fashionable look — while every square micron of dark area the spec expects
    is still there. The "dots" style you see elsewhere insets a circle inside
    each cell, throwing away ~21% of every module's area and leaving white
    gutters between neighbours; that is a real cost in scan margin at
    distance, on spread ink, or under a cheap camera, paid for nothing.

    Only CONVEX corners are rounded. Filleting the concave (inner) corner
    where two runs meet at 90 degrees needs the arc to be drawn by the
    DIAGONAL neighbour cell, not by this one, so it cannot be done in a
    per-module pass. An earlier attempt to fake it here emitted a stray
    moveto mid-path and sprouted leaf-shaped spikes across the symbol.
    """
    def dark(r, c):
        return 0 <= r < n and 0 <= c < n and mat[r][c] and (r, c) not in skip

    k = R
    d: list[str] = []
    for r in range(n):
        for c in range(n):
            if not dark(r, c):
                continue
            x, y = c + QUIET, r + QUIET
            N, S, E, W = dark(r - 1, c), dark(r + 1, c), dark(r, c + 1), dark(r, c - 1)
            tl, tr = (not N and not W), (not N and not E)
            br, bl = (not S and not E), (not S and not W)

            p = [f"M{x + (k if tl else 0):.3f} {y:.3f}",
                 f"H{x + 1 - (k if tr else 0):.3f}"]
            if tr:
                p.append(f"a{k:.3f} {k:.3f} 0 0 1 {k:.3f} {k:.3f}")
            p.append(f"V{y + 1 - (k if br else 0):.3f}")
            if br:
                p.append(f"a{k:.3f} {k:.3f} 0 0 1 {-k:.3f} {k:.3f}")
            p.append(f"H{x + (k if bl else 0):.3f}")
            if bl:
                p.append(f"a{k:.3f} {k:.3f} 0 0 1 {-k:.3f} {-k:.3f}")
            p.append(f"V{y + (k if tl else 0):.3f}")
            if tl:
                p.append(f"a{k:.3f} {k:.3f} 0 0 1 {k:.3f} {-k:.3f}")
            p.append("Z")
            d.append("".join(p))
    return "".join(d)


def rr(x, y, w, h, r) -> str:
    """Rounded-rect subpath."""
    return (f"M{x + r:.3f} {y:.3f}H{x + w - r:.3f}a{r:.3f} {r:.3f} 0 0 1 {r:.3f} {r:.3f}"
            f"V{y + h - r:.3f}a{r:.3f} {r:.3f} 0 0 1 {-r:.3f} {r:.3f}H{x + r:.3f}"
            f"a{r:.3f} {r:.3f} 0 0 1 {-r:.3f} {-r:.3f}V{y + r:.3f}"
            f"a{r:.3f} {r:.3f} 0 0 1 {r:.3f} {-r:.3f}Z")


def eyes(n: int, ring: str, pupil: str) -> str:
    """The three finder patterns, restyled but geometrically exact.

    Outer 7x7 ring: drawn as a rounded square with a rounded square hole
    (fill-rule evenodd) — the hole is exactly the 5x5 light band the spec
    requires. Pupil: the 3x3 core. Run-lengths through the centre stay
    1:1:3:1:1 in both axes, which is the only property that matters.
    """
    out = []
    for r0, c0 in ((0, 0), (0, n - 7), (n - 7, 0)):
        x, y = c0 + QUIET, r0 + QUIET
        outer = rr(x, y, 7, 7, EYE_OUTER_R)
        hole = rr(x + 1, y + 1, 5, 5, EYE_HOLE_R)
        out.append(f'<path d="{outer}{hole}" fill="{ring}" fill-rule="evenodd"/>')
        out.append(f'<path d="{rr(x + 2, y + 2, 3, 3, EYE_PUPIL_R)}" fill="{pupil}"/>')
    return "".join(out)


def logo_group(n: int, plaque_fill: str) -> str:
    """Centre plaque + the Uno mark, sized as a fraction of the symbol."""
    total = n + 2 * QUIET
    side = total * PLAQUE
    x = y = (total - side) / 2
    pad = side * 0.16
    mark = side - 2 * pad
    s = mark / 40.0  # the logo's own viewBox is 0 0 40 40
    return (
        f'<path d="{rr(x, y, side, side, side * 0.24)}" fill="{plaque_fill}"/>'
        f'<g transform="translate({x + pad:.3f} {y + pad:.3f}) scale({s:.5f})">'
        f'<path d="{LOGO["strokePath"]}" fill="none" stroke="{LOGO["strokeColor"]}"'
        f' stroke-width="{LOGO["strokeWidth"]}" stroke-linecap="round" stroke-linejoin="round"/>'
        + "".join(
            f'<circle cx="{c["cx"]}" cy="{c["cy"]}" r="{c["r"]}" fill="{LOGO["nodeColor"]}"/>'
            for c in LOGO["nodes"])
        + "</g>"
    )


def render(url: str, theme: str = "brand", with_logo: bool = True, ecc: str = "h",
           boost: bool = True) -> tuple[str, int, int]:
    t = THEMES[theme]
    mat, version, n = matrix(url, ecc, boost)
    total = n + 2 * QUIET
    skip = finder_cells(n)
    gid = f"g_{theme}"
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} {total}" '
        f'width="{total * 16}" height="{total * 16}" shape-rendering="geometricPrecision">',
        f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{t["grad"][0]}"/>'
        f'<stop offset="1" stop-color="{t["grad"][1]}"/></linearGradient></defs>',
        # The quiet zone is painted, never assumed. A QR dropped on an unknown
        # background with a transparent margin is a QR that intermittently fails.
        f'<rect width="{total}" height="{total}" fill="{t["bg"]}"/>',
        f'<path d="{module_path(mat, skip, n)}" fill="url(#{gid})"/>',
        eyes(n, t["ring"], t["pupil"]),
    ]
    if with_logo:
        svg.append(logo_group(n, t["plaque"]))
    svg.append("</svg>")
    return "".join(svg), version, n


def staff_codes(out: pathlib.Path) -> list[tuple]:
    """Personal vCard codes.

    ECC-Q and NO LOGO, which inverts the choice made for every other code here,
    and the reason is the failure mode rather than taste. A banner is scanned
    once from two metres and then hangs flat: distance dominates, so it wants
    the biggest modules it can get and spends level-H redundancy on a logo. A
    business card lives in a wallet being creased, scuffed and bent, and is
    scanned from 15cm where module size is a non-issue. There, damage dominates
    — so the budget goes to error correction instead of the logo, and the card
    itself carries the branding.

    Measured on the 289-char payload at a 40mm printed size:
        ECC-H  v18  89x89  0.412 mm/module   <- below the practical print floor
        ECC-Q  v16  81x81  0.449 mm/module
        ECC-Q  v15  77x77  0.471 mm/module   <- chosen
        ECC-M  v13  69x69  0.519 mm/module   only 15% recovery
    """
    import sys
    sys.path.insert(0, str(ROOT))
    import vcard
    rows = []
    for p in vcard.STAFF:
        data = vcard.payload(p["slug"])
        svg, version, n = render(data, "mono", with_logo=False, ecc="q", boost=False)
        (out / f'staff-{p["slug"]}--vcard.svg').write_text(svg)
        rows.append((f'staff-{p["slug"]}', version, n, len(data)))
    return rows


if __name__ == "__main__":
    links = json.loads((ROOT / "links.json").read_text())
    out = HERE / "out"
    out.mkdir(exist_ok=True)
    import cairosvg

    report = []
    for row in links:
        for theme, logo in (("brand", True), ("brand-dark", True), ("mono", False)):
            svg, version, n = render(row["url"], theme, logo)
            stem = f'{row["slug"]}--{theme}'
            (out / f"{stem}.svg").write_text(svg)
            cairosvg.svg2png(bytestring=svg.encode(), write_to=str(out / f"{stem}.png"),
                             output_width=2048, output_height=2048)
            if theme == "brand":
                report.append((row["slug"], version, n, row["url_length"]))
    staff = staff_codes(out)
    print(f"{len(links)} links x 3 themes = {len(links) * 3} codes, "
          f"+ {len(staff)} staff vCard -> {out}")
    for slug, v, n, ln in staff:
        print(f"  {slug:26s} v{v:<3d} {n}x{n} modules  ({ln} chars, ECC-Q, vCard)")
    for slug, v, n, ln in report:
        print(f"  {slug:26s} v{v:<3d} {n}x{n} modules  ({ln} chars, ECC-H)")
