#!/usr/bin/env python3
"""
End-to-end gate: decode the QR out of the FINISHED artwork.

qr/verify_qr.py proves the standalone symbols are sound. It cannot prove that
the right code ended up on the right asset, that it is still large enough after
being laid into a 191px-tall banner, or that a scrim, a drop shadow or Chrome's
PDF vector conversion did not quietly damage it. Those are different failures
with the same symptom — a customer's phone doing nothing — so they get their
own check.

Each asset is decoded whole and the result is compared against the exact tagged
URL that asset is supposed to carry. A code that scans but carries the flyer's
utm_content on the banner is a silent analytics failure, and this is the only
place it would be caught.

Print PDFs are rasterised at a resolution matched to the physical piece, so the
check reflects the file that goes to the printer rather than a screen proof.
"""
from __future__ import annotations
import io, json, pathlib, sys
import numpy as np, zxingcpp
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
DIST = ROOT / "dist"
LINKS = {r["slug"]: r["url"] for r in json.loads((ROOT / "links.json").read_text())}

# Staff cards carry a vCard, not a URL, so their expected payload comes from
# vcard.py. Checking them against links.json would report a permanent FAIL on
# an asset that is working perfectly — a broken gate teaches people to ignore
# the gate, which is worse than not having one.
sys.path.insert(0, str(ROOT))
import vcard
EXPECTED = dict(LINKS)
EXPECTED.update({f'card-{p["slug"]}': vcard.payload(p["slug"]) for p in vcard.STAFF})

# Rasterisation DPI per print piece. Chosen from the physical size: enough
# pixels across the printed QR to decode, without rendering a 12,000px banner.
PDF_DPI = {"business-card": 300, "card-bowen-li": 300, "a4-flyer": 200, "roller-banner": 24}


def decode_all(img: Image.Image) -> list[str]:
    return [r.text for r in zxingcpp.read_barcodes(np.array(img.convert("RGB")))]


def pdf_pages(path: pathlib.Path, dpi: int):
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(path)
    for i in range(len(doc)):
        yield doc[i].render(scale=dpi / 72).to_pil()


def main() -> int:
    if not DIST.exists():
        sys.exit("nothing in dist/ — run render.py first")
    rows, bad = [], 0
    for png in sorted(DIST.glob("*.png")):
        slug = png.stem
        want = EXPECTED.get(slug)
        got = decode_all(Image.open(png))
        ok = want in got
        rows.append((png.name, len(got), "PASS" if ok else "FAIL", "" if ok else f"want {want!r} got {got!r}"))
        bad += not ok
    for pdf in sorted(DIST.glob("*.pdf")):
        slug = pdf.stem
        want = EXPECTED.get(slug)
        dpi = PDF_DPI.get(slug, 200)
        found = []
        for page in pdf_pages(pdf, dpi):
            found += decode_all(page)
        ok = want in found
        rows.append((f"{pdf.name} @{dpi}dpi", len(found), "PASS" if ok else "FAIL",
                     "" if ok else f"want {want!r} got {found!r}"))
        bad += not ok

    w = max(len(r[0]) for r in rows)
    print(f"{'asset':<{w}}  codes  result")
    for name, n, res, note in rows:
        print(f"{name:<{w}}  {n:>5}  {res}" + (f"  {note[:110]}" if note else ""))
    print(f"\n{len(rows) - bad}/{len(rows)} assets carry the correct tagged URL")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
