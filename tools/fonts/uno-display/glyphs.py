"""
Uno Display — the parametric construction system.

Every glyph in this file is DRAWN, not derived from another typeface. Each is
composed from primitive shapes (rings, bars, stems, wedges) combined with
boolean operations, so contour winding is solved by skia-pathops rather than by
hand-ordering points.

WHY GEOMETRIC
-------------
Geometric is the one genre where parametric construction genuinely produces
good type, because circles, stems and diagonals *are* parametric. A humanist
text face depends on thousands of hand judgements that code cannot fake; a
geometric display face depends on a rigorous system, which is exactly what code
is good at.

THE FOUR SIGNATURES
-------------------
1. Square node   — dots on i j ! ? . , : ; are squares. Descends directly from
                   the two violet nodes in the logo, and matches the ss07
                   substitution frozen into Uno Sans. The two faces agree.
2. Flat apex     — A M N V W v w are flattened, never pointed. Reads as
                   machined precision, and pointed apexes are where amateur
                   type falls apart.
3. U is the mark — two verticals joined by a true semicircle, squared
                   terminals. The first letter of the name and the logo itself.
4. Numerals      — "Uno Digit": 1 takes a full flat foot, 0 carries a node in
                   its counter. Tabular by default.

OPTICAL CORRECTIONS (the part that separates type from shapes)
--------------------------------------------------------------
- Round glyphs OVERSHOOT the baseline and cap line by OVER units. Without this
  an O visibly sits smaller than an H at the same nominal height.
- Horizontal bars are drawn THINNER than vertical stems (BAR < STEM). Equal
  measures read heavier horizontally.
- Joins are thinned (JOIN) where a curve meets a stem, or ink pools.
- The crossbar of A E F H P R sits ABOVE the mathematical centre, because the
  eye reads centre high.
"""

from __future__ import annotations

import math

import pathops

# --------------------------------------------------------------------------
# The parameter system. Weight is a variable — every instance is generated
# from this one set of numbers, which is what makes a weight axis possible.
# --------------------------------------------------------------------------

UPM = 1000
CAP = 700          # cap height
XH = 512           # x-height — deliberately near Uno Sans's calibrated 0.5078
                   # so Display and Sans sit together on a page
ASC = 730          # ascender (b d f h k l)
DESC = -205        # descender (g j p q y)
OVER = 12          # overshoot on round forms. 0.9% (=9) read as NO overshoot
                   # in review; 1.2% is mid-range for the 1.0-1.5% norm.
FIG = 700          # figure height — aligned to caps


class Weight:
    """One instance of the family. Weight is a parameter, not a redraw."""

    def __init__(self, stem: float, name: str, css: int):
        self.name = name
        self.css = css
        self.stem = stem
        self.bar = stem * 0.90        # horizontals read heavier — thin them
        self.join = stem * 0.88       # ink pools at joins
        self.node = stem * 1.08       # the square dot, slightly larger than stem
        # Sidebearings shrink as weight grows, or bold looks airy — but the
        # first model (88 - stem*0.20 / 52 - stem*0.16) shrank them LINEARLY
        # while stems grew, so the fit collapsed across the family:
        # gap/stem ran 3.01 / 1.84 / 1.37 / 0.95 from Light to Bold, and Bold
        # was genuinely cramped. Inter over the same span runs 2.16 -> 1.28.
        # Shallower slopes hold the ratio in a usable band.
        self.sb_flat = 86 - stem * 0.10
        # Tuned so sb_flat / sb_round stays ~1.70 at EVERY weight (Inter ~1.69).
        # At 1.84 the flat-sided pairs read open beside round ones — which is
        # why U|N gapped next to N|O in the wordmark.
        self.sb_round = 52 - stem * 0.073


REGULAR = Weight(82, "Regular", 400)
MEDIUM = Weight(104, "Medium", 500)
BOLD = Weight(136, "Bold", 700)
LIGHT = Weight(54, "Light", 300)

K = 0.5522847498307936  # cubic bezier circle constant
BIG = 4000              # effectively infinite, for cutting rectangles


# --------------------------------------------------------------------------
# Primitives
# --------------------------------------------------------------------------

def _path() -> pathops.Path:
    return pathops.Path()


def rect(x0: float, y0: float, x1: float, y1: float) -> pathops.Path:
    p = _path()
    pen = p.getPen()
    pen.moveTo((x0, y0))
    pen.lineTo((x1, y0))
    pen.lineTo((x1, y1))
    pen.lineTo((x0, y1))
    pen.closePath()
    return p


def poly(*pts) -> pathops.Path:
    p = _path()
    pen = p.getPen()
    pen.moveTo(pts[0])
    for pt in pts[1:]:
        pen.lineTo(pt)
    pen.closePath()
    return p


def ellipse(cx: float, cy: float, rx: float, ry: float) -> pathops.Path:
    p = _path()
    pen = p.getPen()
    pen.moveTo((cx + rx, cy))
    pen.curveTo((cx + rx, cy + ry * K), (cx + rx * K, cy + ry), (cx, cy + ry))
    pen.curveTo((cx - rx * K, cy + ry), (cx - rx, cy + ry * K), (cx - rx, cy))
    pen.curveTo((cx - rx, cy - ry * K), (cx - rx * K, cy - ry), (cx, cy - ry))
    pen.curveTo((cx + rx * K, cy - ry), (cx + rx, cy - ry * K), (cx + rx, cy))
    pen.closePath()
    return p


def union(*paths) -> pathops.Path:
    out = _path()
    pathops.union([p for p in paths if p is not None], out.getPen())
    return out


def diff(subject: pathops.Path, *clips) -> pathops.Path:
    out = _path()
    pathops.difference([subject], list(clips), out.getPen())
    return out


def isect(a: pathops.Path, b: pathops.Path) -> pathops.Path:
    out = _path()
    pathops.intersection([a], [b], out.getPen())
    return out


def ring(cx: float, cy: float, rx: float, ry: float, t: float,
         tv: float | None = None) -> pathops.Path:
    """An annulus, thickness t at the sides and tv at top and bottom.

    OPTICAL CORRECTION: tv defaults to 0.90*t because a curve of uniform
    thickness reads HEAVY at its top and bottom, where the stroke runs
    horizontally. Every round glyph in the face depends on this — it is the
    single correction that separates drawn bowls from stroked ellipses.
    """
    tv = t * 0.90 if tv is None else tv
    return diff(ellipse(cx, cy, rx, ry), ellipse(cx, cy, rx - t, ry - tv))


