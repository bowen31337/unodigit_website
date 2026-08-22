#!/usr/bin/env python3
"""
One function per artwork archetype. Each returns the <body> markup; render.py
supplies the page box and drives Chrome.

THE ARCHETYPES
  poster     tall print pieces — roller banner, A4 flyer
  strip      wide-and-short social headers, where a platform avatar overlaps
             one corner and the real canvas is much smaller than the file
  card       square / landscape feed posts
  story      9:16 full-bleed verticals
  namecard   business card, front and back
  signature  email signature block

WHY LAYOUTS ARE CODE AND NOT SIXTEEN HTML FILES
Sixteen files means sixteen copies of the logo lockup and sixteen chances for
the tagline to drift. Everything below reads its copy from brand.json and its
QR from qr/out, so a change to a fact changes every asset at once.
"""
from __future__ import annotations
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
BRAND = json.loads((ROOT / "brand.json").read_text())
C, COPY, ORG = BRAND["color"], BRAND["copy"], BRAND["org"]

from brandcss import logo_svg


def qr(slug: str, theme: str, size: str) -> str:
    """Inline the generated QR as real vector markup.

    Not an <img> and not a data: URI — an inlined <svg> stays vector through
    Chrome's print-to-PDF, so the printer's RIP renders module edges at device
    resolution instead of resampling a bitmap. On a 200mm code that is the
    difference between crisp modules and soft ones, and soft modules are
    exactly what a scanner has to work hardest against.
    """
    p = ROOT / "qr" / "out" / f"{slug}--{theme}.svg"
    s = p.read_text()
    s = re.sub(r'width="\d+" height="\d+"', f'width="{size}" height="{size}"', s, count=1)
    # Gradient ids repeat across inlined codes on the same page; namespace them.
    uid = re.sub(r"\W", "", slug + theme)
    s = s.replace('id="g_', f'id="{uid}_g_').replace('url(#g_', f'url(#{uid}_g_')
    return f'<span style="display:block;width:{size};height:{size};line-height:0">{s}</span>'


def lockup(mark: str, text: str, gap: str = ".55em", color: str = "#fff",
           accent: str | None = None) -> str:
    """The wordmark. `accent` must be overridden on light surfaces.

    The default accent is cyan-400, which is the dark-mode ink track — it
    measures 2.2:1 on white and is unreadable there. On a light background pass
    cyan-700, the light-mode ink track, exactly as globals.css does.
    """
    acc = accent or C["cyan400"]
    return (f'<span style="display:inline-flex;align-items:center;gap:{gap}">'
            f'{logo_svg(mark)}'
            f'<span class="t-title" style="font-size:{text};color:{color};letter-spacing:-.02em">'
            f'Uno <span style="color:{acc}">Digit</span></span></span>')


def mesh(spec: list[tuple[str, str, str, str, str]], blur: str = "90px") -> str:
    """spec entries: (class, left, top, width, height) — all CSS lengths."""
    pools = "".join(
        f'<i class="{cls}" style="left:{l};top:{t};width:{w};height:{h}"></i>'
        for cls, l, t, w, h in spec)
    return f'<div class="mesh" style="--mesh-blur:{blur}">{pools}</div>'



