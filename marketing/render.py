#!/usr/bin/env python3
"""
Render every artwork to marketing/dist.

WHY HEADLESS CHROME AND NOT A PYTHON RASTERISER
cairosvg and Pillow are both available here and both were the obvious choice,
right up until you need @font-face. Uno Display and Uno Sans ARE the brand;
a poster silently falling back to Helvetica is not a lesser version of this
work, it is a different company's. Chrome honours @font-face, does real
optical letter-spacing, and its print path emits VECTOR TEXT at exact
millimetre dimensions — so the roller banner PDF a printer receives has live
outlines, not a resampled bitmap.

  print assets  -> --print-to-pdf  (vector, exact mm, what the printer wants)
                   plus a 1:10 PNG proof for on-screen review
  social assets -> --screenshot at exact pixel dimensions

Everything is rendered from a SELF-CONTAINED html file: fonts base64-inlined,
QR codes inlined as vector <svg>, no network. That matters because Chrome
applies file-origin rules to subresources, and a font that fails to load from
a file:// sibling fails SILENTLY.
"""
from __future__ import annotations
import base64, json, pathlib, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import brandcss, layouts

DIST = ROOT / "dist"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# ── the asset table ─────────────────────────────────────────────────────────
# `avoid_left` is the width of the platform's own avatar/chrome overlay. Every
# number below is the platform's published safe area, not a guess, and it is
# the difference between a header that reads and one whose logo sits behind a
# profile picture.
PRINT = [
    dict(slug="roller-banner", mm=(850, 2100), fn=lambda a: layouts.roller_banner(),
         note="Pull-up banner. Bottom 100mm rolls into the cassette."),
    dict(slug="a4-flyer", mm=(210, 297), fn=lambda a: layouts.a4_flyer(),
         note="A4 leave-behind."),
    dict(slug="business-card", mm=(91, 61), fn=lambda a: layouts.business_card(), pages=2,
         note="85x55mm card + 3mm bleed all round. Page 1 front, page 2 reverse."),
    dict(slug="card-bowen-li", mm=(91, 61), fn=lambda a: layouts.staff_card("bowen-li"), pages=2,
         note="Staff card, Bowen Li (CTO). 85x55mm + 3mm bleed. Reverse carries a "
              "vCard QR (ECC-Q, no logo) so a scan saves the contact, not just the site."),
]

SOCIAL = [
    dict(slug="linkedin-company-banner", w=1128, h=191, kind="strip_minimal", avoid_left=300,
         note="LinkedIn company page. The page logo overlaps the lower left."),
    dict(slug="linkedin-personal-cover", w=1584, h=396, kind="strip", avoid_left=290,
         note="LinkedIn personal profile cover. Avatar overlaps lower left."),
    dict(slug="linkedin-post", w=1200, h=627, kind="card",
         note="LinkedIn feed link-post image."),
    dict(slug="linkedin-doc", w=1080, h=1080, kind="card",
         headline="Six ways we put <span class='grad-ink'>AI to work</span>",
         note="LinkedIn document/carousel cover."),
    dict(slug="wechat-official-cover", w=900, h=383, kind="strip",
         note="WeChat Official Account article cover."),
    dict(slug="wechat-moments", w=1080, h=1080, kind="card",
         note="WeChat Moments square card."),
    dict(slug="wechat-namecard", w=1080, h=1920, kind="story",
         note="WeChat digital name card / full-screen share."),
    dict(slug="x-header", w=1500, h=500, kind="strip", avoid_left=200,
         note="X/Twitter header. Avatar overlaps lower left; keep the bottom 120px clear."),
    dict(slug="instagram-post", w=1080, h=1080, kind="card",
         note="Instagram square post."),
    dict(slug="instagram-story", w=1080, h=1920, kind="story",
         note="Instagram story. Platform UI covers ~250px top and bottom."),
    dict(slug="facebook-cover", w=1640, h=664, kind="strip", avoid_left=180,
         note="Facebook page cover. Desktop crops to a centred 820x312."),
    dict(slug="youtube-banner", w=2560, h=1440, kind="channel",
         note="YouTube channel art. TV shows 2560x1440, desktop a centred 2560x423, "
              "phone a centred 1546x423 — all readable content sits in that smallest box."),
    dict(slug="email-signature", w=1000, h=260, kind="signature",
         note="Email signature block. Also emitted as an HTML snippet."),
]

BUILDERS = {"strip": layouts.strip, "strip_minimal": layouts.strip_minimal,
            "card": layouts.card, "story": layouts.story, "signature": layouts.signature,
            "channel": layouts.channel}


def document(body: str, page_css: str = "") -> str:
    return (f"<!doctype html><html><head><meta charset='utf-8'>"
            f"<style>{brandcss.css()}{page_css}</style></head><body>{body}</body></html>")


def chrome(args: list[str]) -> None:
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", "--no-first-run",
                    "--no-default-browser-check", "--disable-extensions",
                    "--virtual-time-budget=8000", *args],
                   check=True, capture_output=True, timeout=300)