def wedge(cx: float, cy: float, a0: float, a1: float, r: float = BIG) -> pathops.Path:
    """Pie sector from a0 to a1 degrees, CCW. Used for radial cuts."""
    pts = [(cx, cy)]
    steps = max(2, int(abs(a1 - a0) / 4))
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return poly(*pts)


def stem(x: float, y0: float, y1: float, w: float) -> pathops.Path:
    return rect(x, y0, x + w, y1)


def bar(x0: float, x1: float, y: float, h: float) -> pathops.Path:
    """A horizontal bar centred on y."""
    return rect(x0, y - h / 2, x1, y + h / 2)


def diagonal(x0: float, y0: float, x1: float, y1: float, w: float) -> pathops.Path:
    """A stroke of PERPENDICULAR weight w, from (x0,y0) to (x1,y1).

    The parallelogram is still cut on horizontals — that is what keeps diagonal
    joins flush against vertical stems and against the flat cuts at baseline and
    cap line. But the horizontal offset is widened by 1/sin(theta), so the
    stroke's true perpendicular thickness stays w regardless of its angle.

    Without this, a 52-degree stroke drawn at w=82 measures only 82*sin(52) = 65
    units across and reads visibly lighter than the stems beside it. Q's tail is
    the worst case; every diagonal in the face was carrying some of it.
    """
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    sin_theta = abs(dy) / length if length else 1.0
    h = w / max(sin_theta, 0.30)   # clamped: a near-horizontal stroke would blow up
    return poly((x0 - h / 2, y0), (x0 + h / 2, y0), (x1 + h / 2, y1), (x1 - h / 2, y1))


def node_square(cx: float, cy: float, s: float) -> pathops.Path:
    """SIGNATURE 1 — the square node. Never a circle."""
    return rect(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2)


def flat_apex(p: pathops.Path, y: float, above: bool) -> pathops.Path:
    """SIGNATURE 2 — shear the point off an apex, leaving a flat cut."""
    if above:
        return diff(p, rect(-BIG, y, BIG, BIG))
    return diff(p, rect(-BIG, -BIG, BIG, y))


# --------------------------------------------------------------------------
# Shared letter parts
# --------------------------------------------------------------------------

def bowl(cx, cy, rx, ry, t, open_from=None, open_to=None, cut=None):
    """A ring, optionally opened by a radial wedge or a rectangular cut."""
    r = ring(cx, cy, rx, ry, t)
    if open_from is not None:
        r = diff(r, wedge(cx, cy, open_from, open_to))
    if cut is not None:
        r = diff(r, cut)
    return r


def arch(x0, x1, ytop, ybase, t):
    """The n/m/h shoulder: a half-ring sitting on two legs."""
    cx = (x0 + x1) / 2
    rx = (x1 - x0) / 2
    ry = min(rx, (ytop - ybase) * 0.62)
    cy = ytop - ry
    half = diff(ring(cx, cy, rx, ry, t), rect(-BIG, -BIG, BIG, cy))
    return union(half, rect(x0, ybase, x0 + t, cy), rect(x1 - t, ybase, x1, cy))


# --------------------------------------------------------------------------
# GLYPHS
#
# Each returns (path, advance_width). Coordinates are absolute within the em,
# with the left sidebearing already applied.
# --------------------------------------------------------------------------

def _cap_round(w):
    """Geometry shared by every round capital: O C G Q."""
    sb = w.sb_round
    rx = 306
    ry = CAP / 2 + OVER
    cx = sb + rx
    cy = CAP / 2
    return sb, rx, ry, cx, cy, sb * 2 + rx * 2


# ---- Uppercase -----------------------------------------------------------

def g_H(w):
    sb = w.sb_flat
    adv = sb * 2 + 480 + w.stem
    return union(
        stem(sb, 0, CAP, w.stem),
        stem(adv - sb - w.stem, 0, CAP, w.stem),
        bar(sb, adv - sb, CAP * 0.52, w.bar),   # optical centre sits high
    ), adv


def g_I(w):
    sb = w.sb_flat + 20
    return stem(sb, 0, CAP, w.stem), sb * 2 + w.stem


def g_L(w):
    sb = w.sb_flat
    adv = sb * 2 + 400
    return union(stem(sb, 0, CAP, w.stem), rect(sb, 0, adv - sb, w.bar)), adv


def g_T(w):
    sb = w.sb_flat - 26
    adv = sb * 2 + 520
    return union(
        stem((adv - w.stem) / 2, 0, CAP - w.bar, w.stem),
        rect(sb, CAP - w.bar, adv - sb, CAP),
    ), adv


def g_E(w):
    sb = w.sb_flat
    adv = sb * 2 + 420
    return union(
        stem(sb, 0, CAP, w.stem),
        rect(sb, CAP - w.bar, adv - sb, CAP),
        rect(sb, 0, adv - sb, w.bar),
        bar(sb, adv - sb - 26, CAP * 0.52, w.bar),
    ), adv


def g_F(w):
    sb = w.sb_flat
    adv = sb * 2 + 400
    return union(
        stem(sb, 0, CAP, w.stem),
        rect(sb, CAP - w.bar, adv - sb, CAP),
        bar(sb, adv - sb - 26, CAP * 0.54, w.bar),
    ), adv


def g_O(w):
    sb, rx, ry, cx, cy, adv = _cap_round(w)
    return ring(cx, cy, rx, ry, w.stem), adv


def g_Q(w):
    """O with a straight tail cutting the bowl — engineered, not calligraphic."""
    sb, rx, ry, cx, cy, adv = _cap_round(w)
    tail = diagonal(cx + rx * 0.26, CAP * 0.34, cx + rx * 0.95, -58, w.stem * 0.96)
    tail = diff(tail, rect(-BIG, -BIG, BIG, -58))
    return union(ring(cx, cy, rx, ry, w.stem), tail), adv


def g_C(w):
    """SIGNATURE: terminals cut on a strict horizontal, never angled."""
    sb, rx, ry, cx, cy, adv = _cap_round(w)
    ap = ry * 0.40
    return diff(ring(cx, cy, rx, ry, w.stem), rect(cx, cy - ap, BIG, cy + ap)), adv


