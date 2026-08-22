#!/usr/bin/env python3
"""
Gate for the branded QR codes. Run it after ANY change to make_qr.py.

It runs two independent checks, because they catch different classes of bug.

1. MODULE EXACTNESS (the strong check).
   Rasterise each symbol at a known scale, sample the centre of every module,
   and compare against segno's matrix. This is what a decoder actually does,
   and it localises a fault to a coordinate instead of just saying "no read".
   It is how the first version of this generator was diagnosed: 9 modules
   differed, all of them finder-pattern corners, because a 1.75-module corner
   fillet put the corner module's centre 0.018 modules outside the ink. Every
   one of 255 decode attempts failed and no amount of decoder-poking would
   have said why. Modules under the logo plaque are excluded — destroying
   those is the deliberate trade error correction exists to absorb.

2. DECODE UNDER DEGRADATION (the realistic check).
   zxing-cpp is the primary oracle: it is the lineage most phone scanners
   descend from. Each code is decoded large, small, tiny and blurred — 180px
   across a 65-module symbol is under 3 pixels per module, roughly a phone at
   arm's length from a business card.

   OpenCV's QRCodeDetector runs as an ADVISORY second opinion only, and is
   passed if it reads at ANY scale. It is not a reliable oracle: on one fixed
   symbol it decoded at 600px, failed at 900px, failed at 1200px and decoded
   again at 1600px. It is still worth keeping, because it was OpenCV that
   revealed rounded finder eyes as the one styling choice with a real
   compatibility cost (it rejects eye fillets past k=1.0 outright) — a signal
   zxing-cpp is too tolerant to surface.
"""
from __future__ import annotations
import io, pathlib, sys
import numpy as np, cairosvg, cv2, zxingcpp
from PIL import Image, ImageFilter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import make_qr

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
CVD = cv2.QRCodeDetector()

DEGRADE = [("1200px", 1200, 0.0), ("400px", 400, 0.0),
           ("250px", 250, 0.0), ("180px", 180, 0.0), ("300+blur", 300, 2.0)]


def png(svg: str, w: int) -> Image.Image:
    return Image.open(io.BytesIO(
        cairosvg.svg2png(bytestring=svg.encode(), output_width=w, output_height=w))).convert("RGB")


def module_exact(url: str, theme: str, logo: bool) -> tuple[int, int]:
    """Returns (mismatches outside the plaque, total data modules)."""
    mat, _, n = make_qr.matrix(url)
    svg, _, _ = make_qr.render(url, theme, with_logo=logo)
    q, px = make_qr.QUIET, 14
    total = n + 2 * q
    g = np.array(png(svg, total * px).convert("L"))
    dark_bg = theme == "brand-dark"
    # Threshold LOCALLY, the way a decoder does — never at a fixed grey value.
    # Brand cyan #06b6d4 has a luma of 132.8. An absolute cutoff of 128 scores
    # it as *light* by one and a half levels, and the whole cyan corner of the
    # gradient reads as a wall of missing modules while every real decoder
    # sails through it. zxing-cpp, like every scanner, binarises against the
    # brightest and darkest values actually present in the frame.
    paper = float(g[px // 2, px // 2])          # a pixel inside the quiet zone
    extreme = float(g.max() if dark_bg else g.min())
    cut = (paper + extreme) / 2.0
    # plaque footprint, in module coordinates, excluded from the comparison
    side = total * make_qr.PLAQUE
    lo, hi = (total - side) / 2 - q, (total + side) / 2 - q
    bad = 0
    for r in range(n):
        for c in range(n):
            # Compare the module's CENTRE against the plaque, not its index.
            # The plaque is placed in continuous coordinates; module 21 spans
            # [21,22) and its centre at 21.5 sits under a plaque starting at
            # 21.35. Testing the index alone leaves a half-module ring of
            # knocked-out modules being scored as artwork faults.
            if logo and lo <= r + 0.5 <= hi and lo <= c + 0.5 <= hi:
                continue
            v = g[int((r + q + 0.5) * px), int((c + q + 0.5) * px)]
            is_ink = v > cut if dark_bg else v < cut
            if is_ink != mat[r][c]:
                bad += 1
    return bad, n * n


def decodes(url: str, theme: str, logo: bool) -> tuple[list[bool], bool]:
    svg, _, _ = make_qr.render(url, theme, with_logo=logo)
    base = png(svg, 1600)
    out = []
    for _, size, blur in DEGRADE:
        im = base.resize((size, size), Image.LANCZOS)
        if blur:
            im = im.filter(ImageFilter.GaussianBlur(blur))
        res = zxingcpp.read_barcode(np.array(im))
        out.append(bool(res and res.text == url))
    cv_any = any(
        CVD.detectAndDecode(cv2.cvtColor(np.array(png(svg, w)), cv2.COLOR_RGB2BGR))[0] == url
        for w in (600, 900, 1200, 1600))
    return out, cv_any


def main() -> int:
    import json
    links = json.loads((ROOT / "links.json").read_text())
    variants = [("brand", True), ("brand-dark", True), ("mono", False)]
    hdr = f"{'asset / theme':<34}{'modules':>9}  " + "  ".join(f"{n:>9}" for n, _, _ in DEGRADE) + "  opencv"
    print(hdr); print("-" * len(hdr))
    fails = 0
    for row in links:
        for theme, logo in variants:
            bad, tot = module_exact(row["url"], theme, logo)
            res, cv_any = decodes(row["url"], theme, logo)
            if bad or not all(res):
                fails += 1
            mstat = "exact" if bad == 0 else f"{bad} BAD"
            print(f"{row['slug'] + '/' + theme:<34}{mstat:>9}  "
                  + "  ".join(f"{'PASS' if r else 'FAIL':>9}" for r in res)
                  + f"  {'ok' if cv_any else 'advisory-fail'}")
    n = len(links) * len(variants)
    print(f"\n{n - fails}/{n} codes fully verified "
          f"({len(DEGRADE)} degradation cases + module exactness each)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