def lattice(w: float, h: float, seed: int = 7, n: int = 34, spread: float = 0.34,
            opacity: float = 0.85, unit: str = "mm") -> str:
    """A procedural node lattice, as pure vector.

    This is the same art direction as the Gemini reference in marketing/gemini,
    rebuilt so it can be printed. Gemini's native output is 572x1024; across an
    850mm banner that is 17 dpi, and a mesh of hairline glowing filaments is the
    worst possible subject to upscale 9x. Generated here instead, it is
    resolution-independent, locked to the exact brand hex values rather than
    whatever the model's palette drifted to, and about 8 KB.

    The glow is STACKED STROKES, not an SVG blur filter: Chrome rasterises
    filter regions when printing to PDF, which would smuggle the resolution
    problem back in through the side door. Three passes — wide and faint, mid,
    then a crisp core — read as bloom at any scale and stay vector all the way
    to the RIP.

    Deterministic by seed, so a re-render is byte-identical and the artwork
    does not quietly reshuffle between proof and print.
    """
    import math, random
    rnd = random.Random(seed)
    pts = []
    for i in range(n):
        # Biased to the edges: a lattice with an empty middle is what leaves
        # room for type, and it is why the reference image reads as calm.
        t = i / max(1, n - 1)
        x = rnd.uniform(0, w)
        y = rnd.uniform(0, h * spread) if t < 0.5 else rnd.uniform(h * (1 - spread), h)
        pts.append((x, y))

    # Stroke weights and node radii are expressed in the canvas's OWN units, so
    # a fixed value renders proportionally thinner the wider the canvas gets —
    # 0.16 units reads correctly across an 850-wide banner and disappears
    # across a 2560px YouTube banner. Scale everything to a constant fraction
    # of the width instead, with the banner as the reference.
    k = w / 850.0
    # Connect neighbours within ~1.9x the MEAN POINT SPACING, not a fraction of
    # the diagonal. Spacing adapts to both the canvas shape and the point count,
    # so the same call gives short clustered edges on a dense wide canvas and
    # longer ones on a sparse tall one. A diagonal-based reach produced long
    # angular spans on 16:9 that read as scattered wireframe rather than mesh.
    reach = 1.9 * math.sqrt((w * h) / max(1, n))
    edges = []
    for i, a in enumerate(pts):
        d = sorted(((math.dist(a, b), j) for j, b in enumerate(pts) if j != i))
        for dist, j in d[:3]:
            if dist <= reach and (j, i) not in edges:
                edges.append((i, j))

    def mix(t):  # cyan -> violet across the x axis
        c1, c2 = (6, 182, 212), (139, 92, 246)
        return "#%02x%02x%02x" % tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))

    body = []
    for wid, alpha in ((0.9 * k, 0.10), (0.42 * k, 0.22), (0.16 * k, 0.75)):
        for i, j in edges:
            (x1, y1), (x2, y2) = pts[i], pts[j]
            col = mix(((x1 + x2) / 2) / w)
            body.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" '
                        f'stroke="{col}" stroke-width="{wid}" stroke-opacity="{alpha}"/>')
    for x, y in pts:
        col = mix(x / w)
        body.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{2.6*k:.2f}" fill="{col}" fill-opacity=".18"/>'
                    f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{1.15*k:.2f}" fill="{col}" fill-opacity=".55"/>'
                    f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{0.5*k:.2f}" fill="{col}"/>')
    return (f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" '
            f'style="position:absolute;inset:0;width:100%;height:100%;opacity:{opacity}">'
            + "".join(body) + "</svg>")


# ── type fitting ────────────────────────────────────────────────────────────
import functools
from fontTools.ttLib import TTFont

_DISPLAY_OTF = ROOT.parent / "tools" / "fonts" / "uno-display" / "masters" / "UnoDisplay-Bold.otf"


@functools.lru_cache(maxsize=4)
def _advances() -> tuple[dict, int]:
    f = TTFont(_DISPLAY_OTF)
    cmap = f.getBestCmap()
    hmtx = f["hmtx"]
    upem = f["head"].unitsPerEm
    return ({ch: hmtx[cmap[ord(ch)]][0] for ch in
             "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -&.,'"
             if ord(ch) in cmap}, upem)