def g_G(w):
    sb, rx, ry, cx, cy, adv = _cap_round(w)
    ap = ry * 0.40
    r = diff(ring(cx, cy, rx, ry, w.stem), rect(cx, cy - ap, BIG, cy + ap))
    spur = rect(cx + rx - w.stem, cy - ap, cx + rx, cy)          # the vertical
    crossbar = rect(cx + rx * 0.28, cy - w.bar, cx + rx, cy)      # the bar
    return union(r, spur, crossbar), adv


def g_D(w):
    sb = w.sb_flat
    ry = CAP / 2 + OVER
    rx = 316
    adv = sb + rx + w.sb_round + 40
    cx = adv - w.sb_round - rx
    right = diff(ring(cx, CAP / 2, rx, ry, w.stem), rect(-BIG, -BIG, cx, BIG))
    return union(stem(sb, 0, CAP, w.stem), right,
                 rect(sb, 0, cx, w.bar), rect(sb, CAP - w.bar, cx, CAP)), adv


def _bowl_right(w, ytop, ybot, xstem, xright, rx):
    """A right-side bowl hanging off a stem — P B R.

    The bowl is anchored to xright (the glyph's right edge) and grows LEFT.
    Anchoring it to the stem instead pushes the circle centre off the em when
    rx is large, which collapses the bowl to a sliver.
    """
    cy = (ytop + ybot) / 2
    ry = (ytop - ybot) / 2
    cx = xright - rx
    r = diff(ring(cx, cy, rx, ry, w.stem), rect(-BIG, -BIG, cx, BIG))
    # Bars meet the ring flush: the ring is w.bar thick top and bottom.
    return union(r,
                 rect(xstem, ybot, cx, ybot + w.bar),
                 rect(xstem, ytop - w.bar, cx, ytop))


def g_P(w):
    sb = w.sb_flat
    adv = sb * 2 + 400
    return union(stem(sb, 0, CAP, w.stem),
                 _bowl_right(w, CAP + OVER, CAP * 0.44 - OVER,
                             sb + w.stem, adv - sb, 208)), adv


def g_B(w):
    sb = w.sb_flat
    adv = sb * 2 + 400
    mid = CAP * 0.525
    return union(
        stem(sb, 0, CAP, w.stem),
        _bowl_right(w, CAP + OVER, mid + w.bar / 2, sb + w.stem, adv - sb, 178),
        _bowl_right(w, mid - w.bar / 2, -OVER, sb + w.stem, adv - sb, 196),
    ), adv  # lower bowl deliberately larger — an even-bowled B looks top-heavy


def g_R(w):
    sb = w.sb_flat
    adv = sb * 2 + 430
    top = CAP * 0.46
    rx = 196
    cx = adv - sb - rx
    leg = diagonal(cx - 40, top, adv - sb - w.stem * 0.15, 0, w.stem)
    leg = diff(leg, rect(-BIG, -BIG, BIG, 0), rect(-BIG, top, BIG, BIG),
               rect(-BIG, -BIG, sb + w.stem, BIG))
    return union(stem(sb, 0, CAP, w.stem),
                 _bowl_right(w, CAP + OVER, top - OVER, sb + w.stem, adv - sb, rx),
                 leg), adv


def g_S(w):
    """Two overlapping rings, cut on verticals so the spine emerges."""
    sb = w.sb_round + 6
    rx = 214
    adv = sb * 2 + rx * 2
    cx = sb + rx
    ryU, ryL = 186, 202
    cU, cL = CAP + OVER - ryU, -OVER + ryL
    upper = diff(ring(cx, cU, rx, ryU, w.stem), rect(cx, -BIG, BIG, cU))
    lower = diff(ring(cx, cL, rx, ryL, w.stem), rect(-BIG, cL, cx, BIG))
    return union(upper, lower), adv


def g_U(w):
    """SIGNATURE 3 — this is the logo mark. Verticals + a true semicircle."""
    sb = w.sb_flat
    adv = sb * 2 + 480 + w.stem
    rx = (adv - sb * 2) / 2
    cx = adv / 2
    cy = rx * 0.86
    half = diff(ring(cx, cy, rx, cy + OVER, w.stem), rect(-BIG, cy, BIG, BIG))
    return union(half, stem(sb, cy, CAP, w.stem),
                 stem(adv - sb - w.stem, cy, CAP, w.stem)), adv


def g_J(w):
    sb = w.sb_flat
    adv = sb * 2 + 330
    rx = (adv - sb * 2) / 2
    cx = sb + rx
    cy = rx * 0.80
    hook = diff(ring(cx, cy, rx, cy + OVER, w.stem), rect(-BIG, cy, BIG, BIG))
    hook = diff(hook, rect(cx + rx - w.stem, -BIG, BIG, BIG))   # no right riser
    return union(hook, stem(adv - sb - w.stem, cy, CAP, w.stem)), adv


def g_A(w):
    """SIGNATURE 2 — flat apex."""
    sb = w.sb_flat - 34
    adv = sb * 2 + 560
    apex_y = CAP + 8
    left = diagonal(adv / 2, apex_y, sb + w.stem / 2, 0, w.stem)
    right = diagonal(adv / 2, apex_y, adv - sb - w.stem / 2, 0, w.stem)
    body = flat_apex(union(left, right), CAP, above=True)
    body = diff(body, rect(-BIG, -BIG, BIG, 0))
    return union(body, bar(sb + 74, adv - sb - 74, CAP * 0.235, w.bar)), adv


def g_V(w):
    sb = w.sb_flat - 34
    adv = sb * 2 + 560
    left = diagonal(sb + w.stem / 2, CAP, adv / 2, -8, w.stem)
    right = diagonal(adv - sb - w.stem / 2, CAP, adv / 2, -8, w.stem)
    body = flat_apex(union(left, right), 0, above=False)
    return diff(body, rect(-BIG, CAP, BIG, BIG)), adv


