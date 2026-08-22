#!/usr/bin/env python3
"""
The shared style layer for every piece of printed and social artwork.

WHY THE FONTS ARE BASE64-INLINED
The artwork is rendered by headless Chrome from a file:// URL. Chrome applies
file-origin restrictions to subresources, so a @font-face pointing at a sibling
.woff2 silently falls back — and a silent font fallback in a PRINT file is the
worst kind of bug: the PDF looks fine on screen, goes to a printer, and comes
back as a banner set in Helvetica. Inlining the faces as data: URIs makes each
artwork file self-contained and removes the failure mode entirely. It is the
same reasoning that put the brand face inline in the bot's admin dashboard.

WHAT IS DELIBERATELY *NOT* CARRIED OVER FROM globals.css
  size-adjust: 93.02%   On the web that number is load-bearing: it matches Uno
                        Sans's x-height to SF Pro's so Apple devices see no
                        shift on font swap. In print there is no SF Pro to
                        match and no swap to survive — all it would do is set
                        the whole banner 7% smaller than specified and cost
                        real stature at two metres. Omitted on purpose.
  backdrop-filter       There is no "behind" on vinyl, and Chrome's
                        print-to-PDF path does not rasterise it reliably. The
                        glass panels below are baked instead: tint + specular
                        top edge + hairline rim + depth shadow, which is what
                        glass looks like once it is frozen onto a surface.
  the light theme       All collateral is dark. A pull-up banner lives under
                        exhibition lighting where a white field is a glare
                        panel, and the brand's cyan/violet read far better as
                        emitted light than as ink on white.
"""
from __future__ import annotations
import base64, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
WEB = ROOT.parent / "apps" / "web"
FONTS = WEB / "public" / "fonts"
BRAND = json.loads((ROOT / "brand.json").read_text())
C = BRAND["color"]


def _face(path: pathlib.Path, family: str, weight: str, style: str = "normal") -> str:
    b64 = base64.b64encode(path.read_bytes()).decode()
    return (f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2');font-display:block}}")


def fonts_css() -> str:
    out = [
        _face(FONTS / "uno-display-400.woff2", "Uno Display", "400"),
        _face(FONTS / "uno-display-500.woff2", "Uno Display", "500"),
        _face(FONTS / "uno-display-700.woff2", "Uno Display", "700"),
        _face(FONTS / "uno-sans-latin.woff2", "Uno Sans", "100 900"),
    ]
    return "".join(out)


def logo_svg(size: str, mono: str | None = None) -> str:
    L = BRAND["logo"]
    stroke = mono or L["strokeColor"]
    node = mono or L["nodeColor"]
    circles = "".join(
        f'<circle cx="{c["cx"]}" cy="{c["cy"]}" r="{c["r"]}" fill="{node}"/>' for c in L["nodes"])
    return (f'<svg viewBox="{L["viewBox"]}" style="width:{size};height:{size};display:block" '
            f'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
            f'<path d="{L["strokePath"]}" fill="none" stroke="{stroke}" '
            f'stroke-width="{L["strokeWidth"]}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'{circles}</svg>')


BASE = f"""
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
html,body{{
  background:{C['nearBlack']};
  color:#fff;
  font-family:'Uno Sans',system-ui,sans-serif;
  font-feature-settings:'ss01' 0;
  -webkit-font-smoothing:antialiased;
  text-rendering:geometricPrecision;
}}
.sheet{{position:relative;overflow:hidden;background:{C['nearBlack']}}}

/* ── Gradient mesh ────────────────────────────────────────────────────────
   Two blurred radial pools in the logo's two hues, sitting under the content
   as light rather than as decoration — the same construction as the site's
   <GradientMesh>. Each pool fades to a ZERO-ALPHA COPY OF ITS OWN COLOUR, not
   to `transparent`: the `transparent` keyword is rgba(0,0,0,0), so
   interpolating toward it drags grey through the gradient's midpoint and the
   wash reads as a smudge. Fading alpha alone keeps the hue clean end to end.
   -------------------------------------------------------------------------- */
.mesh{{position:absolute;inset:0;pointer-events:none;overflow:hidden}}
.mesh i{{position:absolute;border-radius:50%;display:block;filter:blur(var(--mesh-blur,90px))}}
.mesh .a{{background:radial-gradient(circle,rgba(6,182,212,.55),rgba(6,182,212,0) 70%)}}
.mesh .b{{background:radial-gradient(circle,rgba(139,92,246,.50),rgba(139,92,246,0) 70%)}}
.mesh .c{{background:radial-gradient(circle,rgba(30,214,246,.28),rgba(30,214,246,0) 70%)}}

/* ── Baked glass ──────────────────────────────────────────────────────────
   Four optical layers, none of which need a live backdrop: a tint, a specular
   highlight along the top edge (::before), a hairline rim, and a depth shadow.
   The specular edge is the layer people skip, and it is the one that makes a
   panel read as a lit material instead of a grey box.
   -------------------------------------------------------------------------- */
.glass{{
  position:relative;
  background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.035));
  border:1px solid rgba(255,255,255,.14);
  box-shadow:0 2em 6em rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.22);
}}
.glass::before{{
  content:'';position:absolute;left:8%;right:8%;top:0;height:1px;
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.75),rgba(255,255,255,0));
}}

/* ── Type roles ───────────────────────────────────────────────────────────
   Tracking TIGHTENS as size grows; leading LOOSENS as size shrinks. Because
   letter-spacing is in `em`, each role's value scales with whatever size the
   layout sets, and the role bands encode the optical curve. A single global
   letter-spacing is the loudest non-Apple tell there is.
   -------------------------------------------------------------------------- */
.t-display{{font-family:'Uno Display',serif;font-weight:700;letter-spacing:-.035em;line-height:.97}}
.t-title  {{font-family:'Uno Display',serif;font-weight:500;letter-spacing:-.022em;line-height:1.06}}
.t-lead   {{font-weight:400;letter-spacing:-.011em;line-height:1.32;color:rgba(235,235,245,.86)}}
.t-body   {{font-weight:400;letter-spacing:-.003em;line-height:1.45;color:rgba(235,235,245,.72)}}
.t-eyebrow{{font-weight:600;letter-spacing:.14em;text-transform:uppercase;line-height:1}}
.t-num    {{font-family:'Uno Display',serif;font-weight:700;letter-spacing:-.03em;line-height:1;
            font-variant-numeric:tabular-nums}}
.ink-cyan {{color:{C['cyan400']}}}
.ink-vio  {{color:{C['violet300']}}}
.grad-ink {{background:linear-gradient(100deg,{C['cyan400']},{C['violet300']});
            -webkit-background-clip:text;background-clip:text;color:transparent}}
.dim      {{color:rgba(235,235,245,.60)}}
.rule     {{background:linear-gradient(90deg,{C['cyan500']},{C['violet400']},rgba(139,92,246,0))}}
"""


def css() -> str:
    return fonts_css() + BASE


if __name__ == "__main__":
    print(f"{len(css())/1024:.0f} KB of inlined CSS ({len(fonts_css())/1024:.0f} KB fonts)")