def text_em(s: str, tracking: float = -0.035) -> float:
    """Width of `s` in em, measured from the actual font binary.

    Not estimated. The first cut of the strip layouts guessed the headline size
    from the canvas height, which put "transformation" underneath the QR panel
    on the Facebook cover and collided the headline with its own eyebrow on the
    LinkedIn company banner. Uno Display is a drawn face with unusual advance
    widths — there is no rule of thumb for it, so we read hmtx.
    """
    adv, upem = _advances()
    default = adv.get("n", upem // 2)
    return sum(adv.get(ch, default) for ch in s) / upem + tracking * len(s)


def fit_px(lines: list[str], avail_px: float, max_px: float, tracking: float = -0.035) -> int:
    """Largest font size at which every line fits `avail_px`."""
    widest = max(text_em(l, tracking) for l in lines)
    return int(min(max_px, avail_px / widest))


# ── backdrops ───────────────────────────────────────────────────────────────
import base64


@functools.lru_cache(maxsize=8)
def _photo_b64(name: str) -> str:
    return base64.b64encode((ROOT / "gemini" / name).read_bytes()).decode()


# Gemini's native output is 1024 on the long edge. Upscaling a mesh of hairline
# glowing filaments is the worst case for interpolation, so each asset gets the
# raster only where its own dimensions keep the scale factor sane; everything
# larger falls back to the vector lattice. UPSCALE_LIMIT is the line.
UPSCALE_LIMIT = 2.0
PHOTOS = {"wide": ("hero-wide-01.png", 1024, 572),
          "vertical": ("hero-vertical-01.png", 572, 1024)}


def photo_fits(kind: str, w: int, h: int) -> bool:
    _, pw, ph = PHOTOS[kind]
    return max(w / pw, h / ph) <= UPSCALE_LIMIT


def backdrop(a: dict, kind: str, scrim: str) -> str:
    """Gemini raster where resolution allows, vector lattice otherwise.

    The scrim is not optional. The reference art puts its brightest nodes in
    two opposite corners, and body copy laid straight over a glowing filament
    loses contrast exactly where it is hardest to notice on a screen proof.
    """
    w, h = a["w"], a["h"]
    if kind in PHOTOS and photo_fits(kind, w, h):
        name = PHOTOS[kind][0]
        return (f'<div class="mesh">'
                f'<img src="data:image/png;base64,{_photo_b64(name)}" '
                f'style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">'
                f'<div style="position:absolute;inset:0;background:{scrim}"></div></div>')
    return (f'<div style="position:absolute;inset:0;opacity:.6">'
            f'{lattice(w, h, seed=19, n=110, unit="px")}</div>'
            f'<div style="position:absolute;inset:0;background:{scrim}"></div>')


SCRIM_LEFT = ("linear-gradient(90deg,rgba(11,11,15,.94) 0%,rgba(11,11,15,.80) 38%,"
              "rgba(11,11,15,.30) 72%,rgba(11,11,15,.10) 100%)")
SCRIM_DOWN = ("linear-gradient(180deg,rgba(11,11,15,.55) 0%,rgba(11,11,15,.82) 45%,"
              "rgba(11,11,15,.94) 100%)")


# ─────────────────────────────────────────────────────────────────────────────
def roller_banner() -> str:
    """850 x 2100mm pull-up.

    TWO PHYSICAL CONSTRAINTS DRIVE EVERY NUMBER HERE.

    1. Height above the floor, not position in the artwork. The cassette
       swallows the bottom 100mm and stands the visible edge ~150mm up, so
       floor_height = (2000 - y) + 150.  That puts:
         headline  y 400-700  -> 1450-1750mm above floor (eye level)
         QR panel  y 920-1220 -> ~1090mm above floor (chest — where a phone
                                 comes up naturally; a QR at the tidy-looking
                                 BOTTOM of a banner sits near 400mm and makes
                                 people crouch, which they simply don't)

    2. Legibility at distance. Roughly 1cm of cap height per 3m of viewing
       distance. A trade-show aisle is 2-3m, so nothing below the headline may
       drop under ~20mm — the first cut of this file set the services list at
       9.6mm, which looks balanced zoomed out on a screen and is unreadable in
       the room. Screen proofs lie about this; the mm figures do not.

    The QR is 190mm. Readable distance is about 10x the symbol side, so that
    carries ~1.9m — the full width of an aisle.
    """
    stats = "".join(
        f'<div style="flex:1"><div class="t-num" style="font-size:56mm">'
        f'<span class="grad-ink">{s["value"]}</span></div>'
        f'<div class="t-body" style="font-size:15mm;margin-top:5mm">{s["label"]}</div></div>'
        for s in COPY["proof"])

    svc = "".join(
        f'<li style="display:flex;align-items:flex-start;gap:8mm;margin-bottom:20mm">'
        f'<span style="flex:none;width:6mm;height:6mm;border-radius:50%;margin-top:8mm;'
        f'background:linear-gradient(135deg,{C["cyan400"]},{C["violet300"]})"></span>'
        f'<span class="t-lead" style="font-size:23mm">{s}</span></li>'
        for s in COPY["services"])

    return f"""
<div class="sheet" style="width:850mm;height:2100mm">
  {mesh([("a", "-18%", "-8%", "86%", "30%"),
         ("b", "36%", "26%", "92%", "28%"),
         ("c", "-26%", "58%", "84%", "26%")], blur="150mm")}
  <div style="position:absolute;inset:0;opacity:.55">{lattice(850, 2100, seed=11, n=70)}</div>

  <div style="position:absolute;left:70mm;right:70mm;top:150mm">{lockup("54mm","36mm")}</div>

  <div class="t-eyebrow ink-cyan" style="position:absolute;left:70mm;top:335mm;font-size:14mm">
    {COPY['positioning']}
  </div>

  <h1 class="t-display" style="position:absolute;left:70mm;right:40mm;top:398mm;font-size:96mm">
    AI-driven<br>digital<br><span class="grad-ink">transformation</span>
  </h1>

  <p class="t-lead" style="position:absolute;left:70mm;right:95mm;top:775mm;font-size:27mm">
    {COPY['subhead']}
  </p>

  <!-- ── CTA + QR, at chest height ────────────────────────────────────── -->
  <div class="glass" style="position:absolute;left:70mm;right:70mm;top:920mm;height:300mm;
              border-radius:30mm;display:flex;align-items:center;gap:38mm;padding:0 40mm">
    <div style="flex:none;background:#fff;padding:10mm;border-radius:16mm;
                box-shadow:0 8mm 26mm rgba(0,0,0,.45)">
      {qr("roller-banner", "mono", "190mm")}
    </div>
    <div>
      <div class="t-title" style="font-size:32mm">{COPY['cta']}</div>
      <div class="t-body" style="font-size:20mm;margin-top:10mm">{COPY['ctaSub']}</div>
      <div class="rule" style="height:2.4mm;width:96mm;margin-top:18mm;border-radius:1.2mm"></div>
    </div>
  </div>

  <div style="position:absolute;left:70mm;right:70mm;top:1300mm;display:flex;gap:24mm">{stats}</div>

  <ul style="position:absolute;left:70mm;right:70mm;top:1530mm;list-style:none;
             columns:2;column-gap:40mm">{svc}</ul>

  <div class="rule" style="position:absolute;left:70mm;width:220mm;top:1790mm;height:1.6mm;
              border-radius:.8mm;opacity:.7"></div>
  <div style="position:absolute;left:70mm;right:70mm;top:1822mm;display:flex;
              justify-content:space-between;align-items:baseline">
    <span class="t-title" style="font-size:26mm">www.unodigit.com.au</span>
    <span class="t-body dim" style="font-size:17mm">
      {ORG['email']} &nbsp;·&nbsp; {ORG['locality']}, {ORG['region']}
    </span>
  </div>
</div>"""


# ─────────────────────────────────────────────────────────────────────────────
SERVICE_BLURBS = [
    "Roadmaps that align AI adoption with business objectives.",
    "Predictive analytics, NLP and computer vision, built to fit.",
    "Pipelines and infrastructure that make an organisation AI-ready.",
    "Modern, scalable applications on current technology.",
    "Intelligent automation that removes cost from operations.",
    "Enterprise-grade infrastructure for deploying and scaling AI.",
]


def a4_flyer() -> str:
    """A4 leave-behind, 210 x 297mm.

    The service rows and the CTA panel are laid out from DERIVED heights, and
    the assertion below is the point of the exercise. The first version put the
    panel at a hand-picked 246mm and estimated each row at ~19mm — forgetting
    that `padding: 6mm 0` is six top AND six bottom. The rows were really
    24.7mm, so six of them ran to 277mm and the panel sat on top of the last
    two services. Half a millimetre of arithmetic beats eyeballing a proof.
    """
    PAD = 16.0
    ROW_PAD, TITLE, GAP, DESC = 3.5, 5.2, 1.4, 3.4
    row_h = ROW_PAD * 2 + TITLE * 1.06 + GAP + DESC * 1.45
    svc_top = 128.0
    svc_h = row_h * len(COPY["services"])

    PANEL_H = 34.0
    panel_top = 297.0 - PAD - PANEL_H
    assert svc_top + svc_h <= panel_top - 3, (
        f"A4 services run to {svc_top + svc_h:.1f}mm and collide with the CTA "
        f"panel at {panel_top:.1f}mm")

    head_px = fit_px(["AI-driven digital", "transformation"], 210 - 2 * PAD, 23.0)

    svc = "".join(
        f'<div style="padding:{ROW_PAD}mm 0;border-top:.3mm solid rgba(255,255,255,.14)">'
        f'<div class="t-title" style="font-size:{TITLE}mm">{name}</div>'
        f'<div class="t-body" style="font-size:{DESC}mm;margin-top:{GAP}mm">{blurb}</div></div>'
        for name, blurb in zip(COPY["services"], SERVICE_BLURBS))

    return f"""
<div class="sheet" style="width:210mm;height:297mm">
  {mesh([("a", "-20%", "-14%", "88%", "38%"),
         ("b", "40%", "56%", "86%", "40%")], blur="34mm")}
  <div style="position:absolute;inset:0;opacity:.5">{lattice(210, 297, seed=5, n=130)}</div>
  <div style="position:absolute;left:{PAD}mm;top:{PAD}mm">{lockup("11mm","7.2mm")}</div>
  <div class="t-eyebrow ink-cyan" style="position:absolute;left:{PAD}mm;top:44mm;font-size:3.1mm">
    {COPY['positioning']}
  </div>
  <h1 class="t-display" style="position:absolute;left:{PAD}mm;right:{PAD}mm;top:52mm;
      font-size:{head_px}mm">
    AI-driven digital<br><span class="grad-ink">transformation</span>
  </h1>
  <p class="t-lead" style="position:absolute;left:{PAD}mm;right:{PAD + 14}mm;top:108mm;font-size:5mm">
    {COPY['subhead']}
  </p>
  <div style="position:absolute;left:{PAD}mm;right:{PAD}mm;top:{svc_top}mm">{svc}</div>
  <div class="glass" style="position:absolute;left:{PAD}mm;right:{PAD}mm;top:{panel_top}mm;
              height:{PANEL_H}mm;border-radius:6mm;display:flex;align-items:center;
              gap:7mm;padding:0 7mm">
    <div style="flex:none;background:#fff;padding:2.2mm;border-radius:3.2mm">
      {qr("a4-flyer", "mono", "25mm")}
    </div>
    <div>
      <div class="t-title" style="font-size:5.4mm">{COPY['cta']}</div>
      <div class="t-body" style="font-size:3.3mm;margin-top:1.4mm">{COPY['ctaSub']}</div>
      <div class="t-body dim" style="font-size:3.2mm;margin-top:2.6mm">
        www.unodigit.com.au &nbsp;·&nbsp; {ORG['email']}
      </div>
    </div>
  </div>
</div>"""


# ─────────────────────────────────────────────────────────────────────────────
def business_card() -> str:
    """91 x 61mm = an 85 x 55mm card plus 3mm bleed on every edge.

    Two pages. Trim and safe-margin guides are NOT baked in — render.py draws
    them over a rasterised copy into dist/proof/, so the PDF the printer gets
    contains artwork and nothing else.

    Everything on the reverse is sized against the SAFE BOX, not the page. With
    3mm bleed and a 4mm safe margin the usable column runs 7mm to 84mm, and the
    first version's 43mm QR plus a 7mm gutter left only 32mm for a line of type
    that needed 37mm — so "Scan to start" and the email address crossed the
    margin and into the guillotine's tolerance. The guide proof is what caught
    it; on the artwork alone it looks like generous spacing.
    """
    BLEED, SAFE = 3.0, 4.0
    m = BLEED + SAFE                    # 7mm — first safe millimetre
    right = 91.0 - m                    # 84mm — last safe millimetre
    qr_side, gutter = 37.0, 5.0
    text_left = m + qr_side + gutter
    text_w = right - text_left          # 35mm

    return f"""
<div class="sheet" style="width:91mm;height:61mm">
  {mesh([("a", "-28%", "-30%", "90%", "110%"), ("b", "46%", "34%", "86%", "110%")], blur="16mm")}
  <div style="position:absolute;inset:0;opacity:.45">{lattice(91, 61, seed=3, n=40)}</div>
  <div style="position:absolute;left:{m + 4}mm;top:20mm">{lockup("12mm","8mm")}</div>
  <div class="t-body" style="position:absolute;left:{m + 4}mm;top:36mm;font-size:3.1mm">
    {COPY['positioning']}
  </div>
  <div class="rule" style="position:absolute;left:{m + 4}mm;top:43mm;width:18mm;height:.7mm;
              border-radius:.4mm"></div>
</div>
<div class="sheet" style="width:91mm;height:61mm;background:#fff">
  <div style="position:absolute;left:{m}mm;top:{(61 - qr_side) / 2:.2f}mm">
    {qr("business-card", "mono", f"{qr_side}mm")}
  </div>
  <div style="position:absolute;left:{text_left}mm;width:{text_w}mm;top:50%;
              transform:translateY(-50%);color:#111">
    <div class="t-title" style="font-size:4.2mm;color:#111">Scan to start</div>
    <div class="t-body" style="font-size:2.9mm;color:rgba(0,0,0,.62);margin-top:1.4mm">
      Scope your project with our BA bot in five minutes.
    </div>
    <div class="t-body" style="font-size:2.9mm;color:{C['cyan700']};margin-top:3.4mm">
      www.unodigit.com.au
    </div>
    <div class="t-body" style="font-size:2.7mm;color:rgba(0,0,0,.62)">{ORG['email']}</div>
  </div>
</div>"""


# ─────────────────────────────────────────────────────────────────────────────
def strip(a: dict) -> str:
    """Wide-and-short header (LinkedIn cover, X header, Facebook cover, WeChat).

    `avoid_left` is the region the PLATFORM covers with its own chrome — the
    profile avatar on LinkedIn and X, the crop difference between desktop and
    mobile on Facebook. Designing to the file's dimensions instead of to the
    safe region is the most common way a header ships with its logo hidden
    behind a profile picture.

    The headline size is MEASURED to fit, not derived from the canvas height.
    Deriving it from height put "transformation" underneath the QR panel on the
    1640x664 Facebook cover, because that canvas is short relative to how much
    of its width the QR and the avatar together consume.
    """
    w, h = a["w"], a["h"]
    pad = a.get("pad", round(h * 0.16))
    left = a.get("avoid_left", 0) + pad
    qr_side = round(h * 0.62)
    right_pad = pad + qr_side + pad
    avail = w - left - right_pad

    lines = ["AI-driven digital", "transformation"]
    hsize = fit_px(lines, avail, a.get("hsize", round(h * 0.21)))
    mark, word = round(h * 0.17), round(h * 0.12)
    eyebrow = max(9, round(h * 0.046))

    return f"""
<div class="sheet" style="width:{w}px;height:{h}px">
  {backdrop(a, "wide", SCRIM_LEFT)}
  <div style="position:absolute;left:{left}px;right:{right_pad}px;top:50%;
              transform:translateY(-50%)">
    <div style="margin-bottom:{round(h*0.055)}px">{lockup(f"{mark}px", f"{word}px")}</div>
    <div class="t-eyebrow ink-cyan" style="font-size:{eyebrow}px;margin-bottom:{round(h*0.045)}px">
      {COPY['positioning']}
    </div>
    <div class="t-display" style="font-size:{hsize}px">
      AI-driven digital<br><span class="grad-ink">transformation</span>
    </div>
  </div>
  <div style="position:absolute;right:{pad}px;top:50%;transform:translateY(-50%);
              background:#fff;padding:{max(6, qr_side // 22)}px;
              border-radius:{qr_side // 8}px;box-shadow:0 10px 40px rgba(0,0,0,.45)">
    {qr(a["slug"], "mono", f"{qr_side}px")}
  </div>
</div>"""


def strip_minimal(a: dict) -> str:
    """The LinkedIn company banner: 1128 x 191, with the page's own logo tile
    sitting over the lower left.

    At 191px tall there is not room for a lockup, an eyebrow AND a headline, so
    the lockup goes — LinkedIn already renders the company logo directly over
    this image, and repeating it is the one element that is genuinely redundant
    here. Everything that remains is measured against the surviving width.
    """
    w, h = a["w"], a["h"]
    pad = round(h * 0.16)
    qr_side = round(h * 0.70)
    left = a.get("avoid_left", 0) + pad
    avail = w - left - (pad + qr_side + pad)

    lines = ["AI-driven digital", "transformation"]
    eyebrow = round(h * 0.085)
    gap = round(h * 0.05)
    hsize = fit_px(lines, avail, round((h - 2 * pad - eyebrow - gap) / (2 * 0.97)))

    return f"""
<div class="sheet" style="width:{w}px;height:{h}px">
  {backdrop(a, "wide", SCRIM_LEFT)}
  <div style="position:absolute;left:{left}px;right:{pad + qr_side + pad}px;top:50%;
              transform:translateY(-50%)">
    <div class="t-eyebrow ink-cyan" style="font-size:{eyebrow}px;margin-bottom:{gap}px">
      {COPY['positioning']}
    </div>
    <div class="t-display" style="font-size:{hsize}px">
      AI-driven digital<br><span class="grad-ink">transformation</span>
    </div>
  </div>
  <div style="position:absolute;right:{pad}px;top:50%;transform:translateY(-50%);
              background:#fff;padding:{max(5, qr_side // 24)}px;border-radius:{qr_side // 8}px">
    {qr(a["slug"], "mono", f"{qr_side}px")}
  </div>
</div>"""


# ─────────────────────────────────────────────────────────────────────────────
def card(a: dict) -> str:
    w, h = a["w"], a["h"]
    pad = int(min(w, h) * 0.085)
    head = a.get("headline", "AI-driven digital <span class='grad-ink'>transformation</span>")
    sub = a.get("sub", COPY["subhead"])
    qr_side = int(min(w, h) * 0.235)
    return f"""
<div class="sheet" style="width:{w}px;height:{h}px">
  {backdrop(a, "wide", SCRIM_DOWN)}
  <div style="position:absolute;left:{pad}px;top:{pad}px">{lockup(f"{int(h*0.062)}px", f"{int(h*0.042)}px")}</div>
  <div style="position:absolute;left:{pad}px;right:{pad}px;top:{int(h*0.30)}px">
    <div class="t-eyebrow ink-cyan" style="font-size:{int(h*0.021)}px;margin-bottom:{int(h*0.028)}px">
      {COPY['positioning']}
    </div>
    <div class="t-display" style="font-size:{a.get('hsize', int(h*0.098))}px">{head}</div>
    <div class="t-lead" style="font-size:{int(h*0.031)}px;margin-top:{int(h*0.035)}px;max-width:{int(w*0.66)}px">
      {sub}
    </div>
  </div>
  <div style="position:absolute;left:{pad}px;bottom:{pad}px;display:flex;align-items:center;gap:{int(pad*0.8)}px">
    <div style="background:#fff;padding:{int(qr_side*0.055)}px;border-radius:{int(qr_side*0.13)}px">
      {qr(a["slug"], "mono", f"{qr_side}px")}
    </div>
    <div>
      <div class="t-title" style="font-size:{int(h*0.030)}px">{COPY['cta']}</div>
      <div class="t-body" style="font-size:{int(h*0.021)}px;margin-top:{int(h*0.008)}px">www.unodigit.com.au</div>
    </div>
  </div>
</div>"""


def channel(a: dict) -> str:
    """YouTube channel art: one 2560x1440 file, four different crops.

    YouTube does not show this image; it shows a crop of it, and which crop
    depends on the device. TV shows the whole 2560x1440. Desktop shows a
    centred 2560x423. Phone shows a centred **1546x423**. That smallest box is
    the only region guaranteed to survive, so everything that must be read
    lives inside it and the rest of the canvas is atmosphere.

    The generic `card` layout anchors its content to the top-left corner, which
    is fine for a feed post and puts every word of a channel banner outside the
    phone crop.
    """
    w, h = a["w"], a["h"]
    SAFE_W, SAFE_H = 1546, 423          # the phone crop
    sx, sy = (w - SAFE_W) // 2, (h - SAFE_H) // 2
    qr_side = round(SAFE_H * 0.78)
    gap = round(SAFE_W * 0.045)
    text_w = SAFE_W - qr_side - gap * 2
    hsize = fit_px(["AI-driven digital", "transformation"], text_w, round(SAFE_H * 0.20))

    return f"""
<div class="sheet" style="width:{w}px;height:{h}px">
  <div style="position:absolute;inset:0;opacity:.85">{lattice(w, h, seed=23, n=150, unit="px")}</div>
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse 60% 45% at 50% 50%,
              rgba(11,11,15,.90) 0%,rgba(11,11,15,.62) 55%,rgba(11,11,15,.25) 100%)"></div>
  <div style="position:absolute;left:{sx}px;top:{sy}px;width:{SAFE_W}px;height:{SAFE_H}px;
              display:flex;align-items:center;gap:{gap}px">
    <div style="flex:1">
      <div style="margin-bottom:{round(SAFE_H*0.07)}px">
        {lockup(f"{round(SAFE_H*0.15)}px", f"{round(SAFE_H*0.105)}px")}
      </div>
      <div class="t-eyebrow ink-cyan" style="font-size:{round(SAFE_H*0.045)}px;
           margin-bottom:{round(SAFE_H*0.05)}px">{COPY['positioning']}</div>
      <div class="t-display" style="font-size:{hsize}px">
        AI-driven digital<br><span class="grad-ink">transformation</span>
      </div>
    </div>
    <div style="flex:none;background:#fff;padding:{round(qr_side*0.05)}px;
                border-radius:{round(qr_side*0.11)}px;box-shadow:0 16px 60px rgba(0,0,0,.5)">
      {qr(a["slug"], "mono", f"{qr_side}px")}
    </div>
  </div>
</div>"""



# ─────────────────────────────────────────────────────────────────────────────
def story(a: dict) -> str:
    """9:16 vertical (Instagram story, WeChat name card).

    Geometry is computed and checked, not guessed at in percentages. The first
    version positioned the CTA panel with `bottom: 16%` and let its contents
    decide its height; the panel grew upward and swallowed the headline. A
    bottom-anchored box whose height depends on its children will always do
    that — so here the panel's height is DERIVED from its parts, its top edge
    is computed, and the headline block is laid out to end above it.

    Platform UI covers roughly the top 250px and bottom 250px of a story, so
    nothing meaningful is allowed into those bands.
    """
    w, h = a["w"], a["h"]
    pad = round(w * 0.10)
    qr_side = round(w * 0.33)
    qr_pad = round(qr_side * 0.055)
    title_px, sub_px = round(w * 0.042), round(w * 0.028)

    panel_pad = round(w * 0.055)
    panel_h = qr_side + 2 * qr_pad + round(w * 0.045) + title_px + round(w * 0.016) + sub_px + 2 * panel_pad
    panel_bottom = round(h * 0.135)
    panel_top = h - panel_bottom - panel_h

    head_px = round(w * 0.115)
    head_h = round(head_px * 0.97 * 3)
    eyebrow_px = round(w * 0.027)
    head_top = round(h * 0.275)
    assert head_top + head_h < panel_top, (
        f"story headline (ends {head_top + head_h}) collides with CTA panel (starts {panel_top})")

    return f"""
<div class="sheet" style="width:{w}px;height:{h}px">
  {backdrop(a, "vertical", SCRIM_DOWN)}
  <div style="position:absolute;left:{pad}px;top:{round(h*0.105)}px">
    {lockup(f"{round(w*0.082)}px", f"{round(w*0.054)}px")}
  </div>
  <div class="t-eyebrow ink-cyan"
       style="position:absolute;left:{pad}px;right:{pad}px;top:{head_top - round(w*0.075)}px;
              font-size:{eyebrow_px}px">{COPY['positioning']}</div>
  <div class="t-display"
       style="position:absolute;left:{pad}px;right:{pad}px;top:{head_top}px;font-size:{head_px}px">
    AI-driven<br>digital<br><span class="grad-ink">transformation</span>
  </div>
  <div class="glass" style="position:absolute;left:{pad}px;right:{pad}px;top:{panel_top}px;
              height:{panel_h}px;border-radius:{round(w*0.06)}px;padding:{panel_pad}px;
              text-align:center">
    <div style="background:#fff;padding:{qr_pad}px;border-radius:{round(qr_side*0.12)}px;
                display:inline-block;line-height:0">{qr(a["slug"], "mono", f"{qr_side}px")}</div>
    <div class="t-title" style="font-size:{title_px}px;margin-top:{round(w*0.045)}px">{COPY['cta']}</div>
    <div class="t-body" style="font-size:{sub_px}px;margin-top:{round(w*0.016)}px">www.unodigit.com.au</div>
  </div>
</div>"""


# ─────────────────────────────────────────────────────────────────────────────
def signature(a: dict) -> str:
    w, h = a["w"], a["h"]
    return f"""
<div class="sheet" style="width:{w}px;height:{h}px">
  {backdrop(a, "wide", SCRIM_LEFT)}
  <div style="position:absolute;left:44px;top:50%;transform:translateY(-50%)">
    <div>{lockup("40px","26px")}</div>
    <div class="t-body" style="font-size:15px;margin-top:14px">{COPY['positioning']}</div>
    <div class="t-body" style="font-size:15px;margin-top:4px">
      <span class="ink-cyan">www.unodigit.com.au</span> &nbsp;·&nbsp; {ORG['email']}
    </div>
  </div>
  <div style="position:absolute;right:44px;top:50%;transform:translateY(-50%);
              display:flex;align-items:center;gap:20px">
    <div class="t-body" style="font-size:14px;text-align:right;max-width:150px">Scan to scope<br>your project</div>
    <div style="background:#fff;padding:8px;border-radius:14px">{qr(a["slug"], "mono", "148px")}</div>
  </div>
</div>"""


# ─────────────────────────────────────────────────────────────────────────────
def staff_card(slug: str) -> str:
    """A named staff card. 91 x 61mm = 85 x 55mm trim plus 3mm bleed.

    Laid out against the SAFE BOX (7mm..84mm across, 7mm..54mm down), never the
    page, and the contact block's last baseline is asserted to clear it. On a
    card, 2mm of overrun is not a visual nitpick — it is inside the guillotine's
    tolerance, and a trimmed-off phone number is a reprint.

    The reverse carries a vCard QR rather than a website link. Scanning a
    person's card should leave you with the person; the tagged URL rides along
    in the vCard's URL field, so the analytics attribution survives either way.
    """
    import vcard
    P = vcard.person(slug)
    BLEED, SAFE = 3.0, 4.0
    m = BLEED + SAFE                     # 7mm
    right, bottom = 91.0 - m, 61.0 - m   # 84mm, 54mm

    NAME, TITLE, LINE = 7.4, 2.9, 2.9
    step = LINE * 1.45                   # 4.2mm between contact baselines
    contacts_top = 40.6
    assert contacts_top + step * 3 <= bottom, (
        f"staff card contact block ends at {contacts_top + step * 3:.1f}mm, "
        f"past the {bottom}mm safe line")

    qr_side, gutter = 40.0, 5.0
    qr_x = m + 1.0
    text_x = qr_x + qr_side + gutter     # 53mm
    assert text_x < right - 20, "staff card reverse has no room for a text column"

    rows = [(P["email"], C["cyan400"]), (P["phoneDisplay"], "rgba(235,235,245,.86)"),
            ("www.unodigit.com.au", "rgba(235,235,245,.86)")]
    contact = "".join(
        f'<div style="position:absolute;left:{m + 4}mm;top:{contacts_top + i * step:.2f}mm;'
        f'font-size:{LINE}mm;color:{col};letter-spacing:-.003em">{txt}</div>'
        for i, (txt, col) in enumerate(rows))

    return f"""
<div class="sheet" style="width:91mm;height:61mm">
  {mesh([("a", "-30%", "-34%", "84%", "112%"), ("b", "50%", "30%", "84%", "115%")], blur="16mm")}
  <div style="position:absolute;inset:0;opacity:.45">{lattice(91, 61, seed=13, n=42)}</div>

  <div style="position:absolute;left:{m + 4}mm;top:{m + 3.5}mm">{lockup("8.6mm","5.7mm")}</div>

  <div class="t-display" style="position:absolute;left:{m + 4}mm;top:22.4mm;font-size:{NAME}mm">
    {P['name']}
  </div>
  <div class="t-eyebrow ink-cyan" style="position:absolute;left:{m + 4.4}mm;top:32.4mm;
       font-size:{TITLE}mm">{P['title']}</div>
  <div class="rule" style="position:absolute;left:{m + 4}mm;top:37.2mm;width:15mm;height:.6mm;
       border-radius:.3mm"></div>
  {contact}
</div>

<div class="sheet" style="width:91mm;height:61mm;background:#fff">
  <div style="position:absolute;left:{qr_x}mm;top:{(61 - qr_side) / 2:.2f}mm">
    {qr(f"staff-{slug}", "vcard", f"{qr_side}mm")}
  </div>
  <div style="position:absolute;left:{text_x}mm;width:{right - text_x:.1f}mm;top:50%;
              transform:translateY(-50%);color:#111">
    <div class="t-title" style="font-size:4.0mm;color:#111">Scan to save<br>my contact</div>
    <div class="t-body" style="font-size:2.7mm;color:rgba(0,0,0,.6);margin-top:2mm">
      Adds {P['given']} straight to your phone.
    </div>
    <div style="margin-top:5.5mm">{lockup("6.4mm","4.4mm",color="#111",accent=C["cyan700"])}</div>
    <div class="t-body" style="font-size:2.5mm;color:rgba(0,0,0,.55);margin-top:1.6mm">
      {ORG['locality']}, {ORG['region']}
    </div>
  </div>
</div>"""