def g_W(w):
    # W/E measured 1.52 against a 1.35-1.45 sans norm — genuinely too wide.
    # 760 brings it to ~1.45. M was checked at the same time and left alone:
    # M/E = 1.35 is already inside the norm.
    sb = w.sb_flat - 40
    adv = sb * 2 + 760
    inner = adv / 2
    q = (inner - sb) / 2
    parts = [
        diagonal(sb + w.stem / 2, CAP, sb + q + w.stem * 0.1, -8, w.stem),
        diagonal(inner, CAP, sb + q + w.stem * 0.1, -8, w.stem),
        diagonal(inner, CAP, adv - sb - q - w.stem * 0.1, -8, w.stem),
        diagonal(adv - sb - w.stem / 2, CAP, adv - sb - q - w.stem * 0.1, -8, w.stem),
    ]
    body = flat_apex(union(*parts), 0, above=False)
    return diff(body, rect(-BIG, CAP, BIG, BIG)), adv


def g_M(w):
    """The vertex stops short of the baseline — classic M, and it keeps the
    counters from closing up. The flat cut is applied to the DIAGONALS ONLY;
    cutting the assembled glyph would amputate the stems below the vertex."""
    sb = w.sb_flat - 10
    adv = sb * 2 + 640
    vertex = 130
    vee = union(
        diagonal(sb + w.stem / 2, CAP, adv / 2, vertex, w.stem * 0.94),
        diagonal(adv - sb - w.stem / 2, CAP, adv / 2, vertex, w.stem * 0.94),
    )
    vee = flat_apex(vee, vertex, above=False)
    vee = diff(vee, rect(-BIG, CAP, BIG, BIG))
    return union(vee, stem(sb, 0, CAP, w.stem),
                 stem(adv - sb - w.stem, 0, CAP, w.stem)), adv


def g_N(w):
    sb = w.sb_flat
    adv = sb * 2 + 520
    d = diagonal(sb + w.stem / 2, CAP, adv - sb - w.stem / 2, 0, w.stem * 1.02)
    d = diff(d, rect(-BIG, CAP, BIG, BIG), rect(-BIG, -BIG, BIG, 0))
    return union(stem(sb, 0, CAP, w.stem), stem(adv - sb - w.stem, 0, CAP, w.stem), d), adv


def g_K(w):
    sb = w.sb_flat
    adv = sb * 2 + 500
    j = CAP * 0.46
    up = diagonal(sb + w.stem, j, adv - sb - w.stem * 0.2, CAP, w.stem)
    lo = diagonal(sb + w.stem, j, adv - sb - w.stem * 0.2, 0, w.stem)
    arms = diff(union(up, lo), rect(-BIG, CAP, BIG, BIG), rect(-BIG, -BIG, BIG, 0),
                rect(-BIG, -BIG, sb + w.stem, BIG))
    return union(stem(sb, 0, CAP, w.stem), arms), adv


def g_X(w):
    sb = w.sb_flat - 20
    adv = sb * 2 + 520
    a = diagonal(sb + w.stem / 2, CAP, adv - sb - w.stem / 2, 0, w.stem)
    b = diagonal(adv - sb - w.stem / 2, CAP, sb + w.stem / 2, 0, w.stem)
    return diff(union(a, b), rect(-BIG, CAP, BIG, BIG), rect(-BIG, -BIG, BIG, 0)), adv


def g_Y(w):
    sb = w.sb_flat - 24
    adv = sb * 2 + 540
    j = CAP * 0.45
    a = diagonal(sb + w.stem / 2, CAP, adv / 2, j, w.stem)
    b = diagonal(adv - sb - w.stem / 2, CAP, adv / 2, j, w.stem)
    v = diff(union(a, b), rect(-BIG, CAP, BIG, BIG), rect(-BIG, -BIG, BIG, j))
    return union(v, stem((adv - w.stem) / 2, 0, j + 2, w.stem)), adv


def g_Z(w):
    sb = w.sb_flat - 10
    adv = sb * 2 + 470
    d = diagonal(adv - sb - w.stem * 0.3, CAP, sb + w.stem * 0.3, 0, w.stem * 1.06)
    d = diff(d, rect(-BIG, CAP - w.bar, BIG, BIG), rect(-BIG, -BIG, BIG, w.bar))
    return union(rect(sb, CAP - w.bar, adv - sb, CAP), rect(sb, 0, adv - sb, w.bar), d), adv


# ---- Lowercase -----------------------------------------------------------

def _lc_round(w):
    sb = w.sb_round + 4
    rx = 232
    ry = XH / 2 + OVER
    cx = sb + rx
    return sb, rx, ry, cx, XH / 2, sb * 2 + rx * 2


def g_o(w):
    sb, rx, ry, cx, cy, adv = _lc_round(w)
    return ring(cx, cy, rx, ry, w.stem * 0.97), adv


def g_c(w):
    sb, rx, ry, cx, cy, adv = _lc_round(w)
    ap = ry * 0.42
    return diff(ring(cx, cy, rx, ry, w.stem * 0.97),
                rect(cx, cy - ap, BIG, cy + ap)), adv


def g_e(w):
    """Horizontal bar, terminal cut flat — the technical e."""
    sb, rx, ry, cx, cy, adv = _lc_round(w)
    r = ring(cx, cy, rx, ry, w.stem * 0.97)
    r = diff(r, wedge(cx, cy, -46, 6))
    return union(r, rect(cx - rx, cy - w.bar / 2, cx + rx, cy + w.bar / 2)), adv


def _stem_bowl(w, xstem, adv, sb, ytop, ybot, left=False):
    rx = (adv - sb * 2) / 2
    cy = (ytop + ybot) / 2
    ry = (ytop - ybot) / 2
    cx = (sb + adv - sb) / 2
    r = ring(cx, cy, rx, ry, w.stem * 0.97)
    return r


def g_n(w):
    sb = w.sb_flat - 6
    adv = sb * 2 + 420
    return arch(sb, adv - sb, XH + OVER, 0, w.stem * 0.97), adv


def g_m(w):
    sb = w.sb_flat - 10
    adv = sb * 2 + 700
    mid = (sb + adv - sb) / 2
    return union(arch(sb, mid + w.stem / 2, XH + OVER, 0, w.stem * 0.97),
                 arch(mid - w.stem / 2, adv - sb, XH + OVER, 0, w.stem * 0.97)), adv


def g_h(w):
    sb = w.sb_flat - 6
    adv = sb * 2 + 420
    return union(arch(sb, adv - sb, XH + OVER, 0, w.stem * 0.97),
                 stem(sb, 0, ASC, w.stem)), adv