def render_print(a: dict, tmp: pathlib.Path) -> None:
    w, h = a["mm"]
    css = (f"@page{{size:{w}mm {h}mm;margin:0}}"
           f"html,body{{width:{w}mm}} .sheet{{page-break-after:always}}")
    src = tmp / f"{a['slug']}.html"
    src.write_text(document(a["fn"](a), css))
    out = DIST / f"{a['slug']}.pdf"
    chrome([f"--print-to-pdf={out}", "--no-pdf-header-footer", src.as_uri()])
    # 1:10 on-screen proof. A 850mm banner at full print resolution is a
    # 5000x12400px screenshot; nobody reviews that, and Chrome struggles.
    proof = DIST / "proof" / f"{a['slug']}.png"
    proof.parent.mkdir(parents=True, exist_ok=True)
    # --window-size is in CSS PIXELS and --force-device-scale-factor scales the
    # output raster on top of it. Passing the already-halved size together with
    # dsf=0.5 gives a viewport half as wide as the artwork, so the layout
    # reflows and the proof silently ships a CROPPED banner. Always pass the
    # full CSS size and let the scale factor do the shrinking.
    css_w, css_h = round(w * 96 / 25.4), round(h * 96 / 25.4)
    dsf = min(0.5, 2400 / max(css_w, css_h))
    chrome([f"--screenshot={proof}", f"--window-size={css_w},{css_h}",
            f"--force-device-scale-factor={dsf:.4f}", src.as_uri()])
    print(f"  {a['slug']:<26} PDF {w}x{h}mm  + proof "
          f"{round(css_w*dsf)}x{round(css_h*dsf)}px (viewport {css_w}x{css_h} css @ {dsf:.3f}x)")
    guides(a)


def render_social(a: dict, tmp: pathlib.Path) -> None:
    body = BUILDERS[a["kind"]](a)
    css = f"html,body{{width:{a['w']}px;height:{a['h']}px;overflow:hidden}}"
    src = tmp / f"{a['slug']}.html"
    src.write_text(document(body, css))
    out = DIST / f"{a['slug']}.png"
    chrome([f"--screenshot={out}", f"--window-size={a['w']},{a['h']}", src.as_uri()])
    print(f"  {a['slug']:<26} PNG {a['w']}x{a['h']}")


# Bleed per print piece, in mm. Guides are drawn onto a PROOF copy only; the
# PDF sent to the printer stays clean.
BLEED = {"business-card": 3.0, "card-bowen-li": 3.0}
SAFE = {"business-card": 4.0, "card-bowen-li": 4.0, "a4-flyer": 10.0, "roller-banner": 40.0}


def guides(a: dict) -> None:
    """Rasterise the print PDF and draw trim + safe-margin guides over it.

    A finisher works to a tolerance; showing where the trim falls and how much
    clearance the type has is the difference between "looks fine" and "we know
    it survives the guillotine". Cyan = trim, violet = safe margin.
    """
    try:
        import pypdfium2 as pdfium
    except ImportError:
        return
    from PIL import ImageDraw
    w_mm, h_mm = a["mm"]
    bleed, safe = BLEED.get(a["slug"], 0.0), SAFE.get(a["slug"], 0.0)
    dpi = min(200, round(2200 / (max(w_mm, h_mm) / 25.4)))
    scale = dpi / 25.4  # px per mm
    doc = pdfium.PdfDocument(DIST / f"{a['slug']}.pdf")
    pages = [doc[i].render(scale=dpi / 72).to_pil().convert("RGB") for i in range(len(doc))]
    out = DIST / "proof" / f"{a['slug']}-guides.png"
    from PIL import Image
    sheet = Image.new("RGB", (sum(p.width for p in pages) + 20 * len(pages),
                              pages[0].height + 20), (18, 18, 22))
    x = 10
    for pg in pages:
        sheet.paste(pg, (x, 10))
        d = ImageDraw.Draw(sheet)
        if bleed:
            d.rectangle([x + bleed * scale, 10 + bleed * scale,
                         x + (w_mm - bleed) * scale, 10 + (h_mm - bleed) * scale],
                        outline=(6, 182, 212), width=2)
        m = bleed + safe
        d.rectangle([x + m * scale, 10 + m * scale,
                     x + (w_mm - m) * scale, 10 + (h_mm - m) * scale],
                    outline=(139, 92, 246), width=2)
        x += pg.width + 20
    sheet.save(out)
    print(f"  {'':<26} guides -> proof/{out.name} (cyan=trim, violet=safe)")


def main() -> int:
    if not pathlib.Path(CHROME).exists():
        sys.exit(f"Chrome not found at {CHROME}")
    only = sys.argv[1:] or None
    # Only wipe on a FULL build. Clearing dist/ on a selective run deletes the
    # fifteen assets you did not ask to rebuild, which is exactly the opposite
    # of what passing one slug means.
    if not only and DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        tmp = pathlib.Path(td)
        print("print:")
        for a in PRINT:
            if only and a["slug"] not in only:
                continue
            render_print(a, tmp)
        print("social:")
        for a in SOCIAL:
            if only and a["slug"] not in only:
                continue
            render_social(a, tmp)
    if not only:
        manifest = [{k: v for k, v in a.items() if k != "fn"} for a in PRINT + SOCIAL]
        (DIST / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str) + "\n")
    print(f"\n-> {DIST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