def g_u(w):
    """An inverted arch with both stems carried to the x-height. The right
    stem is full weight — in a u it is a stem, not a shoulder."""
    sb = w.sb_flat - 6
    adv = sb * 2 + 420
    t = w.stem * 0.97
    rx = (adv - sb * 2) / 2
    cx = sb + rx
    ry = min(rx, XH * 0.62)
    cy = ry - OVER
    bottom = diff(ring(cx, cy, rx, ry, t), rect(-BIG, cy, BIG, BIG))
    # Both stems at t, matching arch()'s legs in n/m/h. The right stem was
    # full w.stem, making one side of the u heavier than the other.
    return union(bottom, stem(sb, cy, XH, t),
                 stem(adv - sb - t, 0, XH, t)), adv


def g_b(w):
    sb = w.sb_flat - 6
    adv = sb * 2 + 440
    rx = (adv - sb * 2) / 2
    cx = sb + rx
    return union(ring(cx, XH / 2, rx, XH / 2 + OVER, w.stem * 0.97),
                 stem(sb, 0, ASC, w.stem)), adv


def g_d(w):
    sb = w.sb_flat - 6
    adv = sb * 2 + 440
    rx = (adv - sb * 2) / 2
    cx = sb + rx
    return union(ring(cx, XH / 2, rx, XH / 2 + OVER, w.stem * 0.97),
                 stem(adv - sb - w.stem, 0, ASC, w.stem)), adv


def g_p(w):
    sb = w.sb_flat - 6
    adv = sb * 2 + 440
    rx = (adv - sb * 2) / 2
    cx = sb + rx
    return union(ring(cx, XH / 2, rx, XH / 2 + OVER, w.stem * 0.97),
                 stem(sb, DESC, XH, w.stem)), adv


def g_q(w):
    sb = w.sb_flat - 6
    adv = sb * 2 + 440
    rx = (adv - sb * 2) / 2
    cx = sb + rx
    return union(ring(cx, XH / 2, rx, XH / 2 + OVER, w.stem * 0.97),
                 stem(adv - sb - w.stem, DESC, XH, w.stem)), adv


def g_a(w):
    """Double-storey — a single-storey a would read retro-geometric, not
    professional. Built as a bowl plus a stem plus a top shoulder."""
    sb = w.sb_flat - 10
    adv = sb * 2 + 430
    rx = (adv - sb * 2) / 2
    cx = sb + rx
    bowl_top = XH * 0.56
    b = ring(cx, bowl_top / 2, rx, bowl_top / 2 + OVER, w.stem * 0.97)
    b = diff(b, rect(adv - sb - w.stem, -BIG, BIG, BIG))
    shoulder_ry = (XH - bowl_top) + 30
    sh = ring(cx, XH + OVER - shoulder_ry, rx, shoulder_ry, w.stem * 0.97)
    sh = diff(sh, rect(-BIG, -BIG, BIG, XH + OVER - shoulder_ry),
              rect(adv - sb - w.stem, -BIG, BIG, BIG))
    return union(b, sh, stem(adv - sb - w.stem, 0, XH, w.stem)), adv


def g_s(w):
    sb = w.sb_round + 6
    rx = 172
    adv = sb * 2 + rx * 2
    cx = sb + rx
    ryU, ryL = XH * 0.27, XH * 0.29
    cU, cL = XH + OVER - ryU, -OVER + ryL
    t = w.stem * 0.95
    upper = diff(ring(cx, cU, rx, ryU, t), rect(cx, -BIG, BIG, cU))
    lower = diff(ring(cx, cL, rx, ryL, t), rect(-BIG, cL, cx, BIG))
    return union(upper, lower), adv


def g_i(w):
    """SIGNATURE 1 — the square node."""
    sb = w.sb_flat + 4
    adv = sb * 2 + w.stem
    return union(stem(sb, 0, XH, w.stem),
                 node_square(sb + w.stem / 2, XH + 108, w.node)), adv


def g_j(w):
    sb = w.sb_flat - 24
    adv = sb * 2 + 220
    x = adv - sb - w.stem
    rx = (x + w.stem - sb) / 2
    cx = sb + rx
    cy = DESC + rx * 0.9
    hook = diff(ring(cx, cy, rx, rx * 0.9, w.stem * 0.97), rect(-BIG, cy, BIG, BIG))
    hook = diff(hook, rect(x, -BIG, BIG, BIG))
    return union(hook, stem(x, cy, XH, w.stem),
                 node_square(x + w.stem / 2, XH + 108, w.node)), adv


def g_l(w):
    sb = w.sb_flat + 4
    return stem(sb, 0, ASC, w.stem), sb * 2 + w.stem


def g_t(w):
    sb = w.sb_flat - 30
    adv = sb * 2 + 300
    x = sb + 76
    top = XH * 1.34
    foot_r = 96
    s = stem(x, foot_r * 0.55, top, w.stem)
    hook = diff(ring(x + w.stem + foot_r - w.stem, foot_r * 0.55, foot_r, foot_r * 0.55,
                     w.stem * 0.95), rect(-BIG, foot_r * 0.55, BIG, BIG))
    hook = diff(hook, rect(-BIG, -BIG, x, BIG))
    return union(s, hook, bar(sb, adv - sb, XH * 0.96, w.bar)), adv


def g_f(w):
    sb = w.sb_flat - 30
    adv = sb * 2 + 320
    x = sb + 92
    r = 134
    # Circle centred at x + r, so its LEFT extreme continues the stem's left
    # edge exactly. Keep the top-left quarter: that is the f hook.
    hook = diff(ring(x + r, ASC - r, r, r, w.stem * 0.95),
                rect(-BIG, -BIG, BIG, ASC - r), rect(x + r, -BIG, BIG, BIG))
    return union(stem(x, 0, ASC - r, w.stem), hook,
                 bar(sb, adv - sb, XH * 0.96, w.bar)), adv


def g_r(w):
    sb = w.sb_flat - 6
    adv = sb * 2 + 290
    r = 150
    cx = sb + w.stem + r - w.stem
    sh = diff(ring(cx, XH + OVER - r, r, r, w.stem * 0.97),
              rect(-BIG, -BIG, BIG, XH + OVER - r), rect(-BIG, -BIG, sb + w.stem, BIG))
    return union(stem(sb, 0, XH, w.stem), sh), adv


def g_g(w):
    """Single-storey — the geometric choice, and it keeps the descender clean."""
    sb = w.sb_flat - 6
    adv = sb * 2 + 440
    rx = (adv - sb * 2) / 2
    cx = sb + rx
    x = adv - sb - w.stem
    b = ring(cx, XH / 2, rx, XH / 2 + OVER, w.stem * 0.97)
    tail_r = (x + w.stem - sb) / 2
    tail = diff(ring(sb + tail_r, DESC + tail_r * 0.86, tail_r, tail_r * 0.86,
                     w.stem * 0.97), rect(-BIG, DESC + tail_r * 0.86, BIG, BIG))
    tail = diff(tail, rect(x, -BIG, BIG, BIG))
    return union(b, stem(x, DESC + tail_r * 0.86, XH, w.stem), tail), adv


def g_v(w):
    sb = w.sb_flat - 30
    adv = sb * 2 + 420
    a = diagonal(sb + w.stem / 2, XH, adv / 2, -6, w.stem * 0.97)
    b = diagonal(adv - sb - w.stem / 2, XH, adv / 2, -6, w.stem * 0.97)
    body = flat_apex(union(a, b), 0, above=False)
    return diff(body, rect(-BIG, XH, BIG, BIG)), adv


def g_w(w):
    sb = w.sb_flat - 34
    adv = sb * 2 + 620
    inner = adv / 2
    q = (inner - sb) / 2
    t = w.stem * 0.95
    parts = [
        diagonal(sb + t / 2, XH, sb + q + t * 0.1, -6, t),
        diagonal(inner, XH, sb + q + t * 0.1, -6, t),
        diagonal(inner, XH, adv - sb - q - t * 0.1, -6, t),
        diagonal(adv - sb - t / 2, XH, adv - sb - q - t * 0.1, -6, t),
    ]
    body = flat_apex(union(*parts), 0, above=False)
    return diff(body, rect(-BIG, XH, BIG, BIG)), adv


def g_x(w):
    sb = w.sb_flat - 20
    adv = sb * 2 + 400
    a = diagonal(sb + w.stem / 2, XH, adv - sb - w.stem / 2, 0, w.stem * 0.97)
    b = diagonal(adv - sb - w.stem / 2, XH, sb + w.stem / 2, 0, w.stem * 0.97)
    return diff(union(a, b), rect(-BIG, XH, BIG, BIG), rect(-BIG, -BIG, BIG, 0)), adv


def g_y(w):
    sb = w.sb_flat - 26
    adv = sb * 2 + 420
    j = XH * 0.30
    a = diagonal(sb + w.stem / 2, XH, adv / 2, j, w.stem * 0.97)
    b = diagonal(adv - sb - w.stem / 2, XH, adv / 2, j, w.stem * 0.97)
    v = diff(union(a, b), rect(-BIG, XH, BIG, BIG), rect(-BIG, -BIG, BIG, j))
    tail = diagonal(adv / 2 + w.stem * 0.1, j + 4, adv / 2 - 80, DESC, w.stem * 0.97)
    tail = diff(tail, rect(-BIG, -BIG, BIG, DESC))
    return union(v, tail), adv


def g_z(w):
    sb = w.sb_flat - 14
    adv = sb * 2 + 390
    d = diagonal(adv - sb - w.stem * 0.3, XH, sb + w.stem * 0.3, 0, w.stem * 1.02)
    d = diff(d, rect(-BIG, XH - w.bar, BIG, BIG), rect(-BIG, -BIG, BIG, w.bar))
    return union(rect(sb, XH - w.bar, adv - sb, XH), rect(sb, 0, adv - sb, w.bar), d), adv


def g_k(w):
    sb = w.sb_flat - 6
    adv = sb * 2 + 400
    j = XH * 0.42
    up = diagonal(sb + w.stem, j, adv - sb - w.stem * 0.2, XH, w.stem * 0.97)
    lo = diagonal(sb + w.stem, j, adv - sb - w.stem * 0.2, 0, w.stem * 0.97)
    arms = diff(union(up, lo), rect(-BIG, XH, BIG, BIG), rect(-BIG, -BIG, BIG, 0),
                rect(-BIG, -BIG, sb + w.stem, BIG))
    return union(stem(sb, 0, ASC, w.stem), arms), adv


# ---- Figures — SIGNATURE 4 ----------------------------------------------
# Tabular by default: every figure shares one advance width, so numbers in a
# table or a price align without `font-variant-numeric`.

def _fig_adv(w):
    return int(w.sb_round * 2 + 440)


def g_zero(w):
    """SIGNATURE 4 — the node in the counter. 'Uno Digit', literally."""
    adv = _fig_adv(w)
    cx = adv / 2
    rx = (adv - w.sb_round * 2) / 2
    r = ring(cx, FIG / 2, rx, FIG / 2 + OVER, w.stem)
    return union(r, node_square(cx, FIG / 2, w.node * 0.92)), adv


def g_one(w):
    """SIGNATURE 4 — a full flat foot. Confident, unmistakably 'one'."""
    adv = _fig_adv(w)
    x = (adv - w.stem) / 2 + 16
    flag = diagonal(x + w.stem * 0.2, FIG - 8, x - 94, FIG - 128, w.bar)
    flag = diff(flag, rect(-BIG, FIG, BIG, BIG))
    return union(stem(x, 0, FIG, w.stem), flag,
                 rect(x - 120, 0, x + w.stem + 120, w.bar)), adv


def g_two(w):
    adv = _fig_adv(w)
    sb = w.sb_round
    rx = (adv - sb * 2) / 2
    cx = adv / 2
    ry = FIG * 0.29
    cy = FIG + OVER - ry
    top = diff(ring(cx, cy, rx, ry, w.stem), rect(-BIG, -BIG, BIG, cy))
    # The diagonal starts exactly where the arc ends, so the stroke is continuous.
    d = diagonal(cx + rx - w.stem / 2, cy, sb + w.stem * 0.55, w.bar, w.stem)
    d = diff(d, rect(-BIG, -BIG, BIG, w.bar), rect(-BIG, cy, BIG, BIG))
    return union(top, d, rect(sb, 0, adv - sb, w.bar)), adv


def g_three(w):
    adv = _fig_adv(w)
    sb = w.sb_round
    rx = (adv - sb * 2) / 2
    cx = adv / 2
    ryU, ryL = FIG * 0.27, FIG * 0.30
    up = diff(ring(cx, FIG + OVER - ryU, rx, ryU, w.stem), wedge(cx, FIG + OVER - ryU, 168, 300))
    lo = diff(ring(cx, -OVER + ryL, rx, ryL, w.stem), wedge(cx, -OVER + ryL, 60, 192))
    mid = rect(cx - rx * 0.45, FIG * 0.5 - w.bar / 2, cx + rx * 0.55, FIG * 0.5 + w.bar / 2)
    return union(up, lo, mid), adv


def g_four(w):
    adv = _fig_adv(w)
    sb = w.sb_round
    x = adv - sb - w.stem - 40
    d = diagonal(x + w.stem * 0.4, FIG, sb + 4, FIG * 0.28 + w.bar, w.stem * 0.94)
    d = diff(d, rect(-BIG, FIG, BIG, BIG), rect(-BIG, -BIG, BIG, FIG * 0.28))
    return union(stem(x, 0, FIG, w.stem), d,
                 rect(sb, FIG * 0.28, adv - sb + 6, FIG * 0.28 + w.bar)), adv


def g_five(w):
    adv = _fig_adv(w)
    sb = w.sb_round
    rx = (adv - sb * 2) / 2
    cx = adv / 2
    ry = FIG * 0.31
    lo = diff(ring(cx, -OVER + ry, rx, ry, w.stem), wedge(cx, -OVER + ry, 74, 190))
    return union(lo, stem(sb, FIG * 0.42, FIG - w.bar, w.stem),
                 rect(sb, FIG - w.bar, adv - sb - 20, FIG),
                 rect(sb, FIG * 0.42, cx + 10, FIG * 0.42 + w.bar)), adv


def g_six(w):
    adv = _fig_adv(w)
    sb = w.sb_round
    rx = (adv - sb * 2) / 2
    cx = adv / 2
    ry = FIG * 0.31
    b = ring(cx, -OVER + ry, rx, ry, w.stem)
    arc = diff(ring(cx, FIG - ry * 1.35, rx, ry * 1.35, w.stem), rect(cx, -BIG, BIG, BIG))
    return union(b, diff(arc, rect(-BIG, -BIG, BIG, -OVER + ry))), adv


def g_nine(w):
    adv = _fig_adv(w)
    sb = w.sb_round
    rx = (adv - sb * 2) / 2
    cx = adv / 2
    ry = FIG * 0.31
    b = ring(cx, FIG + OVER - ry, rx, ry, w.stem)
    arc = diff(ring(cx, ry * 1.35, rx, ry * 1.35, w.stem), rect(-BIG, -BIG, cx, BIG))
    return union(b, diff(arc, rect(-BIG, FIG + OVER - ry, BIG, BIG))), adv


def g_seven(w):
    adv = _fig_adv(w)
    sb = w.sb_round
    d = diagonal(adv - sb - 30, FIG - w.bar, sb + 90, 0, w.stem)
    d = diff(d, rect(-BIG, FIG - w.bar, BIG, BIG), rect(-BIG, -BIG, BIG, 0))
    return union(rect(sb, FIG - w.bar, adv - sb, FIG), d), adv


def g_eight(w):
    adv = _fig_adv(w)
    sb = w.sb_round
    rx = (adv - sb * 2) / 2
    cx = adv / 2
    ryU, ryL = FIG * 0.265, FIG * 0.30
    return union(ring(cx, FIG + OVER - ryU, rx * 0.92, ryU, w.stem * 0.95),
                 ring(cx, -OVER + ryL, rx, ryL, w.stem)), adv


# ---- Punctuation — every dot is a square --------------------------------

def g_period(w):
    adv = int(w.sb_flat * 2 + w.node * 0.5)
    return node_square(adv / 2, w.node / 2, w.node), adv


def g_comma(w):
    adv = int(w.sb_flat * 2 + w.node * 0.5)
    cx = adv / 2
    d = node_square(cx, w.node / 2, w.node)
    tail = poly((cx - w.node / 2, w.node / 2), (cx + w.node / 2, w.node / 2),
                (cx - w.node * 0.15, -w.node * 1.25))
    return union(d, tail), adv


def g_colon(w):
    adv = int(w.sb_flat * 2 + w.node * 0.5)
    return union(node_square(adv / 2, w.node / 2, w.node),
                 node_square(adv / 2, XH - w.node / 2, w.node)), adv


def g_semicolon(w):
    c, adv = g_comma(w)
    return union(c, node_square(adv / 2, XH - w.node / 2, w.node)), adv


def g_exclam(w):
    adv = int(w.sb_flat * 2 + w.stem)
    x = adv / 2
    return union(node_square(x, w.node / 2, w.node),
                 poly((x - w.stem / 2, CAP), (x + w.stem / 2, CAP),
                      (x + w.stem * 0.34, w.node * 1.5), (x - w.stem * 0.34, w.node * 1.5))), adv


def g_question(w):
    sb = w.sb_round
    adv = sb * 2 + 290
    cx = adv / 2
    rx = (adv - sb * 2) / 2
    ry = CAP * 0.25
    cy = CAP + OVER - ry
    arc = diff(ring(cx, cy, rx, ry, w.stem), rect(-BIG, -BIG, BIG, cy))
    drop = rect(cx + rx - w.stem, cy - ry * 0.42, cx + rx, cy)
    join = diagonal(cx + rx - w.stem / 2, cy - ry * 0.34, cx, CAP * 0.34, w.stem)
    join = diff(join, rect(-BIG, -BIG, BIG, CAP * 0.34),
                rect(-BIG, cy - ry * 0.34, BIG, BIG))
    stub = rect(cx - w.stem / 2, CAP * 0.30, cx + w.stem / 2, CAP * 0.36)
    return union(arc, drop, join, stub, node_square(cx, w.node / 2, w.node)), adv


def g_hyphen(w):
    """Width must be several times the bar's thickness, or the glyph reads as
    a middle dot rather than a dash. 130 units against a 74-unit bar did."""
    adv = int(w.sb_flat * 2 + 250)
    return bar(w.sb_flat, adv - w.sb_flat, XH * 0.48, w.bar), adv


def g_endash(w):
    adv = 500
    return bar(60, adv - 60, XH * 0.50, w.bar), adv


def g_emdash(w):
    adv = 800
    return bar(40, adv - 40, XH * 0.50, w.bar), adv


def g_slash(w):
    adv = int(w.sb_flat * 2 + 200)
    d = diagonal(adv - w.sb_flat, CAP + 40, w.sb_flat, DESC, w.stem * 0.94)
    return diff(d, rect(-BIG, CAP + 40, BIG, BIG), rect(-BIG, -BIG, BIG, DESC)), adv


def g_parenleft(w):
    adv = int(w.sb_flat * 2 + 120)
    cx = adv - w.sb_flat * 0.4
    r = diff(ring(cx, CAP * 0.42, 200, CAP * 0.72, w.stem * 0.9),
             rect(cx, -BIG, BIG, BIG))
    return r, adv


def g_parenright(w):
    adv = int(w.sb_flat * 2 + 120)
    cx = w.sb_flat * 0.4
    r = diff(ring(cx, CAP * 0.42, 200, CAP * 0.72, w.stem * 0.9),
             rect(-BIG, -BIG, cx, BIG))
    return r, adv


def g_quotesingle(w):
    adv = int(w.sb_flat * 2 + w.stem)
    x = adv / 2
    return rect(x - w.stem * 0.42, CAP - 190, x + w.stem * 0.42, CAP), adv


def g_quotedbl(w):
    adv = int(w.sb_flat * 2 + w.stem * 2.4)
    g = w.stem * 1.3
    return union(rect(adv / 2 - g / 2 - w.stem * 0.42, CAP - 190,
                      adv / 2 - g / 2 + w.stem * 0.42, CAP),
                 rect(adv / 2 + g / 2 - w.stem * 0.42, CAP - 190,
                      adv / 2 + g / 2 + w.stem * 0.42, CAP)), adv


def g_ampersand(w):
    """Two stacked bowls on one axis with a leg thrown out to the right —
    the geometric ampersand. The small upper bowl sits directly above the
    larger lower one so the waist joins on the centre line."""
    sb = w.sb_round
    adv = sb * 2 + 500
    t = w.stem * 0.95
    rU = 132
    rL = 186
    cx = sb + rL
    cyU = CAP + OVER - rU
    cyL = -OVER + rL
    # BOTH bowls must open, or the pair reads as a stacked 8 rather than an &.
    upper = diff(ring(cx, cyU, rU, rU, t), wedge(cx, cyU, 268, 344))
    lower = diff(ring(cx, cyL, rL, rL, t), wedge(cx, cyL, -14, 58))
    # The leg leaves the lower bowl where the wedge opened it.
    leg = diagonal(cx + rL * 0.42, cyL + rL * 0.62, adv - sb - t * 0.4, 0, t)
    leg = diff(leg, rect(-BIG, -BIG, BIG, 0), rect(-BIG, cyL + rL * 0.62, BIG, BIG))
    return union(upper, lower, leg), adv


def g_at(w):
    sb = w.sb_round
    adv = sb * 2 + 620
    cx = adv / 2
    t = w.stem * 0.78
    cy = CAP * 0.46
    outer = diff(ring(cx, cy, 296, 330, t), wedge(cx, cy, -86, -16))
    inner = ring(cx - 24, cy, 116, 124, t)          # near-circular, not an ellipse
    tick = rect(cx + 92, cy - 124, cx + 92 + t, cy + 96)
    return union(outer, inner, tick), adv


def g_percent(w):
    """Even the percent bowls are node-square-adjacent: strict circles, flat cut."""
    sb = w.sb_round
    adv = sb * 2 + 560
    r = 108
    t = w.stem * 0.82
    a = ring(sb + r, CAP - r, r, r, t)
    b = ring(adv - sb - r, r, r, r, t)
    d = diagonal(adv - sb - 60, CAP + 20, sb + 60, -20, w.stem * 0.9)
    d = diff(d, rect(-BIG, CAP + 20, BIG, BIG), rect(-BIG, -BIG, BIG, -20))
    return union(a, b, d), adv


def g_plus(w):
    adv = int(w.sb_flat * 2 + 320)
    cy = CAP * 0.42
    return union(bar(w.sb_flat, adv - w.sb_flat, cy, w.bar),
                 rect(adv / 2 - w.bar / 2, cy - 160, adv / 2 + w.bar / 2, cy + 160)), adv


def g_equal(w):
    adv = int(w.sb_flat * 2 + 320)
    cy = CAP * 0.42
    return union(bar(w.sb_flat, adv - w.sb_flat, cy + 78, w.bar),
                 bar(w.sb_flat, adv - w.sb_flat, cy - 78, w.bar)), adv


def g_space(w):
    return _path(), int(w.sb_flat * 2 + 120)


# --------------------------------------------------------------------------
# The character set. Order is the glyph order in the built font.
# --------------------------------------------------------------------------

GLYPHS: dict[str, tuple[str, callable]] = {
    "space": (" ", g_space),
    **{f"{c}": (c, globals()[f"g_{c}"]) for c in "HILTEFOQCGDPBRSUJAVWMNKXYZ"},
    **{f"{c}": (c, globals()[f"g_{c}"]) for c in "ocenmhubdpqasijltfrgvwxyzk"},
    "zero": ("0", g_zero), "one": ("1", g_one), "two": ("2", g_two),
    "three": ("3", g_three), "four": ("4", g_four), "five": ("5", g_five),
    "six": ("6", g_six), "seven": ("7", g_seven), "eight": ("8", g_eight),
    "nine": ("9", g_nine),
    "period": (".", g_period), "comma": (",", g_comma), "colon": (":", g_colon),
    "semicolon": (";", g_semicolon), "exclam": ("!", g_exclam),
    "question": ("?", g_question), "hyphen": ("-", g_hyphen),
    "endash": ("–", g_endash), "emdash": ("—", g_emdash),
    "slash": ("/", g_slash), "parenleft": ("(", g_parenleft),
    "parenright": (")", g_parenright), "quotesingle": ("'", g_quotesingle),
    "quotedbl": ('"', g_quotedbl), "ampersand": ("&", g_ampersand),
    "at": ("@", g_at), "percent": ("%", g_percent), "plus": ("+", g_plus),
    "equal": ("=", g_equal),
}
